import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { QRCodeSVG } from 'qrcode.react'
import {
  fetchCommitment,
  fulfillDelayedCommitment, fulfillTranche, cancelCommitment,
  COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL,
  getCachedCommitmentTxHash, getCachedFulfillTxHash,
  getCachedTrancheTxHash, getCachedCancelTxHash,
  fetchCommitmentTxHashes,
} from '../utils/commitment.js'
import {
  downloadCommitmentPDF, downloadFulfillPDF,
  downloadCancelPDF, downloadRefundPDF, downloadFullCommitmentPDF,
} from '../utils/commitmentPdf.js'
import {
  requestRefund, directRefund,
  fetchCustomerRefundIds, fetchMerchantRefundIds, fetchRefundRequest,
  fetchRefundTxHashes, REFUND_STATUS_LABEL, REFUND_STATUS_COLOR,
} from '../utils/refund.js'
import { shortAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, APP_URL, isCommitmentContractConfigured, isRefundContractConfigured, isMerchantRegistryConfigured } from '../config.js'

function formatTs(unix) {
  if (!unix || unix === 0) return '—'
  return new Date(unix * 1000).toLocaleString()
}
function countdown(unix) {
  if (!unix || unix === 0) return '—'
  const diff = unix * 1000 - Date.now()
  if (diff <= 0) return 'Passed'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}

