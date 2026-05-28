import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { readContract } from '@wagmi/core'
import { wagmiConfig } from '../walletConfig.js'
import { getPublicClient } from '../utils/wallet.js'
import { getMerchantByWallet } from '../utils/merchant.js'
import { isMerchantRegistryConfigured } from '../config.js'
import { ARCPROOF_ADDRESS, ARCSCAN_BASE, isCommitmentContractConfigured, isRefundContractConfigured } from '../config.js'
import ArcProofABI from '../abis/ArcProof.json'
import { getCachedTxHash } from '../utils/paymentRequest.js'
import { downloadUnifiedCSV } from '../utils/csv.js'
import {
  fetchCustomerRefundIds, fetchRefundRequest,
  REFUND_STATUS_LABEL, REFUND_STATUS_COLOR,
} from '../utils/refund.js'
import {
  fetchCustomerCommitmentIds, fetchCommitment, fetchCommitmentTxHashes,
  fulfillDelayedCommitment, fulfillTranche,
  COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL,
} from '../utils/commitment.js'
import { formatUsdc, formatTs, recoverTxHash } from '../utils/receipts.js'
import { shortAddress } from '../utils/wallet.js'

async function fetchSentProofIds(payerAddress) {
  try {
    const result = await readContract(wagmiConfig, {
      address: ARCPROOF_ADDRESS,
      abi: ArcProofABI,
      functionName: 'getProofsSent',
      args: [payerAddress],
    })
    return result || []
  } catch { return [] }
}

async function fetchProof(proofId) {
  try {
    return await readContract(wagmiConfig, {
      address: ARCPROOF_ADDRESS,
      abi: ArcProofABI,
      functionName: 'getProof',
      args: [proofId],
    })
  } catch { return null }
}

// ── Booking-style status badge ────────────────────────────────────────────────
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

