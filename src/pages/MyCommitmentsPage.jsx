import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import {
  fetchCustomerCommitmentIds, fetchCommitment,
  fulfillDelayedCommitment, fulfillTranche,
  COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL,
  getCachedCommitmentTxHash,
} from '../utils/commitment.js'
import { downloadCommitmentCSV } from '../utils/commitmentCsv.js'
import { isCommitmentContractConfigured, ARCSCAN_BASE } from '../config.js'

function formatTs(unix) {
  if (!unix || unix === 0) return '—'
  return new Date(unix * 1000).toLocaleString()
}

export default function MyCommitmentsPage() {
  const { address, isConnected } = useAccount()
  const { open }    = useWeb3Modal()
  const configured  = isCommitmentContractConfigured()

  const [commitments, setCommitments] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [acting,      setActing]      = useState(null)

  useEffect(() => { if (address && configured) load() }, [address, configured])

  async function load() {
    setLoading(true); setError('')
    try {
      const ids  = await fetchCustomerCommitmentIds(address)
      const list = []
      for (const id of [...ids].reverse()) {
        const c = await fetchCommitment(id)
        if (c) { c.txHash = getCachedCommitmentTxHash(id); list.push(c) }
      }
      setCommitments(list)
    } catch { setError('Failed to load. Are you on Arc Testnet?') }
    finally { setLoading(false) }
  }

  async function handlePay(c) {
    if (!address) return open()
    setActing(c.commitmentId); setError('')
    try {
      await fulfillDelayedCommitment(address, c.commitmentId)
      await load()
    } catch (e) { setError(e.message || 'Transaction failed') }
    finally { setActing(null) }
  }

  async function handlePayTranche(c, idx) {
    if (!address) return open()
    setActing(`${c.commitmentId}-${idx}`); setError('')
    try {
      await fulfillTranche(address, c.commitmentId, idx)
      await load()
    } catch (e) { setError(e.message || 'Transaction failed') }
    finally { setActing(null) }
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

  const now = Math.floor(Date.now() / 1000)

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          My Commitments
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Your delayed payments and tranche commitments.</p>
      </div>

      {error && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}

      {commitments.length > 0 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => downloadCommitmentCSV(commitments, address)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>📊 Export CSV</button>
          <button onClick={load} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>↺ Refresh</button>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>Loading...</div>}

      {!loading && commitments.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📭</div>
          <p>No commitments found for this wallet.</p>
        </div>
      )}

      {commitments.map(c => {
        const isOverdue = c.status === 0 && now >= (c.deadline || c.trancheDeadlines?.[c.tranchesPaidCount] || 0)
        const nextTranche = c.type === 1 ? c.trancheAmounts.findIndex((_, i) => !c.tranchePaid[i]) : -1
        const canPayDelayed = c.type === 0 && c.status === 0 && !c.paid && now >= c.dueDate
        const canPayTranche = c.type === 1 && c.status === 0 && nextTranche >= 0 && now >= (c.trancheDueDates[nextTranche] || 0)

        return (
          <div key={c.commitmentId} className="card" style={{ marginBottom: 12, padding: '16px 18px', borderColor: isOverdue ? '#f04f4f44' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, fontFamily: 'var(--mono)', fontWeight: 600, background: (COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)') + '22', color: COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)', border: `1px solid ${(COMMITMENT_STATUS_COLOR[c.status] || 'var(--text3)')}44` }}>
                    {COMMITMENT_STATUS_LABEL[c.status]} · {COMMITMENT_TYPE_LABEL[c.type]}
                  </span>
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

            {c.type === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10 }}>
                Due: {formatTs(c.dueDate)} · Deadline: {formatTs(c.deadline)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link to={`/commitment/${c.commitmentId}`} style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>View receipt</button>
              </Link>
              {c.txHash && (
                <a href={`${ARCSCAN_BASE}/tx/${c.txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>ArcScan ↗</button>
                </a>
              )}
              {canPayDelayed && (
                <button onClick={() => handlePay(c)} disabled={acting === c.commitmentId} className="btn-primary" style={{ fontSize: 12, padding: '6px 16px' }}>
                  {acting === c.commitmentId ? <><span className="spinner" />Processing...</> : '✅ Pay now'}
                </button>
              )}
              {canPayTranche && (
                <button onClick={() => handlePayTranche(c, nextTranche)} disabled={acting === `${c.commitmentId}-${nextTranche}`} className="btn-primary" style={{ fontSize: 12, padding: '6px 16px' }}>
                  {acting === `${c.commitmentId}-${nextTranche}` ? <><span className="spinner" />Processing...</> : `✅ Pay tranche ${nextTranche + 1} (${c.trancheAmounts[nextTranche]} USDC)`}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