export default function CommitmentDetailsPage() {
  const { id }  = useParams()
  const { address } = useAccount()
  const { open }    = useWeb3Modal()
  const configured  = isCommitmentContractConfigured()

  const [c,               setC]               = useState(null)
  const [merchantProfile, setMerchantProfile] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [acting,     setActing]     = useState(null)
  const [now,        setNow]        = useState(Math.floor(Date.now() / 1000))
  const [refund,     setRefund]     = useState(null)
  const [txHashes,   setTxHashes]   = useState({ createHash: null, fulfillHash: null, trancheHashes: [], cancelHash: null })  // existing refund for this commitment
  const [refundRequestTx, setRefundRequestTx] = useState(null)
  const [refundProcessTx, setRefundProcessTx] = useState(null)

  // Refund request form
  const [showRefund,    setShowRefund]    = useState(false)
  const [refundAmount,  setRefundAmount]  = useState('')
  const [refundReason,  setRefundReason]  = useState('')
  const [refundSending, setRefundSending] = useState(false)

  // Direct refund form (merchant)
  const [showDirect,   setShowDirect]   = useState(false)
  const [directAmount, setDirectAmount] = useState('')
  const [directReason, setDirectReason] = useState('')
  const [directSending,setDirectSending]= useState(false)

  // Live countdown tick
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (configured) load() }, [id, configured])

  // Load TX hashes from on-chain logs after commitment is set
  useEffect(() => {
    if (!c) return
    fetchCommitmentTxHashes(c).then(hashes => setTxHashes(hashes)).catch(() => {})
  }, [c?.commitmentId, c?.status, c?.tranchesPaidCount])

  async function load() {
    setLoading(true); setError('')
    try {
      const data = await fetchCommitment(id)
      if (data) {
        setC(data)
        setError('')
        if (isMerchantRegistryConfigured()) {
          getMerchantByWallet(data.merchant).then(m => {
            if (m && m.active) setMerchantProfile(m)
          }).catch(() => {})
        }
      } else {
        setError('Commitment not found.')
      }
    } catch (e) {
      // Only show error if we have no data yet (don't overwrite a loaded commitment)
      setC(prev => { if (!prev) setError('Failed to load commitment.'); return prev })
    } finally {
      setLoading(false)
    }
  }

  // Load existing refund for this commitment
  useEffect(() => {
    if (!c || !address || !isRefundContractConfigured()) return
    const isCust = address.toLowerCase() === c.customer?.toLowerCase()
    const isMerc = address.toLowerCase() === c.merchant?.toLowerCase()
    async function findRefund() {
      try {
        const ids = isCust
          ? await fetchCustomerRefundIds(address)
          : isMerc ? await fetchMerchantRefundIds(address) : []
        for (const rid of [...ids].reverse()) {
          const r = await fetchRefundRequest(rid)
          if (r && r.proofRef === c.ref.slice(0, 64)) { setRefund(r); return }
        }
      } catch {}
    }
    findRefund()
  }, [c, address])

  // Load refund TX hashes when refund is found
  useEffect(() => {
    if (!refund) return
    fetchRefundTxHashes(refund).then(({ requestTxHash, processTxHash }) => {
      if (requestTxHash) setRefundRequestTx(requestTxHash)
      if (processTxHash) setRefundProcessTx(processTxHash)
    }).catch(() => {})
  }, [refund?.refundId, refund?.status])

  async function act(fn, label) {
    setActing(label); setError(''); setSuccess('')
    try {
      const result = await fn()
      // Hard reload after TX: MetaMask mobile returns to original URL,
      // so we force a page reload to ensure we're on the right URL with fresh state
      window.location.reload()
      return result
    }
    catch (e) { setError(e.message || `${label} failed.`); setActing(null) }
  }

  async function handleRefundRequest() {
    if (!address) return open()
    if (!refundAmount || parseFloat(refundAmount) <= 0) { setError('Amount required'); return }
    if (!refundReason.trim()) { setError('Reason required'); return }
    setRefundSending(true); setError('')
    try {
      const result = await requestRefund(address, {
        merchant: c.merchant, amount: refundAmount,
        proofRef: c.ref.slice(0, 64), reason: refundReason,
      })
      setSuccess('Refund request submitted on-chain. Merchant will review.')
      setShowRefund(false)
      if (result.refundId) {
        const r = await fetchRefundRequest(result.refundId)
        setRefund(r)
      }
    } catch (e) { setError(e.message || 'Refund request failed') }
    finally { setRefundSending(false) }
  }

  async function handleDirectRefund() {
    if (!address) return open()
    if (!directAmount || parseFloat(directAmount) <= 0) { setError('Amount required'); return }
    setDirectSending(true); setError('')
    try {
      await directRefund(address, {
        customerWallet: c.customer, amount: directAmount,
        proofRef: c.ref.slice(0, 64), reason: directReason || 'Direct refund',
      })
      setSuccess(`Refund of ${directAmount} USDC sent to customer.`)
      setShowDirect(false)
      await load()
    } catch (e) { setError(e.message || 'Direct refund failed') }
    finally { setDirectSending(false) }
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: 'var(--yellow)' }}>Commitment contract not yet deployed.</p>
    </div>
  )
  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
    </div>
  )
  if (!c) return <div className="error-box">{error || 'Commitment not found.'}</div>

  // ── Role & state ──────────────────────────────────────────────────────────
  const isMerchant = !!address && address.toLowerCase() === c.merchant?.toLowerCase()
  const isCustomer = !!address && address.toLowerCase() === c.customer?.toLowerCase()
  const isActive   = c.status === 0
  const isClosed   = c.status > 0

  // Delayed payment state
  const afterDueDate = now >= c.dueDate
  const afterDeadline= now >= c.deadline

  // Refund window: 7 days from creation
  const refundWindowMs  = 7 * 24 * 60 * 60 * 1000
  const createdMs       = c.createdAt * 1000
  const withinRefundWindow = Date.now() - createdMs <= refundWindowMs
  const refundWindowEnd = new Date(createdMs + refundWindowMs)

  // TX hashes

  const receiptUrl  = `${APP_URL}/commitment/${id}`

  // Refund badge color
  const refundColor = refund ? (REFUND_STATUS_COLOR[refund.status] || 'var(--text3)') : null
  const refundLabel = refund ? REFUND_STATUS_LABEL[refund.status] : null

  return (
    <div className="fade-up" style={{ maxWidth: 720, margin: '0 auto' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, padding: '2px 10px', borderRadius: 20, border: '1px solid var(--usdc)', color: 'var(--usdc)', fontWeight: 700 }}>
            {COMMITMENT_TYPE_LABEL[c.type]}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700,
            background: (COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)') + '22',
            color: COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)',
            border: `1px solid ${(COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)')}44`,
          }}>
            {COMMITMENT_STATUS_LABEL[c.status]}
          </span>
          {refund && (
            <span style={{
              fontSize: 11, padding: '2px 10px', borderRadius: 20, fontWeight: 700,
              background: refundColor + '22', color: refundColor,
              border: `1px solid ${refundColor}44`,
            }}>
              Refund: {refundLabel}
            </span>
          )}
          {isCustomer && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>You owe</span>}
          {isMerchant && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)' }}>Your sale</span>}
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>
          {COMMITMENT_TYPE_LABEL[c.type]} · {c.ref}
        </h1>
        {c.description && <div style={{ fontSize: 13, color: 'var(--text2)' }}>{c.description}</div>}
      </div>

      {/* ── Merchant identity ── */}
      {merchantProfile && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontWeight: 600 }}>Merchant</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 12 }}>
            {merchantProfile.tradingName && (
              <div><div style={{ color: 'var(--text3)', fontSize: 11 }}>Trading name</div><div style={{ fontWeight: 600 }}>{merchantProfile.tradingName}</div></div>
            )}
            {merchantProfile.legalName && (
              <div><div style={{ color: 'var(--text3)', fontSize: 11 }}>Legal name</div><div style={{ fontWeight: 600 }}>{merchantProfile.legalName}</div></div>
            )}
            {merchantProfile.country && (
              <div><div style={{ color: 'var(--text3)', fontSize: 11 }}>Country</div><div style={{ fontWeight: 600 }}>{merchantProfile.country}</div></div>
            )}
            {merchantProfile.businessAddress && (
              <div><div style={{ color: 'var(--text3)', fontSize: 11 }}>Registered office</div><div style={{ fontWeight: 600 }}>{merchantProfile.businessAddress}</div></div>
            )}
            {merchantProfile.vatOrCompanyId && (
              <div><div style={{ color: 'var(--text3)', fontSize: 11 }}>VAT / Company ID</div><div style={{ fontWeight: 600 }}>{merchantProfile.vatOrCompanyId}</div></div>
            )}
            {merchantProfile.lei && (
              <div><div style={{ color: 'var(--text3)', fontSize: 11 }}>LEI</div><div style={{ fontWeight: 600 }}>{merchantProfile.lei}</div></div>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', wordBreak: 'break-all' }}>
            Merchant wallet: {c.merchant}
          </div>
        </div>
      )}

      {/* ── Financial summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Total</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--usdc)' }}>{c.totalAmount} USDC</div>
        </div>
        {c.type === 0 ? (
          <>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Due date</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{formatTs(c.dueDate)}</div>
              <div style={{ fontSize: 11, color: now < c.dueDate ? 'var(--green)' : '#f08080' }}>{countdown(c.dueDate)}</div>
            </div>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Deadline</div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{formatTs(c.deadline)}</div>
              <div style={{ fontSize: 11, color: now < c.deadline ? 'var(--yellow)' : '#f08080' }}>{countdown(c.deadline)}</div>
            </div>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Payment</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: c.paid ? 'var(--green)' : 'var(--text3)' }}>
                {c.paid ? '✓ Paid' : 'Pending'}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Progress</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{c.tranchesPaidCount}/{c.trancheAmounts.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>tranches paid</div>
            </div>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Next due</div>
              {(() => {
                const nextIdx = c.trancheAmounts.findIndex((_, i) => !c.tranchePaid[i])
                if (nextIdx < 0) return <div style={{ fontSize: 13, color: 'var(--green)' }}>All paid ✓</div>
                return <>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{formatTs(c.trancheDueDates[nextIdx])}</div>
                  <div style={{ fontSize: 11, color: now < c.trancheDueDates[nextIdx] ? 'var(--green)' : '#f08080' }}>{countdown(c.trancheDueDates[nextIdx])}</div>
                </>
              })()}
            </div>
          </>
        )}
      </div>

      {/* ── Tranche schedule ── */}
      {c.type === 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Payment Schedule
          </div>
          {c.trancheAmounts.map((amt, i) => {
            const trancheHash = txHashes.trancheHashes[i] || getCachedTrancheTxHash(id, i)
            return (
              <div key={i} style={{ padding: '10px 0', borderBottom: i < c.trancheAmounts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Tranche {i + 1}</span>
                      {c.tranchePaid[i]
                        ? <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'var(--green)22', color: 'var(--green)', border: '1px solid var(--green)44', fontWeight: 700 }}>✓ Paid</span>
                        : <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, background: 'var(--text3)22', color: 'var(--text3)', border: '1px solid var(--text3)44', fontWeight: 700 }}>Pending</span>
                      }
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Due: {formatTs(c.trancheDueDates[i])} · Deadline: {formatTs(c.trancheDeadlines[i])}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{amt} USDC</span>
                    {/* Only show Pay button for the NEXT unpaid tranche (contract enforces order) */}
                    {!c.tranchePaid[i] && isCustomer && isActive && i === c.tranchesPaidCount && (
                      <button
                        onClick={() => act(() => fulfillTranche(address, id, i), `Tranche${i+1}`)}
                        disabled={!!acting}
                        className="btn-primary"
                        style={{ fontSize: 11, padding: '5px 12px' }}>
                        {acting === `Tranche${i+1}` ? '...' : 'Pay now'}
                      </button>
                    )}
                    {!c.tranchePaid[i] && i > c.tranchesPaidCount && (
                      <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>🔒 Pay tranche {c.tranchesPaidCount + 1} first</span>
                    )}
                    {trancheHash && (
                      <a href={`${ARCSCAN_BASE}/tx/${trancheHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                        <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>ArcScan ↗</button>
                      </a>
                    )}
                    {c.tranchePaid[i] && (
                      <button onClick={() => downloadFulfillPDF(c, trancheHash, i, merchantProfile)} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>PDF</button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="card" style={{ marginBottom: 16, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Timeline
        </div>
        {c.type === 0 ? [
          { label: 'Commitment created', ts: c.createdAt, done: true },
          { label: 'Due date',           ts: c.dueDate,   done: now >= c.dueDate },
          { label: 'Merchant deadline',  ts: c.deadline,  done: now >= c.deadline },
          c.paid ? { label: 'Payment fulfilled', ts: 0, done: true, note: '✓' } : null,
          c.status === 2 || c.status === 3 ? { label: 'Cancelled / expired', ts: 0, done: true, note: '✕' } : null,
        ].filter(Boolean).map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: item.done ? 'var(--text3)' : 'var(--text)' }}>{item.label}</span>
            <div style={{ textAlign: 'right' }}>
              {item.ts > 0 && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{formatTs(item.ts)}</div>}
              {item.note && <div style={{ fontSize: 11, color: item.done ? 'var(--green)' : 'var(--text3)' }}>{item.note}</div>}
              {item.ts > 0 && !item.done && <div style={{ fontSize: 11, color: 'var(--green)' }}>⏱ {countdown(item.ts)}</div>}
            </div>
          </div>
        )) : c.trancheAmounts.map((_, i) => [
          { label: `Tranche ${i+1} due`, ts: c.trancheDueDates[i],  done: now >= c.trancheDueDates[i] },
          { label: `Tranche ${i+1} deadline`, ts: c.trancheDeadlines[i], done: now >= c.trancheDeadlines[i] },
        ]).flat().map((item, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: item.done ? 'var(--text3)' : 'var(--text)' }}>{item.label}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{formatTs(item.ts)}</div>
              {!item.done && <div style={{ fontSize: 11, color: 'var(--green)' }}>⏱ {countdown(item.ts)}</div>}
              {item.done && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Passed</div>}
            </div>
          </div>
        ))}
      </div>

      {/* ── Available Actions ── */}
      {!address ? (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
          <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 24px' }}>Connect Wallet for Actions</button>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Available Actions
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

            {/* Customer — pay delayed */}
            {isCustomer && isActive && c.type === 0 && !c.paid && (
              <button
                onClick={() => act(() => fulfillDelayedCommitment(address, id), 'Pay')}
                disabled={!!acting} className="btn-primary" style={{ fontSize: 13, padding: '10px 20px' }}>
                {acting === 'Pay' ? <><span className="spinner" />Processing...</> : `✅ Pay ${c.totalAmount} USDC`}
              </button>
            )}

            {/* Customer — pay tranche(s) */}
            {isCustomer && isActive && c.type === 1 && (() => {
              // Contract requires tranches paid in order — only show next unpaid tranche
              const nextIdx = c.tranchesPaidCount
              if (nextIdx >= c.trancheAmounts.length) return null
              const amt = c.trancheAmounts[nextIdx]
              return (
                <button
                  onClick={() => act(() => fulfillTranche(address, id, nextIdx), `Tranche${nextIdx+1}`)}
                  disabled={!!acting} className="btn-primary" style={{ fontSize: 12, padding: '9px 16px' }}>
                  {acting === `Tranche${nextIdx+1}`
                    ? <><span className="spinner" />...</>
                    : `✅ Pay tranche ${nextIdx+1} of ${c.trancheAmounts.length} (${amt} USDC)`}
                </button>
              )
            })()}

            {/* Merchant — cancel after deadline */}
            {isMerchant && isActive && afterDeadline && (
              <button
                onClick={() => act(() => cancelCommitment(address, id), 'Cancel')}
                disabled={!!acting}
                style={{ fontSize: 13, padding: '9px 18px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer' }}>
                {acting === 'Cancel' ? '⏳ Cancelling...' : '✕ Cancel commitment'}
              </button>
            )}

            {/* Neither party */}
            {!isCustomer && !isMerchant && (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>Connect the customer or merchant wallet to take action.</p>
            )}

            {/* Closed */}
            {isClosed && isCustomer && (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>
                This commitment is {COMMITMENT_STATUS_LABEL[c.status].toLowerCase()} — no further payment actions.
              </p>
            )}
          </div>

          {error && !error.startsWith('Failed to load') && !error.startsWith('Commitment not found') && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
          {success && <div className="success-box" style={{ marginTop: 12 }}>{success}</div>}
        </div>
      )}

      {/* ── Refund section ── */}
      {isRefundContractConfigured() && (isCustomer || isMerchant) && (
        <div className="card" style={{ marginBottom: 16, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Refund
          </div>

          {/* Show existing refund status */}
          {refund && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>Refund request:</span>
              <span style={{ fontSize: 12, padding: '2px 10px', borderRadius: 20, fontWeight: 700, background: refundColor + '22', color: refundColor, border: `1px solid ${refundColor}44` }}>
                {refundLabel}
              </span>
              <span style={{ fontSize: 12, color: 'var(--usdc)', fontWeight: 600 }}>{refund.amount} USDC</span>
              {refund.reason && <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>"{refund.reason}"</span>}
            </div>
          )}

          {/* Refund window info */}
          {!withinRefundWindow && (
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
              Refund window closed — expired {refundWindowEnd.toLocaleString()}.
            </p>
          )}

          {/* Customer: request refund */}
          {isCustomer && withinRefundWindow && !refund && (
            !showRefund ? (
              <button onClick={() => setShowRefund(true)} className="btn-ghost"
                style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--yellow)', color: 'var(--yellow)', marginBottom: 8 }}>
                💸 Request refund from merchant
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="label">Amount (USDC)</label>
                    <input type="number" min="0.01" step="0.01" value={refundAmount}
                      onChange={e => setRefundAmount(e.target.value)} placeholder={c.totalAmount} />
                  </div>
                  <div>
                    <label className="label">Reason</label>
                    <input value={refundReason} onChange={e => setRefundReason(e.target.value)}
                      placeholder="e.g. Item not as described" />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleRefundRequest} disabled={refundSending} className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
                    {refundSending ? <><span className="spinner" />Sending...</> : '📤 Submit request'}
                  </button>
                  <button onClick={() => { setShowRefund(false); setError('') }} className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }}>Cancel</button>
                </div>
              </div>
            )
          )}

          {/* Merchant: approve/deny existing request */}
          {isMerchant && refund && refund.status === 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button onClick={() => act(async () => {
                const { approveRefund } = await import('../utils/refund.js')
                return approveRefund(address, refund.refundId)
              }, 'Approve')} disabled={!!acting} className="btn-primary"
                style={{ fontSize: 12, padding: '8px 16px', background: 'var(--green)', border: 'none' }}>
                {acting === 'Approve' ? '⏳' : '✓ Approve refund'}
              </button>
              <button onClick={() => act(async () => {
                const { denyRefund } = await import('../utils/refund.js')
                return denyRefund(address, refund.refundId)
              }, 'Deny')} disabled={!!acting}
                style={{ fontSize: 12, padding: '8px 16px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer' }}>
                {acting === 'Deny' ? '⏳' : '✕ Deny'}
              </button>
            </div>
          )}

          {/* Merchant: direct refund */}
          {isMerchant && withinRefundWindow && (
            <div style={{ marginTop: refund ? 16 : 0 }}>
              {!showDirect ? (
                <button onClick={() => setShowDirect(true)} className="btn-ghost"
                  style={{ fontSize: 13, padding: '8px 16px', borderColor: 'var(--green)', color: 'var(--green)' }}>
                  💸 Issue direct refund
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Off-chain agreed refund — transfers USDC directly to customer.</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div>
                      <label className="label">Amount (USDC)</label>
                      <input type="number" min="0.01" step="0.01" value={directAmount}
                        onChange={e => setDirectAmount(e.target.value)} placeholder={c.totalAmount} />
                    </div>
                    <div>
                      <label className="label">Reason</label>
                      <input value={directReason} onChange={e => setDirectReason(e.target.value)}
                        placeholder="e.g. Agreed refund — phone call" />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleDirectRefund} disabled={directSending} className="btn-primary"
                      style={{ fontSize: 12, padding: '8px 16px', background: 'var(--green)', border: 'none' }}>
                      {directSending ? <><span className="spinner" />Sending...</> : '✓ Send refund'}
                    </button>
                    <button onClick={() => { setShowDirect(false); setError('') }} className="btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Receipts & Events ── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Receipts & Events
        </div>
        {(() => {
          const { createHash, fulfillHash, trancheHashes, cancelHash } = txHashes
          const ARCSCAN = 'https://testnet.arcscan.app'
          const ts = (unix) => unix ? new Date(unix * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : null

          // Build events array
          const events = []

          // 1. Commitment created
          events.push({
            label:    'Commitment Created',
            txHash:   createHash,
            timestamp: ts(c.createdAt),
            detail:   `${c.totalAmount} USDC · ${c.ref}`,
            note:     null,
            pdf:      () => downloadCommitmentPDF(c, createHash, merchantProfile),
          })

          // 2. Delayed payment fulfilled
          if (c.type === 0 && c.paid) {
            events.push({
              label:    'Payment Fulfilled',
              txHash:   fulfillHash,
              timestamp: null,
              detail:   `${c.totalAmount} USDC transferred to merchant`,
              note:     null,
              pdf:      () => downloadFulfillPDF(c, fulfillHash, null, merchantProfile),
            })
          }

          // 3. Tranche payments (each paid tranche)
          if (c.type === 1) {
            c.trancheAmounts.forEach((amt, i) => {
              if (c.tranchePaid[i]) {
                events.push({
                  label:    `Tranche ${i + 1} of ${c.trancheAmounts.length} Paid`,
                  txHash:   trancheHashes[i] || null,
                  timestamp: null,
                  detail:   `${amt} USDC`,
                  note:     null,
                  pdf:      () => downloadFulfillPDF(c, trancheHashes[i] || null, i, merchantProfile),
                })
              }
            })
          }

          // 4. Cancellation
          if (c.status === 2 || c.status === 3) {
            events.push({
              label:    c.status === 2 ? 'Commitment Cancelled' : 'Commitment Expired',
              txHash:   cancelHash,
              timestamp: null,
              detail:   `${c.totalAmount} USDC · ${c.ref}`,
              note:     null,
              pdf:      () => downloadCancelPDF(c, cancelHash, merchantProfile),
            })
          }

          // 5. Refund events
          if (refund) {
            if (refund.requestedAt) {
              events.push({
                label:    'Refund Requested',
                txHash:   refundRequestTx,
                timestamp: ts(refund.requestedAt),
                detail:   `${refund.amount} USDC`,
                note:     refund.reason || null,
                pdf:      () => downloadRefundPDF(c, refund, refundRequestTx, merchantProfile),
              })
            }
            if (refund.status === 1) {
              events.push({
                label:    'Refund Approved',
                txHash:   refundProcessTx,
                timestamp: ts(refund.processedAt),
                detail:   `${refund.amount} USDC transferred to customer`,
                note:     null,
                pdf:      () => downloadRefundPDF(c, refund, refundProcessTx || refundRequestTx, merchantProfile),
              })
            }
            if (refund.status === 2) {
              events.push({
                label:    'Refund Denied',
                txHash:   refundProcessTx,
                timestamp: ts(refund.processedAt),
                detail:   'Merchant denied the refund request',
                note:     null,
                pdf:      () => downloadRefundPDF(c, refund, refundProcessTx || refundRequestTx, merchantProfile),
              })
            }
            if (refund.status === 3) {
              events.push({
                label:    'Direct Refund',
                txHash:   refundProcessTx,
                timestamp: ts(refund.processedAt),
                detail:   `${refund.amount} USDC sent directly to customer`,
                note:     refund.reason || null,
                pdf:      () => downloadRefundPDF(c, refund, refundProcessTx || refundRequestTx, merchantProfile),
              })
            }
          }

          return (
            <>
              {/* Event rows */}
              <div style={{ marginBottom: 14 }}>
                {events.map((ev, i) => (
                  <div key={i} style={{
                    padding: '11px 0',
                    borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    gap: 8, flexWrap: 'wrap',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{ev.label}</div>
                      {ev.detail    && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{ev.detail}</div>}
                      {ev.note      && <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>Note: "{ev.note}"</div>}
                      {ev.timestamp && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{ev.timestamp}</div>}
                      {ev.txHash    && (
                        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 3, wordBreak: 'break-all' }}>
                          TX: {ev.txHash}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {ev.pdf && (
                        <button onClick={ev.pdf} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>
                          🖨️ PDF
                        </button>
                      )}
                      {ev.txHash ? (
                        <a href={`${ARCSCAN}/tx/${ev.txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                          <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>ArcScan ↗</button>
                        </a>
                      ) : (
                        <span style={{ fontSize: 10, color: 'var(--text3)', padding: '3px 0', fontStyle: 'italic' }}>
                          {ev.label === 'Off-chain Refund' ? 'off-chain' : 'recovering...'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => downloadFullCommitmentPDF(c, events, merchantProfile)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                  🖨️ Full PDF (all events)
                </button>
                <button onClick={() => navigator.clipboard.writeText(receiptUrl)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                  🔗 Copy link
                </button>
              </div>
            </>
          )
        })()}
      </div>

      {/* ── Details ── */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Commitment Details
        </div>
        {[
          { k: 'Ref',          v: c.ref },
          { k: 'Merchant',     v: c.merchant },
          { k: 'Customer',     v: c.customer },
          { k: 'Created',      v: formatTs(c.createdAt) },
          { k: 'Network',      v: 'Arc Testnet · Chain ID 5042002' },
          { k: 'Metadata',     v: c.metadataHash },
        ].map(row => (
          <div key={row.k} className="field-row" style={{ borderBottom: '1px solid var(--border)' }}>
            <span className="field-key">{row.k}</span>
            <span className="field-val" style={{ fontSize: 11, wordBreak: 'break-all' }}>{row.v}</span>
          </div>
        ))}
      </div>

      {/* ── QR ── */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Share this receipt
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: '#fff', padding: 14, borderRadius: 12 }}>
            <QRCodeSVG value={receiptUrl} size={160} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{receiptUrl}</p>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        TESTNET ONLY. Testnet tokens have no real economic value. Not a regulated payment service.
      </div>
    </div>
  )
}