export default function MyPaymentsPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const [payments,    setPayments]    = useState([])
  const [commitments, setCommitments] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [acting,      setActing]      = useState(null)
  const [refunds,     setRefunds]     = useState([])
  const [refundsByRef, setRefundsByRef] = useState({})

  useEffect(() => {
    if (!isConnected || !address) return
    setLoading(true)
    fetchSentProofIds(address).then(async ids => {
      const proofs = await Promise.all(ids.map(fetchProof))
      const valid  = proofs.filter(Boolean).sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
      const withTx = await Promise.all(valid.map(async p => {
        const txHash = getCachedTxHash(p.proofId) || await recoverTxHash(p.proofId, p.createdBlock)
        let merchantName = ''
        let merchantLegalName = ''
        let merchantCountry   = ''
        if (isMerchantRegistryConfigured()) {
          try {
            const m = await getMerchantByWallet(p.payee)
            if (m && m.active) {
              merchantName      = m.tradingName
              merchantLegalName = m.legalName || ''
              merchantCountry   = m.country   || ''
            }
          } catch {}
        }
        return { ...p, txHash, merchantName, merchantLegalName, merchantCountry }
      }))
      setPayments(withTx)

      if (isCommitmentContractConfigured()) {
        try {
          const cIds = await fetchCustomerCommitmentIds(address)
          const list = []
          for (const id of [...cIds].reverse()) {
            const cm = await fetchCommitment(id)
            if (cm) list.push(cm)
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
          // Enrich with TX hashes
          for (const cm of list) {
            try {
              const hashes = await fetchCommitmentTxHashes(cm)
              cm.createTxHash  = hashes.createHash  || null
              cm.fulfillTxHash = hashes.fulfillHash || null
              cm.cancelTxHash  = hashes.cancelHash  || null
              cm.trancheHashes = hashes.trancheHashes || []
            } catch {}
          }
          setCommitments(list)
        } catch {}
      }

      // Load customer refunds and build proofRef -> refund lookup
      if (isRefundContractConfigured()) {
        try {
          const rIds = await fetchCustomerRefundIds(address)
          const rList = []
          const byRef = {}
          for (const rid of [...rIds].reverse()) {
            const r = await fetchRefundRequest(rid)
            if (r) { rList.push(r); if (r.proofRef) byRef[r.proofRef] = r }
          }
          // Build merchant profile cache for refunds
          const refundMerchantCache = {}
          if (isMerchantRegistryConfigured()) {
            const uniqueM = [...new Set(rList.map(r => r?.merchant).filter(Boolean))]
            await Promise.all(uniqueM.map(async mw => {
              try {
                const m = await getMerchantByWallet(mw)
                if (m && m.active) refundMerchantCache[mw.toLowerCase()] = m
              } catch {}
            }))
          }
          // Enrich refunds with TX hashes from on-chain logs + merchant profile
          const enrichedR = await Promise.all(rList.map(async r => {
            const mp = refundMerchantCache[(r?.merchant || '').toLowerCase()]
            const { requestTxHash, processTxHash } = await fetchRefundTxHashes(r)
            return {
              ...r, requestTxHash, processTxHash,
              merchantName:      mp?.tradingName || '',
              merchantLegalName: mp?.legalName   || '',
              merchantCountry:   mp?.country     || '',
            }
          }))
          setRefunds(enrichedR)
          const enrichedByRef = {}
          for (const r of enrichedR) { if (r.proofRef) enrichedByRef[r.proofRef] = r }
          setRefundsByRef(enrichedByRef)
        } catch {}
      }
    }).finally(() => setLoading(false))
  }, [address, isConnected])

  async function handlePay(cm) {
    setActing(cm.commitmentId)
    try {
      await fulfillDelayedCommitment(address, cm.commitmentId)
      const updated = await fetchCommitment(cm.commitmentId)
      setCommitments(prev => prev.map(c => c.commitmentId === cm.commitmentId ? updated : c))
    } catch (e) { alert(e.message || 'Transaction failed') }
    finally { setActing(null) }
  }

  async function handlePayTranche(cm, idx) {
    setActing(`${cm.commitmentId}-${idx}`)
    try {
      await fulfillTranche(address, cm.commitmentId, idx)
      const updated = await fetchCommitment(cm.commitmentId)
      setCommitments(prev => prev.map(c => c.commitmentId === cm.commitmentId ? updated : c))
    } catch (e) { alert(e.message || 'Transaction failed') }
    finally { setActing(null) }
  }

  function exportCSV() {
    const receipts = payments.map(p => ({
      timestamp_utc:       formatTs(Number(p.timestamp)),
      merchant_name:       p.merchantName || '',
      merchant_legal_name: p.merchantLegalName || '',
      merchant_country:    p.merchantCountry   || '',
      merchant_wallet:  p.payee,
      customer_wallet:  p.payer,
      amount:           formatUsdc(p.amount),
      token_symbol:     'USDC',
      network:          'Arc Testnet',
      payment_ref:      p.paymentRef || '',
      purpose_code:     p.purposeCode || '',
      description:      p.description || '',
      transaction_hash: p.txHash || '',
      arcscan_link:     p.txHash ? `https://testnet.arcscan.app/tx/${p.txHash}` : '',
      receipt_page:     `https://arc-pay-testnet.vercel.app/receipt/${p.proofId}`,
      status:           'Confirmed',
      refundStatus:     refundsByRef[p.paymentRef] ? REFUND_STATUS_LABEL[refundsByRef[p.paymentRef].status] : '—',
    }))
    downloadUnifiedCSV({ receipts, commitments, refunds, walletAddress: address, role: 'customer' })
  }

  const total = payments.reduce((s, p) => s + Number(formatUsdc(p.amount)), 0).toFixed(2)
  const now   = Math.floor(Date.now() / 1000)

  // ── Commitment sections ────────────────────────────────────────────────────
  const active    = commitments.filter(c => c.status === 0)
  const overdue   = active.filter(cm => now >= (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || 0))
  const onTime    = active.filter(cm => now < (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || Infinity))
  const fulfilled = commitments.filter(c => c.status === 1)
  const cancelled = commitments.filter(c => c.status === 2 || c.status === 3)

  // CommitRow: shows Pay button for ANY active unpaid commitment/tranche
  // (no dueDate check — contract has no deadline restriction on fulfill)
  function CommitRow({ cm }) {
    const isOverdue   = cm.status === 0 && now >= (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || 0)
    const statusColor = isOverdue ? '#f08080' : COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)'
    const statusLabel = isOverdue ? 'Overdue' : COMMITMENT_STATUS_LABEL[cm.status]

    // All unpaid tranches (not just the "next" one — contract allows any order)
    const unpaidTranches = cm.type === 1
      ? cm.trancheAmounts.map((amt, i) => ({ amt, i })).filter(({ i }) => !cm.tranchePaid[i])
      : []

    return (
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <CommitBadge label={statusLabel} color={statusColor} />
            <CommitBadge label={COMMITMENT_TYPE_LABEL[cm.type]} color="var(--usdc)" />
            <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{cm.ref}</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to={`/commitment/${cm.commitmentId}?mode=customer`} style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
            </Link>
            {/* Delayed payment — pay button when active */}
            {cm.type === 0 && cm.status === 0 && !cm.paid && (
              <button
                onClick={() => handlePay(cm)}
                disabled={acting === cm.commitmentId}
                className="btn-primary"
                style={{ fontSize: 11, padding: '4px 12px' }}
              >
                {acting === cm.commitmentId ? '...' : '✅ Pay now'}
              </button>
            )}
            {/* Tranche payment — pay button per unpaid tranche */}
            {unpaidTranches.map(({ amt, i }) => (
              <button
                key={i}
                onClick={() => handlePayTranche(cm, i)}
                disabled={acting === `${cm.commitmentId}-${i}`}
                className="btn-primary"
                style={{ fontSize: 11, padding: '4px 12px' }}
              >
                {acting === `${cm.commitmentId}-${i}` ? '...' : `✅ Tranche ${i + 1} (${amt} USDC)`}
              </button>
            ))}
          </div>
        </div>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--usdc)', flexShrink: 0 }}>
          {cm.totalAmount} USDC
          {cm.type === 1 && (
            <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>
              {cm.tranchesPaidCount}/{cm.trancheAmounts.length}
            </span>
          )}
        </span>
      </div>
    )
  }

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>💳</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to see your payments</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Customer</span>
          <span className="badge badge-gray">Payments</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>My Payments</h1>
            <p style={{ color: 'var(--text2)', fontSize: 13 }}>Payments sent from {shortAddress(address)}</p>
          </div>
          {payments.length > 0 && (
            <button onClick={exportCSV} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>⬇ Export CSV</button>
          )}
        </div>
      </div>

      {/* Stats */}
      {(payments.length > 0 || commitments.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Total sent</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--usdc)' }}>{total} USDC</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Payments</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{payments.length}</div>
          </div>
          {commitments.length > 0 && (
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Commitments</div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: active.length > 0 ? 'var(--yellow)' : 'var(--text)' }}>
                {active.length} active
              </div>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="spinner" /> Loading payments...
        </div>
      ) : payments.length === 0 && commitments.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          No payments found for this wallet.
        </div>
      ) : (() => {
        // Build unified rows: immediate + commitments sorted by ts DESC
        const rows = []
        for (const p of payments) {
          const refund = refundsByRef[p.paymentRef]
          rows.push({
            key:         'pay-' + p.proofId.toString(),
            ts:          Number(p.timestamp),
            ref:         p.paymentRef || '',
            description: p.description && !p.description.startsWith('Not available') ? p.description : '',
            type:        'Immediate',
            typeColor:   'var(--usdc)',
            status:      refund ? REFUND_STATUS_LABEL[refund.status] : 'Fulfilled',
            statusColor: refund ? (REFUND_STATUS_COLOR[refund.status] || 'var(--text3)') : 'var(--green)',
            merchant:    p.merchantName || shortAddress(p.payee),
            amount:      formatUsdc(p.amount),
            href:        `/receipt/${p.proofId}?mode=customer`,
            isActive:    false,
            cm:          null,
            refund,
          })
        }
        for (const cm of commitments) {
          const isOverdue   = cm.status === 0 && now >= (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || 0)
          const statusLabel = isOverdue ? 'Overdue' : COMMITMENT_STATUS_LABEL[cm.status]
          const statusColor = isOverdue ? '#f08080' : (COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)')
          const refund      = refundsByRef[cm.ref]
          rows.push({
            key:         'com-' + cm.commitmentId,
            ts:          cm.createdAt,
            ref:         cm.ref || '',
            description: cm.description || '',
            type:        COMMITMENT_TYPE_LABEL[cm.type] || (cm.type === 0 ? 'Delayed Payment' : 'Tranche Payment'),
            typeColor:   'var(--usdc)',
            status:      refund ? REFUND_STATUS_LABEL[refund.status] : statusLabel,
            statusColor: refund ? (REFUND_STATUS_COLOR[refund.status] || 'var(--text3)') : statusColor,
            merchant:    cm.merchantName || shortAddress(cm.merchant),
            amount:      cm.totalAmount,
            href:        `/commitment/${cm.commitmentId}?mode=customer`,
            isActive:    cm.status === 0,
            cm,
            refund,
          })
        }
        rows.sort((a, b) => Number(b.ts) - Number(a.ts))

        const pendingRefunds = refunds.filter(r => r.status === 0)

        return (
          <>
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                💳 All payments ({rows.length})
              </h3>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                <div style={{ minWidth: 640 }}>
                {/* Table header */}
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
                  <div>Merchant</div>
                  <div style={{ textAlign: 'right' }}>Amount</div>
                  <div></div>
                </div>

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
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description}>
                          {row.description}
                        </div>
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
                    <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {row.merchant}
                      {row.ts > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                          {new Date(Number(row.ts) * 1000).toISOString().slice(0, 10)}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: 'var(--display)', fontWeight: 700, color: 'var(--usdc)' }}>
                      {row.amount} <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>USDC</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexDirection: 'column', alignItems: 'flex-end' }}>
                      <Link to={row.href} style={{ textDecoration: 'none' }}>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}>View →</button>
                      </Link>
                      {/* Pay button for active commitments */}
                      {row.isActive && row.cm && row.cm.type === 0 && (
                        <button
                          onClick={() => handlePay(row.cm)}
                          disabled={!!acting}
                          className="btn-primary"
                          style={{ fontSize: 11, padding: '5px 10px' }}
                        >
                          {acting === row.cm.commitmentId ? <><span className="spinner" /> Paying...</> : 'Pay now'}
                        </button>
                      )}
                      {row.isActive && row.cm && row.cm.type === 1 && (() => {
                        const unpaid = row.cm.trancheAmounts
                          .map((amt, i) => ({ amt, i }))
                          .filter(({ i }) => !row.cm.tranchePaid[i])
                        return unpaid.slice(0, 1).map(({ amt, i }) => (
                          <button
                            key={i}
                            onClick={() => handlePayTranche(row.cm, i)}
                            disabled={!!acting}
                            className="btn-primary"
                            style={{ fontSize: 11, padding: '5px 10px' }}
                          >
                            {acting === `${row.cm.commitmentId}-${i}` ? <><span className="spinner" /> Paying...</> : `Pay tranche ${i + 1}`}
                          </button>
                        ))
                      })()}
                    </div>
                  </div>
                ))}
                </div>
                </div>
              </div>

              {/* Pending refund requests callout */}
              {pendingRefunds.length > 0 && (
                <div className="card" style={{ marginTop: 14, padding: 14, borderColor: 'var(--yellow)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--yellow)' }}>
                    ⏳ {pendingRefunds.length} refund request{pendingRefunds.length === 1 ? '' : 's'} pending merchant review
                  </div>
                </div>
              )}
            </div>
          </>
        )
      })()}
    </div>
  )
}