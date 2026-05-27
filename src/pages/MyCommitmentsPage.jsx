import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { getMerchantByWallet } from '../utils/merchant.js'
import {
  fetchCustomerCommitmentIds, fetchCommitment,
  COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL,
} from '../utils/commitment.js'
import {
  fetchCustomerRefundIds, fetchRefundRequest,
  REFUND_STATUS_LABEL, REFUND_STATUS_COLOR,
} from '../utils/refund.js'
import { downloadUnifiedCSV } from '../utils/csv.js'
import { isCommitmentContractConfigured, isRefundContractConfigured, isMerchantRegistryConfigured} from '../config.js'

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
  if (d > 0) return `${d}d ${h}h`
  return `${h}h ${m}m`
}

function Badge({ label, color }) {
  const c = color || 'var(--text3)'
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
      background: c + '22', color: c, border: `1px solid ${c}44`,
    }}>{label}</span>
  )
}

export default function MyCommitmentsPage() {
  const { address, isConnected } = useAccount()
  const { open }    = useWeb3Modal()
  const configured  = isCommitmentContractConfigured()

  const [commitments,  setCommitments]  = useState([])
  const [refundsByRef, setRefundsByRef] = useState({})
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')
  const [now,          setNow]          = useState(Math.floor(Date.now() / 1000))

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (address && configured) load() }, [address, configured])

  async function load() {
    setLoading(true); setError('')
    try {
      const ids  = await fetchCustomerCommitmentIds(address)
      const list = []
      for (const id of [...ids].reverse()) {
        const c = await fetchCommitment(id)
        if (c) list.push(c)
      }
      // Enrich with merchant profile
      if (isMerchantRegistryConfigured()) {
        await Promise.all(list.map(async c => {
          try {
            const m = await getMerchantByWallet(c.merchant)
            if (m && m.active) {
              c.merchantName      = m.tradingName
              c.merchantLegalName = m.legalName || ''
              c.merchantCountry   = m.country   || ''
            }
          } catch {}
        }))
      }
      setCommitments(list)

      // Load refunds indexed by proofRef
      if (isRefundContractConfigured()) {
        try {
          const rIds = await fetchCustomerRefundIds(address)
          const byRef = {}
          for (const rid of rIds) {
            const r = await fetchRefundRequest(rid)
            if (r && r.proofRef) byRef[r.proofRef] = r
          }
          setRefundsByRef(byRef)
        } catch {}
      }
    } catch { setError('Failed to load. Are you on Arc Testnet?') }
    finally { setLoading(false) }
  }

  function getOverallStatus(c) {
    const refund = refundsByRef[c.ref]
    if (refund) {
      if (refund.status === 1 || refund.status === 3) return { label: 'Refunded', color: 'var(--green)' }
      if (refund.status === 0) return { label: 'Refund Pending', color: 'var(--yellow)' }
    }
    if (c.status === 1) return { label: 'Fulfilled', color: 'var(--green)' }
    if (c.status === 2 || c.status === 3) return { label: COMMITMENT_STATUS_LABEL[c.status], color: '#f08080' }
    // Active
    const isOverdue = now >= (c.deadline || c.trancheDeadlines?.[c.tranchesPaidCount] || 0)
    if (isOverdue) return { label: 'Overdue', color: '#f08080' }
    return { label: 'Active', color: 'var(--usdc)' }
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: 'var(--yellow)' }}>Commitment contract not yet deployed.</p>
    </div>
  )

  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>📋</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to view your commitments</p>
      <button onClick={() => open()} className="btn-primary btn-full" style={{ maxWidth: 280, margin: '0 auto' }}>
        Connect Wallet
      </button>
    </div>
  )

  const active    = commitments.filter(c => c.status === 0)
  const fulfilled = commitments.filter(c => c.status === 1)
  const closed    = commitments.filter(c => c.status === 2 || c.status === 3)

  function CommitmentCard({ c }) {
    const status = getOverallStatus(c)
    const refund = refundsByRef[c.ref]
    const nextUnpaid = c.type === 1 ? c.trancheAmounts.findIndex((_, i) => !c.tranchePaid[i]) : -1

    return (
      <div className="card" style={{ marginBottom: 10, padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <Badge label={COMMITMENT_TYPE_LABEL[c.type]} color="var(--usdc)" />
              <Badge label={status.label} color={status.color} />
              {refund && <Badge label={`Refund: ${REFUND_STATUS_LABEL[refund.status]}`} color={REFUND_STATUS_COLOR[refund.status]} />}
            </div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{c.ref}</div>
            {c.description && <div style={{ fontSize: 12, color: 'var(--text2)' }}>{c.description}</div>}
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-0.5px' }}>
              {c.totalAmount} USDC
            </div>
            {c.type === 1 && (
              <div style={{ fontSize: 11, color: 'var(--text2)' }}>{c.tranchesPaidCount}/{c.trancheAmounts.length} paid</div>
            )}
          </div>
        </div>

        {/* Key info */}
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
          {c.type === 0 ? (
            <>Due: {formatTs(c.dueDate)} · Deadline: {formatTs(c.deadline)}{c.status === 0 && ` · ${countdown(c.deadline)}`}</>
          ) : nextUnpaid >= 0 ? (
            <>Next tranche {nextUnpaid + 1}: {c.trancheAmounts[nextUnpaid]} USDC · Due: {formatTs(c.trancheDueDates[nextUnpaid])}{c.status === 0 && ` · ${countdown(c.trancheDueDates[nextUnpaid])}`}</>
          ) : (
            <>All {c.trancheAmounts.length} tranches paid</>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/commitment/${c.commitmentId}?mode=customer`} style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ fontSize: 12, padding: '6px 16px' }}>View & Pay →</button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Customer</span>
          <span className="badge badge-gray">My Commitments</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>My Commitments</h1>
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>Delayed and tranche payments you have signed</p>
          </div>
          {commitments.length > 0 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={load} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>↺ Refresh</button>
              <button onClick={() => downloadUnifiedCSV({ commitments, refunds: Object.values(refundsByRef), walletAddress: address, role: 'customer' })}
                className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>📊 Export CSV</button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>
          <span className="spinner" /> Loading...
        </div>
      )}

      {!loading && commitments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📋</div>
          <p>No commitments found for this wallet.</p>
        </div>
      )}

      {!loading && active.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--usdc)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, padding: '6px 12px', background: 'var(--usdc)18', borderRadius: 6 }}>
            🔵 Active ({active.length})
          </div>
          {active.map(c => <CommitmentCard key={c.commitmentId} c={c} />)}
        </div>
      )}

      {!loading && fulfilled.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, padding: '6px 12px', background: 'var(--green)18', borderRadius: 6 }}>
            ✓ Fulfilled ({fulfilled.length})
          </div>
          {fulfilled.map(c => <CommitmentCard key={c.commitmentId} c={c} />)}
        </div>
      )}

      {!loading && closed.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, padding: '6px 12px', background: 'var(--surface2)', borderRadius: 6 }}>
            Cancelled / Expired ({closed.length})
          </div>
          {closed.map(c => <CommitmentCard key={c.commitmentId} c={c} />)}
        </div>
      )}
    </div>
  )
}
