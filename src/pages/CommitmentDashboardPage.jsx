import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import {
  fetchMerchantCommitmentIds, fetchCustomerCommitmentIds,
  fetchCommitment, cancelCommitment,
  COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL,
  getCachedCommitmentTxHash,
} from '../utils/commitment.js'
import { isValidAddress, shortAddress } from '../utils/wallet.js'
import { isCommitmentContractConfigured, ARCSCAN_BASE, isMerchantRegistryConfigured} from '../config.js'
import { downloadCommitmentCSV } from '../utils/commitmentCsv.js'
import { getMerchantByWallet } from '../utils/merchant.js'

function StatusBadge({ status, type }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600,
      background: (COMMITMENT_STATUS_COLOR[status] || 'var(--text3)') + '22',
      color: COMMITMENT_STATUS_COLOR[status] || 'var(--text3)',
      border: `1px solid ${(COMMITMENT_STATUS_COLOR[status] || 'var(--text3)')}44`,
    }}>
      {COMMITMENT_STATUS_LABEL[status] ?? status} · {COMMITMENT_TYPE_LABEL[type] ?? type}
    </span>
  )
}

export default function CommitmentDashboardPage({ account }) {
  const { address } = useAccount()
  const { open }    = useWeb3Modal()
  const configured  = isCommitmentContractConfigured()

  const [role,       setRole]       = useState('merchant')
  const [addrInput,  setAddrInput]  = useState('')
  const [addr,       setAddr]       = useState('')
  const [commitments, setCommitments] = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [cancelling, setCancelling] = useState(null)

  useEffect(() => {
    if (address && !addr) { setAddrInput(address); setAddr(address) }
  }, [address])

  useEffect(() => { if (addr) load(addr) }, [addr, role])

  async function load(a) {
    if (!isValidAddress(a)) return setError('Invalid address')
    setLoading(true); setError(''); setCommitments([])
    try {
      const ids = role === 'merchant'
        ? await fetchMerchantCommitmentIds(a)
        : await fetchCustomerCommitmentIds(a)
      const list = []
      for (const id of [...ids].reverse()) {
        const c = await fetchCommitment(id)
        if (c) { c.txHash = getCachedCommitmentTxHash(id); list.push(c) }
      }
      // Build merchant profile cache
      const merchantProfileCache = {}
      if (isMerchantRegistryConfigured()) {
        const uniqueM = [...new Set(list.map(c => (c?.merchant || '')).filter(Boolean))]
        await Promise.all(uniqueM.map(async mw => {
          try {
            const m = await getMerchantByWallet(mw)
            if (m && m.active) merchantProfileCache[mw.toLowerCase()] = m
          } catch {}
        }))
      }
      // Enrich with merchant profile
      const enriched = list.map(c => {
        const mp = merchantProfileCache[(c?.merchant || '').toLowerCase()]
        return {
          ...c,
          merchantName:      mp?.tradingName || '',
          merchantLegalName: mp?.legalName   || '',
          merchantCountry:   mp?.country     || '',
        }
      })
      setCommitments(enriched)
    } catch { setError('Failed to load. Are you on Arc Testnet?') }
    finally { setLoading(false) }
  }

  async function handleCancel(commitmentId) {
    if (!address) return open()
    setCancelling(commitmentId)
    try {
      await cancelCommitment(address, commitmentId)
      await load(addr)
    } catch (e) { setError(e.message || 'Cancel failed') }
    finally { setCancelling(null) }
  }

  const now      = Math.floor(Date.now() / 1000)
  const active   = commitments.filter(c => c.status === 0)
  const pending  = active.filter(c => now < (c.dueDate || c.trancheDueDates?.[0] || 0))
  const overdue  = active.filter(c => now >= (c.deadline || c.trancheDeadlines?.[c.tranchesPaidCount] || 0))
  const fulfilled = commitments.filter(c => c.status === 1)
  const cancelled = commitments.filter(c => c.status === 2 || c.status === 3)

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: 'var(--yellow)' }}>Commitment contract not yet deployed.</p>
      <p style={{ fontSize: 13, color: 'var(--text3)', marginTop: 8 }}>Deploy ArcPaymentCommitment and update config.js.</p>
    </div>
  )

  function CommitmentRow({ c }) {
    const txHash = c.txHash
    return (
      <div className="card" style={{ marginBottom: 8, padding: '12px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={c.status} type={c.type} />
            <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{c.ref}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{c.totalAmount} USDC</div>
              {c.type === 1 && (
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.tranchesPaidCount}/{c.trancheAmounts.length} tranches</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Link to={`/commitment/${c.commitmentId}?mode=${role}`} style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
              </Link>
              {txHash && (
                <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>ArcScan ↗</button>
                </a>
              )}
              {role === 'merchant' && c.status === 0 && now >= (c.deadline || 0) && (
                <button onClick={() => handleCancel(c.commitmentId)} disabled={cancelling === c.commitmentId}
                  style={{ fontSize: 11, padding: '4px 10px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer' }}>
                  {cancelling === c.commitmentId ? '...' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Commitment Dashboard
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Monitor delayed payments and tranche commitments.</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['merchant', '🏪 Merchant View'], ['customer', '👤 Customer View']].map(([r, label]) => (
            <button key={r} onClick={() => { setRole(r); setCommitments([]) }}
              className={role === r ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 13, padding: '7px 16px' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Wallet address</label>
            <input value={addrInput} onChange={e => setAddrInput(e.target.value)} placeholder="0x..." />
          </div>
          <button onClick={() => setAddr(addrInput.trim())} disabled={loading} className="btn-primary" style={{ padding: '10px 20px', height: 42 }}>
            {loading ? <><span className="spinner" />Loading...</> : '🔍 Load'}
          </button>
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {commitments.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Total',      value: commitments.length, color: 'var(--text)' },
              { label: 'Active',     value: active.length,      color: 'var(--usdc)' },
              { label: 'Overdue',    value: overdue.length,     color: overdue.length > 0 ? '#f08080' : 'var(--text2)' },
              { label: 'Fulfilled',  value: fulfilled.length,   color: 'var(--green)' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'var(--display)' }}>{s.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => downloadCommitmentCSV(commitments, addr)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>📊 Export CSV</button>
            <button onClick={() => load(addr)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>↺ Refresh</button>
          </div>
        </>
      )}

      {overdue.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: '#f08080', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ⚠️ Overdue ({overdue.length})
          </h3>
          {overdue.map(c => <CommitmentRow key={c.commitmentId} c={c} />)}
        </div>
      )}

      {pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ⏱ Pending ({pending.length})
          </h3>
          {pending.map(c => <CommitmentRow key={c.commitmentId} c={c} />)}
        </div>
      )}

      {fulfilled.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ✓ Fulfilled ({fulfilled.length})
          </h3>
          {fulfilled.map(c => <CommitmentRow key={c.commitmentId} c={c} />)}
        </div>
      )}

      {cancelled.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Cancelled / Expired ({cancelled.length})
          </h3>
          {cancelled.map(c => <CommitmentRow key={c.commitmentId} c={c} />)}
        </div>
      )}

      {commitments.length === 0 && !loading && addr && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📭</div>
          <p>No commitments found for this address.</p>
        </div>
      )}
    </div>
  )
}
