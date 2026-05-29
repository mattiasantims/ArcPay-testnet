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
import { getMerchantIdByWallet, getMerchantWallets, getMerchantByWallet } from '../utils/merchant.js'
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

      // Build merchant profile cache from unique payees
      const merchantProfileCache = {}
      if (isMerchantRegistryConfigured()) {
        // Use checksummed addresses as-is for contract calls; key cache by lowercase for lookup
        const seen = new Set()
        const uniquePayees = []
        for (const { proof } of fetched) {
          const w = proof?.payee
          if (!w) continue
          const k = w.toLowerCase()
          if (seen.has(k)) continue
          seen.add(k)
          uniquePayees.push(w)
        }
        await Promise.all(uniquePayees.map(async w => {
          try {
            const m = await getMerchantByWallet(w)
            if (m && m.active) merchantProfileCache[w.toLowerCase()] = m
          } catch {}
        }))
      }

      const built = []
      for (const { id, proof } of fetched) {
        let txHash = getCachedTxHash(id)
        if (!txHash && proof.createdBlock && proof.createdBlock > 0n) {
          txHash = await recoverTxHash(id, proof.createdBlock)
        }
        const localReq = localRequests.find(r => r.ref === proof.paymentRef)
        const mp = merchantProfileCache[(proof?.payee || '').toLowerCase()]
        built.push(buildReceiptObject({
          proofData:    proof,
          txHash,
          proofId:      id,
          merchantName: localReq?.name  || null,
          description:  localReq?.desc  || null,
          merchantProfile: mp,
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
          // Build merchant profile cache for commitments
          const cMerchantCache = {}
          if (isMerchantRegistryConfigured()) {
            const seenC = new Set()
            const uniqueM = []
            for (const c of commitmentList) {
              const w = c?.merchant
              if (!w) continue
              const k = w.toLowerCase()
              if (seenC.has(k)) continue
              seenC.add(k); uniqueM.push(w)
            }
            await Promise.all(uniqueM.map(async mw => {
              try {
                const m = await getMerchantByWallet(mw)
                if (m && m.active) cMerchantCache[mw.toLowerCase()] = m
              } catch {}
            }))
          }
          // Enrich commitments with TX hashes + merchant profile for CSV export
          const enrichedC = await Promise.all(commitmentList.map(async cm => {
            const mp = cMerchantCache[(cm?.merchant || '').toLowerCase()]
            const extra = {
              merchantName:      mp?.tradingName || '',
              merchantLegalName: mp?.legalName   || '',
              merchantCountry:   mp?.country     || '',
            }
            try {
              const hashes = await fetchCommitmentTxHashes(cm)
              return { ...cm, ...extra, createTxHash: hashes.createHash, fulfillTxHash: hashes.fulfillHash, cancelTxHash: hashes.cancelHash, trancheHashes: hashes.trancheHashes || [] }
            } catch { return { ...cm, ...extra } }
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
          // Build merchant profile cache for refunds
          const rMerchantCache = {}
          if (isMerchantRegistryConfigured()) {
            const seenR = new Set()
            const uniqueM = []
            for (const r of refundList) {
              const w = r?.merchant
              if (!w) continue
              const k = w.toLowerCase()
              if (seenR.has(k)) continue
              seenR.add(k); uniqueM.push(w)
            }
            await Promise.all(uniqueM.map(async mw => {
              try {
                const m = await getMerchantByWallet(mw)
                if (m && m.active) rMerchantCache[mw.toLowerCase()] = m
              } catch {}
            }))
          }
          // Enrich refunds with TX hashes from on-chain logs + merchant profile
          const enriched = await Promise.all(refundList.map(async r => {
            const mp = rMerchantCache[(r?.merchant || '').toLowerCase()]
            const { requestTxHash, processTxHash } = await fetchRefundTxHashes(r)
            return {
              ...r, requestTxHash, processTxHash,
              merchantName:      mp?.tradingName || '',
              merchantLegalName: mp?.legalName   || '',
              merchantCountry:   mp?.country     || '',
            }
          }))
          setRefunds(enriched)
          // Build lookup: proofRef -> most recent refund
          const byRef = {}
          for (const r of enriched) { if (r.proofRef && !byRef[r.proofRef]) byRef[r.proofRef] = r }
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
  const paymentRecordsCount = receipts.length + commitments.length
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
          <Link to={`/commitment/${cm.commitmentId}?mode=merchant`} style={{ textDecoration: 'none' }}>
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
                <Link to={`/receipt/${matched.receipt_id}?mode=merchant`} style={{ textDecoration: 'none' }}>
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
            { label: 'Payments',             value: paymentRecordsCount.toString(), color: 'var(--text)'  },
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

      {/* ── Unified Payments Table ── */}
      {(receipts.length > 0 || commitments.length > 0) && (() => {
        // Build unified rows
        const rows = []
        // Add immediate payments
        for (const r of receipts) {
          const refund = refundsByRef[r.payment_ref]
          rows.push({
            key:        'pay-' + r.receipt_id,
            ts:         r.timestamp_utc ? Math.floor(new Date(r.timestamp_utc.replace(' UTC','Z').replace(' ','T')).getTime()/1000) : 0,
            ref:        r.payment_ref,
            description:r.description && r.description !== 'Not available — frontend-only metadata not stored on-chain' ? r.description : '',
            type:       'Immediate',
            typeColor:  'var(--usdc)',
            status:     refund ? REFUND_STATUS_LABEL[refund.status] : 'Fulfilled',
            statusColor: refund ? (REFUND_STATUS_COLOR[refund.status] || 'var(--text3)') : 'var(--green)',
            amount:     r.amount,
            counterparty: r.customer_wallet,
            href:       '/receipt/' + r.receipt_id + '?mode=merchant',
            actions:    refund && refund.status === 0 ? 'refund-action' : null,
            refund,
            raw: r,
          })
        }
        // Add commitments (delayed + tranche)
        for (const cm of commitments) {
          const isOverdue = cm.status === 0 && now >= (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || 0)
          const statusLabel = isOverdue ? 'Overdue' : COMMITMENT_STATUS_LABEL[cm.status]
          const statusColor = isOverdue ? '#f08080' : (COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)')
          const refund = refundsByRef[cm.ref]
          rows.push({
            key:        'com-' + cm.commitmentId,
            ts:         cm.createdAt,
            ref:        cm.ref,
            description:cm.description || '',
            type:       COMMITMENT_TYPE_LABEL[cm.type] || (cm.type === 0 ? 'Delayed' : 'Tranche'),
            typeColor:  'var(--usdc)',
            status:     refund ? REFUND_STATUS_LABEL[refund.status] : statusLabel,
            statusColor: refund ? (REFUND_STATUS_COLOR[refund.status] || 'var(--text3)') : statusColor,
            amount:     cm.totalAmount,
            counterparty: cm.customer,
            href:       '/commitment/' + cm.commitmentId + '?mode=merchant',
            actions:    refund && refund.status === 0 ? 'refund-action' : null,
            refund,
            raw: cm,
          })
        }
        // Sort by timestamp DESC
        rows.sort((a, b) => Number(b.ts) - Number(a.ts))

        return (
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
              💳 All payments ({rows.length})
            </h3>
            {refundMsg && (
              <div className={refundMsg.startsWith('Error') ? 'error-box' : 'success-box'} style={{ marginBottom: 12 }}>
                {refundMsg}
              </div>
            )}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 640 }}>
              {/* Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 1.1fr 1.3fr 0.9fr auto',
                gap: 12, padding: '10px 16px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg2, rgba(255,255,255,0.02))',
                fontSize: 11, color: 'var(--text3)',
                textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600,
              }}>
                <div>Payment Ref</div>
                <div>Type</div>
                <div>Status</div>
                <div>From</div>
                <div style={{ textAlign: 'right' }}>Amount</div>
                <div></div>
              </div>
              {/* Rows */}
              {rows.map(row => (
                <div key={row.key} style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 1.1fr 1.3fr 0.9fr auto',
                  gap: 12, padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  alignItems: 'center', fontSize: 13,
                }}>
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{row.ref}</div>
                    {row.description && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description}>{row.description}</div>
                    )}
                  </div>
                  <div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, border: '1px solid ' + row.typeColor + '44', color: row.typeColor, fontWeight: 600 }}>
                      {row.type}
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: row.statusColor + '22', color: row.statusColor, border: '1px solid ' + row.statusColor + '44', fontWeight: 700 }}>
                      {row.status}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text2)' }}>
                    {shortAddress(row.counterparty)}
                    {row.ts > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                        {new Date(Number(row.ts) * 1000).toISOString().slice(0,10)}
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'var(--display)', fontWeight: 700, color: 'var(--usdc)' }}>
                    {row.amount} <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>USDC</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Link to={row.href} style={{ textDecoration: 'none' }}>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>View →</button>
                    </Link>
                  </div>
                </div>
              ))}
              </div>
              </div>
            </div>

            {/* Pending refund inbox callout */}
            {refunds.filter(r => r.status === 0).length > 0 && (
              <div className="card" style={{ marginTop: 14, padding: 14, borderColor: 'var(--yellow)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--yellow)', marginBottom: 8 }}>
                  ⏳ {refunds.filter(r => r.status === 0).length} refund request{refunds.filter(r => r.status === 0).length === 1 ? '' : 's'} pending — action required
                </div>
                {refunds.filter(r => r.status === 0).map(r => (
                  <RefundRow key={r.refundId} r={r} />
                ))}
              </div>
            )}
          </div>
        )
      })()}

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
    </div>
  )
}
