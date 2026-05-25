import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchReceivedProofIds, fetchProof,
  formatUsdc, formatTs, buildReceiptObject,
  recoverTxHash,
} from '../utils/receipts.js'
import { getCachedTxHash, getPaymentRequests } from '../utils/paymentRequest.js'
import { shortAddress, isValidAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, isMerchantRegistryConfigured, isRefundContractConfigured, isCommitmentContractConfigured } from '../config.js'
import { getMerchantIdByWallet, getMerchantWallets } from '../utils/merchant.js'
import { downloadCSV, downloadUnifiedCSV } from '../utils/csv.js'
import { downloadReceiptPDF } from '../utils/pdf.js'
import {
  fetchMerchantCommitmentIds, fetchCommitment, fetchCommitmentTxHashes,
  COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL,
} from '../utils/commitment.js'
import {
  fetchMerchantRefundIds, fetchCustomerRefundIds, fetchRefundRequest, approveRefund, denyRefund,
  fetchRefundTxHashes, REFUND_STATUS_LABEL, REFUND_STATUS_COLOR,
} from '../utils/refund.js'

// ── Shared badge components ──────────────────────────────────────────────────
function CommitBadge({ label, color }) {
  return (
    <span style={{
      fontSize: 10, padding: '2px 8px', borderRadius: 20,
      fontWeight: 700, fontFamily: 'var(--mono)',
      background: (color || 'var(--text3)') + '22',
      color: color || 'var(--text3)',
      border: `1px solid ${(color || 'var(--text3)')}44`,
    }}>
      {label}
    </span>
  )
}

function SectionHeader({ emoji, label, count, color }) {
  return (
    <div style={{
      padding: '8px 16px',
      background: color ? color + '18' : 'var(--surface2)',
      fontSize: 11, fontWeight: 700,
      color: color || 'var(--text2)',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      borderBottom: '1px solid var(--border)',
    }}>
      {emoji} {label} ({count})
    </div>
  )
}

