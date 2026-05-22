import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { QRCodeSVG } from 'qrcode.react'
import {
  fetchCommitment, fulfillDelayedCommitment, fulfillTranche, cancelCommitment,
  COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL,
  getCachedCommitmentTxHash,
} from '../utils/commitment.js'
import { downloadCommitmentPDF } from '../utils/commitmentPdf.js'
import { shortAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, APP_URL, isCommitmentContractConfigured } from '../config.js'

function formatTs(unix) {
  if (!unix || unix === 0) return 'N/A'
  return new Date(unix * 1000).toLocaleString()
}
function countdown(unix) {
  const diff = unix * 1000 - Date.now()
  if (diff <= 0) return 'Passed'
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function CommitmentDetailsPage() {
  const { id }  = useParams()
  const [params] = useSearchParams()
  const modeParam = params.get('mode')
  const { address } = useAccount()
  const { open }    = useWeb3Modal()
  const configured  = isCommitmentContractConfigured()

  const [commitment, setCommitment] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState('')
  const [acting,     setActing]     = useState(false)
  const [success,    setSuccess]    = useState('')

  const txHash   = getCachedCommitmentTxHash(id)
  const receiptUrl = `${APP_URL}/commitment/${id}`

  useEffect(() => { if (configured) load() }, [id, configured])

  async function load() {
    setLoading(true); setError('')
    try {
      const c = await fetchCommitment(id)
      setCommitment(c)
    } catch { setError('Failed to load commitment.') }
    finally { setLoading(false) }
  }

  async function handleFulfill() {
    if (!address) return open()
    setActing(true); setError(''); setSuccess('')
    try {
      await fulfillDelayedCommitment(address, id)
      setSuccess('Payment fulfilled successfully!')
      await load()
    } catch (e) { setError(e.message || 'Transaction failed') }
    finally { setActing(false) }
  }

  async function handleFulfillTranche(idx) {
    if (!address) return open()
    setActing(true); setError(''); setSuccess('')
    try {
      await fulfillTranche(address, id, idx)
      setSuccess(`Tranche ${idx + 1} paid!`)
      await load()
    } catch (e) { setError(e.message || 'Transaction failed') }
    finally { setActing(false) }
  }

  async function handleCancel() {
    if (!address) return open()
    setActing(true); setError(''); setSuccess('')
    try {
      await cancelCommitment(address, id)
      setSuccess('Commitment cancelled.')
      await load()
    } catch (e) { setError(e.message || 'Cancel failed') }
    finally { setActing(false) }
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: 'var(--yellow)' }}>Commitment contract not yet deployed.</p>
    </div>
  )
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Loading...</div>
  if (!commitment) return <div className="error-box">{error || 'Commitment not found.'}</div>

  const c   = commitment
  const now = Math.floor(Date.now() / 1000)
  const isMerchant = address?.toLowerCase() === c.merchant?.toLowerCase()
  const isCustomer = address?.toLowerCase() === c.customer?.toLowerCase()
  const mode = modeParam || (isMerchant ? 'merchant' : 'customer')

  return (
    <div className="fade-up" style={{ maxWidth: 680, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 20, border: '1px solid var(--usdc)', color: 'var(--usdc)' }}>
          {COMMITMENT_TYPE_LABEL[c.type] ?? 'Commitment'}
        </span>
        <span style={{ fontSize: 12, color: COMMITMENT_STATUS_COLOR[c.status], padding: '3px 10px', borderRadius: 20, background: (COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)') + '22', border: `1px solid ${(COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)')}44` }}>
          {COMMITMENT_STATUS_LABEL[c.status]}
        </span>
      </div>

      <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 20 }}>
        {COMMITMENT_TYPE_LABEL[c.type]} · {c.ref}
      </h1>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div className="card" style={{ padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Total</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--usdc)' }}>{c.totalAmount} USDC</div>
        </div>
        {c.type === 0 ? (
          <>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Due date</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{formatTs(c.dueDate)}</div>
              <div style={{ fontSize: 11, color: now < c.dueDate ? 'var(--green)' : '#f08080' }}>{countdown(c.dueDate)}</div>
            </div>
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Deadline</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{formatTs(c.deadline)}</div>
              <div style={{ fontSize: 11, color: now < c.deadline ? 'var(--yellow)' : '#f08080' }}>{countdown(c.deadline)}</div>
            </div>
          </>
        ) : (
          <div className="card" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Progress</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{c.tranchesPaidCount}/{c.trancheAmounts.length}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)' }}>tranches paid</div>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        {[
          ['Merchant',     shortAddress(c.merchant)],
          ['Customer',     shortAddress(c.customer)],
          ['Ref',          c.ref],
          c.description ? ['Description', c.description] : null,
          ['Created',      formatTs(c.createdAt)],
        ].filter(Boolean).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
            <span style={{ fontSize: 13, fontFamily: 'var(--mono)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Tranche schedule */}
      {c.type === 1 && c.trancheAmounts.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Payment Schedule
          </div>
          {c.trancheAmounts.map((amt, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < c.trancheAmounts.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Tranche {i + 1}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Due: {formatTs(c.trancheDueDates[i])} · Deadline: {formatTs(c.trancheDeadlines[i])}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{amt} USDC</span>
                {c.tranchePaid[i] ? (
                  <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Paid</span>
                ) : isCustomer && c.status === 0 && !c.tranchePaid[i] && now < (c.trancheDeadlines[i] || Infinity) ? (
                  <button onClick={() => handleFulfillTranche(i)} disabled={acting} className="btn-primary" style={{ fontSize: 11, padding: '5px 12px' }}>
                    {acting ? '...' : 'Pay now'}
                  </button>
                ) : (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>Pending</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      {c.status === 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Available Actions
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {/* Customer: pay delayed */}
            {isCustomer && c.type === 0 && !c.paid && now < c.deadline && (
              <button onClick={handleFulfill} disabled={acting} className="btn-primary" style={{ fontSize: 13, padding: '10px 20px' }}>
                {acting ? <><span className="spinner" />Processing...</> : '✅ Pay now'}
              </button>
            )}
            {/* Merchant: cancel if overdue */}
            {isMerchant && now >= c.deadline && (
              <button onClick={handleCancel} disabled={acting}
                style={{ fontSize: 13, padding: '10px 20px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer' }}>
                {acting ? '...' : '✕ Cancel commitment'}
              </button>
            )}
            {c.status === 0 && !isMerchant && !isCustomer && (
              <p style={{ fontSize: 13, color: 'var(--text3)' }}>Connect the relevant wallet to take action.</p>
            )}
          </div>
          {error  && <div className="error-box"   style={{ marginTop: 12 }}>{error}</div>}
          {success && <div className="success-box" style={{ marginTop: 12 }}>{success}</div>}
        </div>
      )}

      {/* Receipts */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Receipts</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => downloadCommitmentPDF(c, txHash)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
            🖨️ PDF
          </button>
          <button onClick={() => navigator.clipboard.writeText(receiptUrl)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
            🔗 Copy link
          </button>
          {txHash ? (
            <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>🔍 ArcScan ↗</button>
            </a>
          ) : (
            <a href={`${ARCSCAN_BASE}/address/${c.merchant}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>🔍 ArcScan ↗</button>
            </a>
          )}
        </div>
      </div>

      {/* QR */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Share this receipt
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: '#fff', padding: 14, borderRadius: 12 }}>
            <QRCodeSVG value={receiptUrl} size={160} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
            {receiptUrl}
          </p>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        TESTNET ONLY. Testnet tokens have no real economic value. Not a regulated payment service.
      </div>
    </div>
  )
}
