import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import {
  PAYOUT_PURPOSE_CODES, COUNTERPARTY_CATEGORIES,
  fetchMerchantCounterparties, executeCreateCounterparty, executeUpdateCounterparty, executeDeactivateCounterparty,
  executeSinglePayout, executeBatchPayout,
  computePayoutMetadataHash, fmtUsdc, formatTs,
} from '../utils/payout.js'
import { ARCSCAN_BASE, isMerchantPayoutsConfigured, ARC_MERCHANT_PAYOUTS_ADDRESS } from '../config.js'

const DISCLAIMER = 'Use aliases only. Do not store personal, payroll, tax or confidential information on-chain.'

function Field({ label, value, onChange, placeholder, type = 'text', required, hint }) {
  return (
    <div>
      <label className="label">{label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
      {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

function SelectField({ label, value, onChange, options, required }) {
  return (
    <div>
      <label className="label">{label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}</label>
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Select...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

export default function MerchantPayoutPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isMerchantPayoutsConfigured()

  const [tab,           setTab]           = useState('single')   // 'single' | 'batch' | 'counterparties'
  const [counterparties, setCounterparties] = useState([])
  const [loadingCps,    setLoadingCps]    = useState(false)
  const [submitting,    setSubmitting]    = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState(null)

  // Counterparty form
  const [cpAlias,       setCpAlias]       = useState('')
  const [cpCategory,    setCpCategory]    = useState('Supplier')
  const [cpWallet,      setCpWallet]      = useState('')
  const [editingCpId,   setEditingCpId]   = useState(null)

  // Single payout
  const [singleCp,      setSingleCp]      = useState('')   // counterpartyId or ''
  const [singleWallet,  setSingleWallet]  = useState('')
  const [singleAmount,  setSingleAmount]  = useState('')
  const [singleRef,     setSingleRef]     = useState('')
  const [singleDesc,    setSingleDesc]    = useState('')
  const [singlePurpose, setSinglePurpose] = useState('SUPPLIER')

  // Batch payout
  const [batchRef,      setBatchRef]      = useState('')
  const [batchPurpose,  setBatchPurpose]  = useState('SUPPLIER')
  const [batchRows,     setBatchRows]     = useState([
    { counterpartyId: '', recipient: '', amount: '', paymentRef: '', description: '' },
  ])

  useEffect(() => {
    if (!isConnected || !address || !configured) return
    loadCounterparties()
  }, [isConnected, address, configured])

  async function loadCounterparties() {
    setLoadingCps(true)
    try {
      const list = await fetchMerchantCounterparties(address)
      setCounterparties(list)
    } catch (e) { console.error(e) }
    finally { setLoadingCps(false) }
  }

  async function handleCreateCounterparty(e) {
    e?.preventDefault?.()
    setError(''); setSuccess(null); setSubmitting(true)
    try {
      if (!cpAlias.trim())  throw new Error('Alias required')
      if (!cpWallet.trim()) throw new Error('Wallet required')
      const metadataHash = computePayoutMetadataHash(cpAlias, cpCategory)

      if (editingCpId) {
        await executeUpdateCounterparty(address, editingCpId, {
          wallet: cpWallet.trim(),
          aliasName: cpAlias.trim(),
          category: cpCategory,
          metadataHash,
          active: true,
        })
        setSuccess({ type: 'counterparty', message: `Counterparty ${cpAlias.trim()} updated.` })
      } else {
        await executeCreateCounterparty(address, {
          wallet: cpWallet.trim(),
          aliasName: cpAlias.trim(),
          category: cpCategory,
          metadataHash,
        })
        setSuccess({ type: 'counterparty', message: `Counterparty ${cpAlias.trim()} created.` })
      }

      setCpAlias(''); setCpWallet(''); setCpCategory('Supplier'); setEditingCpId(null)
      await loadCounterparties()
    } catch (e) { setError(e?.shortMessage || e?.message || String(e)) }
    finally { setSubmitting(false) }
  }

  function handleEditCounterparty(cp) {
    setError(''); setSuccess(null)
    setEditingCpId(cp.id)
    setCpAlias(cp.aliasName || '')
    setCpCategory(cp.category || 'Supplier')
    setCpWallet(cp.wallet || '')
    setTab('counterparties')
  }

  function handleCancelCounterpartyEdit() {
    setEditingCpId(null)
    setCpAlias('')
    setCpWallet('')
    setCpCategory('Supplier')
  }

  async function handleDeactivate(cpId) {
    setError(''); setSubmitting(true)
    try {
      await executeDeactivateCounterparty(address, cpId)
      await loadCounterparties()
    } catch (e) { setError(e?.shortMessage || e?.message || String(e)) }
    finally { setSubmitting(false) }
  }

  async function handleSinglePayout(e) {
    e?.preventDefault?.()
    setError(''); setSuccess(null); setSubmitting(true)
    try {
      const cp = counterparties.find(c => c.id === singleCp)
      const recipient = cp ? cp.wallet : singleWallet.trim()
      if (!recipient)                 throw new Error('Recipient required')
      if (!singleAmount || parseFloat(singleAmount) <= 0) throw new Error('Amount must be > 0')
      if (!singleRef.trim())          throw new Error('Payment ref required')
      if (!singleDesc.trim())         throw new Error('Description required')
      const metadataHash = computePayoutMetadataHash(singleRef, singleDesc, singlePurpose)

      const { hash, payoutId } = await executeSinglePayout(address, {
        recipient, amount: singleAmount,
        paymentRef: singleRef.trim(), description: singleDesc.trim(),
        purposeCode: singlePurpose, metadataHash,
        counterpartyId: cp ? cp.id : 0,
      })
      setSuccess({ type: 'single', hash, payoutId, recipient, amount: singleAmount, paymentRef: singleRef })
      setSingleCp(''); setSingleWallet(''); setSingleAmount(''); setSingleRef(''); setSingleDesc('')
    } catch (e) { setError(e?.shortMessage || e?.message || String(e)) }
    finally { setSubmitting(false) }
  }

  async function handleBatchPayout(e) {
    e?.preventDefault?.()
    setError(''); setSuccess(null); setSubmitting(true)
    try {
      if (!batchRef.trim()) throw new Error('Batch ref required')
      const rows = batchRows.map(r => {
        const cp = counterparties.find(c => c.id === r.counterpartyId)
        return {
          counterpartyId: cp ? cp.id : 0,
          recipient:      cp ? cp.wallet : r.recipient.trim(),
          amount:         r.amount,
          paymentRef:     r.paymentRef.trim(),
          description:    r.description.trim(),
        }
      })
      for (const r of rows) {
        if (!r.recipient)            throw new Error('Recipient required on all rows')
        if (!r.amount || parseFloat(r.amount) <= 0) throw new Error('Amount > 0 required on all rows')
        if (!r.paymentRef)           throw new Error('Payment ref required on all rows')
        if (!r.description)          throw new Error('Description required on all rows')
      }
      const metadataHash = computePayoutMetadataHash(batchRef, batchPurpose)
      const { hash, payoutIds } = await executeBatchPayout(address, {
        rows, batchRef: batchRef.trim(), purposeCode: batchPurpose, metadataHash,
      })
      const total = rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0)
      setSuccess({ type: 'batch', hash, payoutIds, batchRef, count: rows.length, total })
      setBatchRef(''); setBatchRows([{ counterpartyId: '', recipient: '', amount: '', paymentRef: '', description: '' }])
    } catch (e) { setError(e?.shortMessage || e?.message || String(e)) }
    finally { setSubmitting(false) }
  }

  function addBatchRow() {
    if (batchRows.length >= 20) return
    setBatchRows([...batchRows, { counterpartyId: '', recipient: '', amount: '', paymentRef: '', description: '' }])
  }
  function removeBatchRow(i) {
    setBatchRows(batchRows.filter((_, idx) => idx !== i))
  }
  function updateBatchRow(i, key, val) {
    const next = [...batchRows]; next[i] = { ...next[i], [key]: val }; setBatchRows(next)
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)', fontSize: 14 }}>
        Merchant Payouts contract not configured. Deploy <code>ArcMerchantPayouts.sol</code> and update <code>src/config.js</code>.
      </p>
    </div>
  )

  if (!isConnected) return (
    <div className="card fade-up" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>💸</div>
      <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, marginBottom: 8 }}>Send USDC Payouts</h2>
      <p style={{ color: 'var(--text2)', marginBottom: 20, fontSize: 13 }}>
        Connect your merchant wallet to send USDC payouts to suppliers, contractors or team wallets.
      </p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  const activeCps = counterparties.filter(c => c.active)
  const cpOptions = activeCps.map(c => ({ value: c.id, label: `${c.aliasName} · ${c.category}` }))

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Send USDC Payouts
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>
          On-chain USDC payouts to suppliers, contractors or team wallets. Single or batch. Alias-based counterparty registry.
        </p>
      </div>

      {/* Privacy disclaimer */}
      <div className="card" style={{ background: '#1a1200', border: '1px solid #f0c04044', padding: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--yellow)', fontWeight: 600 }}>⚠️ {DISCLAIMER}</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['single',         '💸 Single Payout'],
          ['batch',          '📦 Batch Payout'],
          ['counterparties', '🏷 Counterparties'],
        ].map(([k, label]) => (
          <button key={k} onClick={() => { setTab(k); setSuccess(null); setError('') }}
            className={tab === k ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 13, padding: '7px 14px' }}>
            {label}
          </button>
        ))}
      </div>

      {error   && <div className="error-box"   style={{ marginBottom: 14 }}>{error}</div>}
      {success && (
        <div className="card" style={{ background: '#062814', border: '1px solid #22d47e44', padding: 14, marginBottom: 14 }}>
          <div style={{ color: 'var(--green)', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            ✅ {success.type === 'batch'
              ? `Batch sent · ${success.count} payouts · ${success.total.toFixed(2)} USDC`
              : success.type === 'counterparty'
                ? success.message
                : `Payout sent · ${success.amount} USDC`}
          </div>

          {success.hash && (
            <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--mono)', wordBreak: 'break-all', marginBottom: 6 }}>
              TX: {success.hash}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {success.hash && (
              <a href={`${ARCSCAN_BASE}/tx/${success.hash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>ArcScan ↗</button>
              </a>
            )}
            {success.type === 'single' && success.payoutId && (
              <Link to={`/payout/${success.payoutId}`} style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View receipt →</button>
              </Link>
            )}
            {success.type !== 'counterparty' && (
              <Link to="/payout-dashboard" style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Dashboard →</button>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* SINGLE PAYOUT */}
      {tab === 'single' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Single payout
          </div>
          <form onSubmit={handleSinglePayout} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <SelectField label="Counterparty (optional)" value={singleCp}
                onChange={setSingleCp} options={cpOptions} />
              <Field label="Or recipient wallet" value={singleWallet} onChange={setSingleWallet}
                placeholder="0x..." hint={singleCp ? 'Using selected alias' : ''} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Amount (USDC)" value={singleAmount} onChange={setSingleAmount} placeholder="100.00" required />
              <SelectField label="Purpose" value={singlePurpose} onChange={setSinglePurpose} options={PAYOUT_PURPOSE_CODES} required />
            </div>
            <Field label="Payment Ref" value={singleRef} onChange={setSingleRef} placeholder="e.g. INV-2025-001" required />
            <div>
              <label className="label">Description<span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span></label>
              <textarea value={singleDesc} onChange={e => setSingleDesc(e.target.value)} rows={2}
                placeholder="Short description (max 256 chars)" />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary" style={{ padding: '10px 20px' }}>
              {submitting ? <><span className="spinner" /> Sending...</> : '💸 Send Payout'}
            </button>
          </form>
        </div>
      )}

      {/* BATCH PAYOUT */}
      {tab === 'batch' && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Batch payout (max 20 rows)
          </div>
          <form onSubmit={handleBatchPayout} style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Batch Ref" value={batchRef} onChange={setBatchRef} placeholder="e.g. PAYROLL-2025-01" required />
              <SelectField label="Purpose (applies to all)" value={batchPurpose} onChange={setBatchPurpose} options={PAYOUT_PURPOSE_CODES} required />
            </div>

            {batchRows.map((row, i) => (
              <div key={i} className="card" style={{ padding: 12, background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>Row {i + 1}</div>
                  {batchRows.length > 1 && (
                    <button type="button" onClick={() => removeBatchRow(i)} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>✕ Remove</button>
                  )}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <SelectField label="Counterparty" value={row.counterpartyId}
                      onChange={v => updateBatchRow(i, 'counterpartyId', v)} options={cpOptions} />
                    <Field label="Or recipient wallet" value={row.recipient}
                      onChange={v => updateBatchRow(i, 'recipient', v)} placeholder="0x..." />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                    <Field label="Amount (USDC)" value={row.amount} onChange={v => updateBatchRow(i, 'amount', v)} placeholder="100.00" required />
                    <Field label="Payment Ref" value={row.paymentRef} onChange={v => updateBatchRow(i, 'paymentRef', v)} placeholder="INV-..." required />
                  </div>
                  <Field label="Description" value={row.description} onChange={v => updateBatchRow(i, 'description', v)} placeholder="Short description" required />
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={addBatchRow} disabled={batchRows.length >= 20} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                ➕ Add row ({batchRows.length}/20)
              </button>
              <button type="submit" disabled={submitting} className="btn-primary" style={{ padding: '10px 20px', marginLeft: 'auto' }}>
                {submitting ? <><span className="spinner" /> Sending batch...</> : `📦 Send Batch (${batchRows.length})`}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COUNTERPARTIES */}
      {tab === 'counterparties' && (
        <>
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {editingCpId ? 'Edit alias' : 'Create alias'}
            </div>
            <form onSubmit={handleCreateCounterparty} style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Alias name" value={cpAlias} onChange={setCpAlias} placeholder="SUPPLIER-001" required
                  hint="Use generic codes only (max 32 chars). No personal data." />
                <SelectField label="Category" value={cpCategory} onChange={setCpCategory} options={COUNTERPARTY_CATEGORIES} required />
              </div>
              <Field label="Wallet" value={cpWallet} onChange={setCpWallet} placeholder="0x..." required />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="submit" disabled={submitting} className="btn-primary" style={{ padding: '10px 20px', width: 'fit-content' }}>
                  {submitting
                    ? <><span className="spinner" /> {editingCpId ? 'Updating...' : 'Creating...'}</>
                    : editingCpId ? '💾 Update Alias' : '➕ Create Alias'}
                </button>
                {editingCpId && (
                  <button type="button" onClick={handleCancelCounterpartyEdit} disabled={submitting} className="btn-ghost" style={{ padding: '10px 20px', width: 'fit-content' }}>
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', justifyContent: 'space-between' }}>
              <span>Your counterparties ({counterparties.length})</span>
              <button onClick={loadCounterparties} className="btn-ghost" style={{ fontSize: 11, padding: '3px 10px' }}>↺ Refresh</button>
            </div>
            {loadingCps ? (
              <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20, fontSize: 13 }}>Loading...</div>
            ) : counterparties.length === 0 ? (
              <div style={{ color: 'var(--text3)', textAlign: 'center', padding: 20, fontSize: 13 }}>No counterparties yet.</div>
            ) : (
              counterparties.map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: c.active ? 'var(--text)' : 'var(--text3)' }}>
                      {c.aliasName} <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>· {c.category}</span>
                      {!c.active && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text3)' }}>(inactive)</span>}
                    </div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)', marginTop: 2 }}>{c.wallet}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>Created {formatTs(c.createdAt)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button onClick={() => handleEditCounterparty(c)} disabled={submitting} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                      Edit
                    </button>
                    {c.active && (
                      <button onClick={() => handleDeactivate(c.id)} disabled={submitting} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                        Deactivate
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