export default function DashboardPage({ account, onConnect, connecting }) {
  const [merchantInput, setMerchantInput] = useState('')
  const [merchantAddr,  setMerchantAddr]  = useState('')
  const [proofs,        setProofs]        = useState([])
  const [receipts,      setReceipts]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [linkedWallets, setLinkedWallets] = useState([])
  const [commitments,   setCommitments]   = useState([])
  const [refunds,       setRefunds]       = useState([])
  const [refundsByRef,  setRefundsByRef]  = useState({}) // proofRef -> refund
  const [refundActing,  setRefundActing]  = useState(null)
  const [refundMsg,     setRefundMsg]     = useState('')

  // Auto-load when wallet connects
  useEffect(() => {
    if (!account) return
    if (isMerchantRegistryConfigured()) {
      getMerchantIdByWallet(account).then(async id => {
        if (id && id.toString() !== '0') {
          const wallets = await getMerchantWallets(id)
          if (wallets && wallets.length > 0) {
            setMerchantAddr(account)
            setMerchantInput(account)
            setLinkedWallets(wallets.map(w => w.toLowerCase()))
            return
          }
        }
        setMerchantAddr(account)
        setMerchantInput(account)
      }).catch(() => {
        setMerchantAddr(account)
        setMerchantInput(account)
      })
    } else {
      setMerchantAddr(account)
      setMerchantInput(account)
    }
  }, [account])

  useEffect(() => {
    if (merchantAddr) load(merchantAddr)
  }, [merchantAddr])

  async function load(addr) {
    if (!isValidAddress(addr)) { setError('Invalid wallet address'); return }
    setLoading(true)
    setError('')
    try {
      const walletsToLoad = linkedWallets.length > 0 ? linkedWallets : [addr]

      // ── Proofs ────────────────────────────────────────────────────────────
      const allIds = []
      for (const w of walletsToLoad) {
        const wIds = await fetchReceivedProofIds(w)
        allIds.push(...wIds)
      }
      const ids      = [...new Set(allIds.map(id => id.toString()))].map(id => BigInt(id))
      const reversed = [...ids].reverse()
      const fetched  = []
      for (const id of reversed) {
        try {
          const p = await fetchProof(id.toString())
          if (p) fetched.push({ id: id.toString(), proof: p })
        } catch {}
      }
      setProofs(fetched)

      const localRequests = getPaymentRequests()
      const built = []
      for (const { id, proof } of fetched) {
        let txHash = getCachedTxHash(id)
        if (!txHash && proof.createdBlock && proof.createdBlock > 0n) {
          txHash = await recoverTxHash(id, proof.createdBlock)
        }
        const localReq = localRequests.find(r => r.ref === proof.paymentRef)
        built.push(buildReceiptObject({
          proofData:    proof,
          txHash,
          proofId:      id,
          merchantName: localReq?.name  || null,
          description:  localReq?.desc  || null,
        }))
      }
      setReceipts(built)

      // ── Commitments ───────────────────────────────────────────────────────
      if (isCommitmentContractConfigured()) {
        try {
          const allCommitmentIds = []
          for (const w of walletsToLoad) {
            const cIds = await fetchMerchantCommitmentIds(w)
            allCommitmentIds.push(...cIds)
          }
          const uniqueIds = [...new Set(allCommitmentIds.map(id => id.toString()))]
          const commitmentList = []
          for (const id of [...uniqueIds].reverse()) {
            const cm = await fetchCommitment(id)
            if (cm) commitmentList.push(cm)
          }
          // Enrich commitments with TX hashes for CSV export
          const enrichedC = await Promise.all(commitmentList.map(async cm => {
            try {
              const hashes = await fetchCommitmentTxHashes(cm)
              return { ...cm, createTxHash: hashes.createHash, fulfillTxHash: hashes.fulfillHash, cancelTxHash: hashes.cancelHash }
            } catch { return cm }
          }))
          setCommitments(enrichedC)
        } catch {}
      }

      // ── Refund requests ───────────────────────────────────────────────────
      if (isRefundContractConfigured()) {
        try {
          const allRefundIds = []
          for (const w of walletsToLoad) {
            const rIds = await fetchMerchantRefundIds(w)
            allRefundIds.push(...rIds)
          }
          const uniqueRefundIds = [...new Set(allRefundIds.map(id => id.toString()))]
          const refundList = []
          for (const id of [...uniqueRefundIds].reverse()) {
            const r = await fetchRefundRequest(id)
            if (r) refundList.push(r)
          }
          // Enrich refunds with TX hashes from on-chain logs
          const enriched = await Promise.all(refundList.map(async r => {
            const { requestTxHash, processTxHash } = await fetchRefundTxHashes(r)
            return { ...r, requestTxHash, processTxHash }
          }))
          setRefunds(enriched)
          // Build lookup: proofRef -> most recent refund
          const byRef = {}
          for (const r of enriched) { if (r.proofRef) byRef[r.proofRef] = r }
          setRefundsByRef(byRef)
        } catch {}
      }
    } catch {
      setError('Failed to load payments. Are you on Arc Testnet?')
    } finally {
      setLoading(false)
    }
  }

  function handleSearch() {
    const addr = merchantInput.trim()
    if (!isValidAddress(addr)) { setError('Invalid wallet address'); return }
    setMerchantAddr(addr)
  }

  async function handleApproveRefund(refundId) {
    if (!account) return
    setRefundActing(refundId); setRefundMsg('')
    try {
      await approveRefund(account, refundId)
      setRefundMsg(`Refund #${refundId} approved and USDC sent to customer.`)
      await load(merchantAddr)
    } catch (e) {
      setRefundMsg(`Error: ${e.message || 'Approve failed'}`)
    } finally {
      setRefundActing(null)
    }
  }

  async function handleDenyRefund(refundId) {
    if (!account) return
    setRefundActing(refundId); setRefundMsg('')
    try {
      await denyRefund(account, refundId)
      setRefundMsg(`Refund #${refundId} denied.`)
      await load(merchantAddr)
    } catch (e) {
      setRefundMsg(`Error: ${e.message || 'Deny failed'}`)
    } finally {
      setRefundActing(null)
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const totalUsdc          = receipts.reduce((sum, r) => sum + parseFloat(r.amount || 0), 0)
  const avgUsdc            = receipts.length > 0 ? (totalUsdc / receipts.length).toFixed(2) : '0.00'
  const pendingCommitments = commitments.filter(c => c.status === 0).length
  const pendingRefunds     = refunds.filter(r => r.status === 0).length

  const now       = Math.floor(Date.now() / 1000)
  const active    = commitments.filter(c => c.status === 0)
  const overdue   = active.filter(c => now >= (c.deadline || c.trancheDeadlines?.[c.tranchesPaidCount] || 0))
  const onTime    = active.filter(c => now < (c.deadline || c.trancheDeadlines?.[c.tranchesPaidCount] || Infinity))
  const fulfilled = commitments.filter(c => c.status === 1)
  const cancelled = commitments.filter(c => c.status === 2 || c.status === 3)

  // ── Sub-components ────────────────────────────────────────────────────────
  function CommitRow({ cm }) {
    const isOverdue   = cm.status === 0 && now >= (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || 0)
    const statusColor = isOverdue ? '#f08080' : COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)'
    const statusLabel = isOverdue ? 'Overdue' : COMMITMENT_STATUS_LABEL[cm.status]

    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <CommitBadge label={statusLabel} color={statusColor} />
          <CommitBadge label={COMMITMENT_TYPE_LABEL[cm.type]} color="var(--usdc)" />
          <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{cm.ref}</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>→ {shortAddress(cm.customer)}</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{cm.totalAmount} USDC</span>
          {cm.type === 1 && (
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>{cm.tranchesPaidCount}/{cm.trancheAmounts.length}</span>
          )}
          <Link to={`/commitment/${cm.commitmentId}`} style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
          </Link>
        </div>
      </div>
    )
  }

  function RefundRow({ r }) {
    const isActing  = refundActing === r.refundId
    const isPending = r.status === 0
    const expiry    = r.expiresAt ? new Date(r.expiresAt * 1000).toLocaleString() : '—'
    const color     = REFUND_STATUS_COLOR[r.status] || 'var(--text3)'

    return (
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
              <CommitBadge label={REFUND_STATUS_LABEL[r.status]} color={color} />
              <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{r.proofRef}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>from {shortAddress(r.customer)}</span>
            </div>
            {r.reason && (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4, fontStyle: 'italic' }}>
                "{r.reason}"
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Requested: {r.requestedAt ? new Date(r.requestedAt * 1000).toLocaleString() : '—'}
              {isPending && ` · Expires: ${expiry}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--usdc)' }}>{r.amount} USDC</span>
            {isPending && account && (
              <>
                <button
                  onClick={() => handleApproveRefund(r.refundId)}
                  disabled={isActing}
                  className="btn-primary"
                  style={{ fontSize: 11, padding: '5px 12px', background: 'var(--green)', border: 'none' }}
                >
                  {isActing ? '...' : '✓ Approve'}
                </button>
                <button
                  onClick={() => handleDenyRefund(r.refundId)}
                  disabled={isActing}
                  style={{ fontSize: 11, padding: '5px 12px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer' }}
                >
                  {isActing ? '...' : '✕ Deny'}
                </button>
              </>
            )}
            {isPending && !account && (
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Connect wallet to act</span>
            )}
            {/* View Receipt link — find proofId from receipts by matching payment_ref */}
            {(() => {
              const matched = receipts.find(rx => rx.payment_ref === r.proofRef)
              if (!matched) return null
              return (
                <Link to={`/receipt/${matched.receipt_id}`} style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>
                    View receipt →
                  </button>
                </Link>
              )
            })()}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Merchant Dashboard
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          View all received payments for a wallet address.
        </p>
      </div>

      {/* Wallet selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Merchant wallet address</label>
            <input
              value={merchantInput}
              onChange={e => setMerchantInput(e.target.value)}
              placeholder="0x... (your wallet or any merchant)"
            />
          </div>
          <button onClick={handleSearch} disabled={loading} className="btn-primary" style={{ padding: '10px 20px', height: 42 }}>
            {loading ? <><span className="spinner" />Loading...</> : '🔍 Load'}
          </button>
          {!account && (
            <button onClick={onConnect} disabled={connecting} className="btn-ghost" style={{ padding: '10px 16px', height: 42 }}>
              {connecting ? <><span className="spinner" /></> : 'Connect wallet'}
            </button>
          )}
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Stats */}
      {(receipts.length > 0 || commitments.length > 0 || refunds.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total received',       value: `${totalUsdc.toFixed(2)} USDC`, color: 'var(--usdc)'  },
            { label: 'Payments',             value: receipts.length.toString(),      color: 'var(--text)'  },
            { label: 'Pending commitments',  value: pendingCommitments.toString(),   color: pendingCommitments > 0 ? 'var(--yellow)' : 'var(--text2)' },
            { label: 'Refund requests',      value: pendingRefunds.toString(),       color: pendingRefunds > 0 ? '#f08080' : 'var(--text2)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 18, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'var(--display)', letterSpacing: '-0.5px' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Export / refresh */}
      {(receipts.length > 0 || commitments.length > 0 || refunds.length > 0) && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, justifyContent: 'flex-end' }}>
          <button onClick={() => {
              const enrichedReceipts = receipts.map(r => ({
                ...r,
                refundStatus: refundsByRef[r.payment_ref]
                  ? REFUND_STATUS_LABEL[refundsByRef[r.payment_ref].status]
                  : '—',
              }))
              downloadUnifiedCSV({ receipts: enrichedReceipts, commitments, refunds, walletAddress: merchantAddr, role: 'merchant' })
            }} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            📊 Export CSV
          </button>
          <button onClick={() => load(merchantAddr)} disabled={loading} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            ↻ Refresh
          </button>
        </div>
      )}

      {/* ── Refund Inbox ── */}
      {refunds.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            💸 Refund Requests ({refunds.length})
          </h3>
          {refundMsg && (
            <div className={refundMsg.startsWith('Error') ? 'error-box' : 'success-box'} style={{ marginBottom: 12 }}>
              {refundMsg}
            </div>
          )}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {(() => {
              const pending   = refunds.filter(r => r.status === 0)
              const processed = refunds.filter(r => r.status !== 0)
              return (
                <>
                  {pending.length > 0 && (
                    <>
                      <SectionHeader emoji="⏳" label="Pending — action required" count={pending.length} color="var(--yellow)" />
                      {pending.map(r => <RefundRow key={r.refundId} r={r} />)}
                    </>
                  )}
                  {processed.length > 0 && (
                    <>
                      <SectionHeader emoji="✓" label="Processed" count={processed.length} />
                      {processed.map(r => <RefundRow key={r.refundId} r={r} />)}
                    </>
                  )}
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Commitments section ── */}
      {commitments.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              📅 Delayed & Tranche Payments ({commitments.length})
            </h3>
            <Link to="/commitment-dashboard" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 12px' }}>Full dashboard →</button>
            </Link>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {overdue.length > 0 && (
              <>
                <SectionHeader emoji="⚠️" label="Overdue" count={overdue.length} color="#f08080" />
                {overdue.map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
              </>
            )}
            {onTime.length > 0 && (
              <>
                <SectionHeader emoji="🔵" label="Active" count={onTime.length} color="var(--usdc)" />
                {onTime.map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
              </>
            )}
            {fulfilled.length > 0 && (
              <>
                <SectionHeader emoji="✓" label="Fulfilled" count={fulfilled.length} color="var(--green)" />
                {fulfilled.map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
              </>
            )}
            {cancelled.length > 0 && (
              <>
                <SectionHeader emoji="✕" label="Cancelled / Expired" count={cancelled.length} color="var(--text3)" />
                {cancelled.map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
              </>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {receipts.length === 0 && commitments.length === 0 && refunds.length === 0 && !loading && merchantAddr && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📭</div>
          <p>No payments received for this address yet.</p>
          <Link to="/create">
            <button className="btn-primary" style={{ marginTop: 16, padding: '10px 24px' }}>
              Create payment request →
            </button>
          </Link>
        </div>
      )}

      {/* ── Immediate payments list ── */}
      {receipts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {receipts.map((r) => (
            <div key={r.receipt_id} className="card" style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{r.purpose_code}</span>
                    {refundsByRef[r.payment_ref] && (() => {
                      const ref = refundsByRef[r.payment_ref]
                      const col = REFUND_STATUS_COLOR[ref.status] || 'var(--text3)'
                      return (
                        <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 20, fontWeight: 700,
                          background: col + '22', color: col, border: `1px solid ${col}44` }}>
                          Refund: {REFUND_STATUS_LABEL[ref.status]}
                        </span>
                      )
                    })()}
                  </div>
                  <div style={{ fontSize: 13, fontFamily: 'var(--mono)', marginBottom: 4 }}>{r.payment_ref}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    From: {shortAddress(r.customer_wallet)} · {r.timestamp_utc?.slice(0, 10)}
                  </div>
                  {r.description && r.description !== 'Not available — frontend-only metadata not stored on-chain' && (
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{r.description}</div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, color: 'var(--usdc)', letterSpacing: '-0.5px' }}>
                    {r.amount}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{r.token_symbol}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Link to={`/receipt/${r.receipt_id}?mode=merchant`} style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}>View receipt</button>
                </Link>
                {r.transaction_hash && (
                  <a href={`${ARCSCAN_BASE}/tx/${r.transaction_hash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}>ArcScan ↗</button>
                  </a>
                )}
                <button onClick={() => downloadReceiptPDF(r)} className="btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }}>PDF</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
