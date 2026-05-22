import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { readContract } from '@wagmi/core'
import { wagmiConfig } from '../walletConfig.js'
import { getPublicClient } from '../utils/wallet.js'
import { getMerchantByWallet } from '../utils/merchant.js'
import { isMerchantRegistryConfigured } from '../config.js'
import { ARCPROOF_ADDRESS, ARCSCAN_BASE, isCommitmentContractConfigured } from '../config.js'
import ArcProofABI from '../abis/ArcProof.json'
import { getCachedTxHash } from '../utils/paymentRequest.js'
import { fetchCustomerCommitmentIds, fetchCommitment, fulfillDelayedCommitment, fulfillTranche, COMMITMENT_STATUS_LABEL, COMMITMENT_STATUS_COLOR, COMMITMENT_TYPE_LABEL } from '../utils/commitment.js'
import { formatUsdc, formatTs, recoverTxHash } from '../utils/receipts.js'
import { shortAddress } from '../utils/wallet.js'

async function fetchSentProofIds(payerAddress) {
  try {
    // Usa getProofsSent dal contratto — più veloce di getLogs
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

export default function MyPaymentsPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const [payments,    setPayments]    = useState([])
  const [commitments, setCommitments] = useState([])
  const [loading,     setLoading]     = useState(false)
  const [acting,      setActing]      = useState(null)

  useEffect(() => {
    if (!isConnected || !address) return
    setLoading(true)
    fetchSentProofIds(address).then(async ids => {
      const proofs = await Promise.all(ids.map(fetchProof))
      const valid = proofs.filter(Boolean).sort((a, b) => Number(b.timestamp) - Number(a.timestamp))
      // Recupera txHash e nome merchant per ogni proof
      const withTx = await Promise.all(valid.map(async p => {
        const txHash = getCachedTxHash(p.proofId) || await recoverTxHash(p.proofId, p.createdBlock)
        let merchantName = ''
        if (isMerchantRegistryConfigured()) {
          try {
            const m = await getMerchantByWallet(p.payee)
            if (m && m.tradingName) merchantName = m.tradingName
          } catch {}
        }
        return { ...p, txHash, merchantName }
      }))
      setPayments(withTx)

      // Load commitments
      if (isCommitmentContractConfigured()) {
        try {
          const ids = await fetchCustomerCommitmentIds(address)
          const list = []
          for (const id of [...ids].reverse()) {
            const cm = await fetchCommitment(id)
            if (cm) list.push(cm)
          }
          setCommitments(list)
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
    } catch(e) { alert(e.message || 'Transaction failed') }
    finally { setActing(null) }
  }

  async function handlePayTranche(cm, idx) {
    setActing(`${cm.commitmentId}-${idx}`)
    try {
      await fulfillTranche(address, cm.commitmentId, idx)
      const updated = await fetchCommitment(cm.commitmentId)
      setCommitments(prev => prev.map(c => c.commitmentId === cm.commitmentId ? updated : c))
    } catch(e) { alert(e.message || 'Transaction failed') }
    finally { setActing(null) }
  }

  function exportCSV() {
    const rows = [
      ['timestamp','merchantName','merchantWallet','customerWallet','amount','token','network','chainId','paymentRef','purposeCode','description','txHash','arcscanUrl','receiptUrl','status','testnetDisclaimer'],
      ...payments.map(p => [
        formatTs(Number(p.timestamp)),
        p.merchantName || p.payee,
        p.payee,
        p.payer,
        formatUsdc(p.amount),
        'USDC',
        'Arc Testnet',
        '5042002',
        p.paymentRef || '',
        p.purposeCode || '',
        p.description || '',
        p.txHash || '',
        p.txHash ? `https://testnet.arcscan.app/tx/${p.txHash}` : '',
        `https://arc-pay-testnet.vercel.app/receipt/${p.proofId}`,
        'Confirmed',
        'TESTNET ONLY. Testnet tokens have no real economic value.',
      ])
    ]
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `arcpay_mypayments_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const total = payments.reduce((s, p) => s + Number(formatUsdc(p.amount)), 0).toFixed(2)
  const now = Math.floor(Date.now() / 1000)
  const pendingCommitments = commitments.filter(c => c.status === 0)

  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>💳</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to see your payments</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  return (
    <div className="fade-up">
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

      {payments.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Total sent</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--usdc)' }}>{total} USDC</div>
          </div>
          <div className="card" style={{ padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>Payments</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{payments.length}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}>
          <span className="spinner" /> Loading payments...
        </div>
      ) : (
        <>
        {/* Commitments section — booking-style layout */}
        {commitments.length > 0 && (() => {
          const active    = commitments.filter(c => c.status === 0)
          const fulfilled = commitments.filter(c => c.status === 1)
          const cancelled = commitments.filter(c => c.status === 2 || c.status === 3)
          const overdue   = active.filter(cm => now >= (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || 0))

          function CommitRow({ cm }) {
            const nextTranche   = cm.type === 1 ? cm.trancheAmounts.findIndex((_, i) => !cm.tranchePaid[i]) : -1
            const canPayDelayed = cm.type === 0 && cm.status === 0 && !cm.paid && now >= cm.dueDate
            const canPayTranche = cm.type === 1 && cm.status === 0 && nextTranche >= 0 && now >= (cm.trancheDueDates[nextTranche] || 0)
            const isOverdue     = cm.status === 0 && now >= (cm.deadline || cm.trancheDeadlines?.[cm.tranchesPaidCount] || 0)
            const statusColor   = isOverdue ? '#f08080' : COMMITMENT_STATUS_COLOR[cm.status] || 'var(--text3)'
            const statusLabel   = isOverdue ? 'Overdue' : COMMITMENT_STATUS_LABEL[cm.status]
            return (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: statusColor }}>● {statusLabel}</span>
                    <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{cm.ref}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{COMMITMENT_TYPE_LABEL[cm.type]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Link to={`/commitment/${cm.commitmentId}`} style={{ textDecoration: 'none' }}>
                      <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
                    </Link>
                    {canPayDelayed && (
                      <button onClick={() => handlePay(cm)} disabled={acting === cm.commitmentId} className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}>
                        {acting === cm.commitmentId ? '...' : '✅ Pay now'}
                      </button>
                    )}
                    {canPayTranche && (
                      <button onClick={() => handlePayTranche(cm, nextTranche)} disabled={acting === `${cm.commitmentId}-${nextTranche}`} className="btn-primary" style={{ fontSize: 11, padding: '4px 12px' }}>
                        {acting === `${cm.commitmentId}-${nextTranche}` ? '...' : `✅ Pay tranche ${nextTranche + 1} (${cm.trancheAmounts[nextTranche]} USDC)`}
                      </button>
                    )}
                  </div>
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--usdc)', flexShrink: 0 }}>{cm.totalAmount} USDC</span>
              </div>
            )
          }

          return (
            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                📅 Delayed & Tranche Payments ({commitments.length})
              </h3>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {overdue.length > 0 && <div style={{ padding: '8px 16px', background: '#1a0808', fontSize: 11, fontWeight: 700, color: '#f08080', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠️ Overdue ({overdue.length})</div>}
                {overdue.map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
                {active.filter(cm => !(now >= (cm.deadline || 0))).length > 0 && <div style={{ padding: '8px 16px', background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--usdc)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active ({active.length - overdue.length})</div>}
                {active.filter(cm => !(now >= (cm.deadline || 0))).map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
                {fulfilled.length > 0 && <div style={{ padding: '8px 16px', background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fulfilled ({fulfilled.length})</div>}
                {fulfilled.map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
                {cancelled.length > 0 && <div style={{ padding: '8px 16px', background: 'var(--surface2)', fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cancelled / Expired ({cancelled.length})</div>}
                {cancelled.map(cm => <CommitRow key={cm.commitmentId} cm={cm} />)}
              </div>
            </div>
          )
        })()}

        {/* Immediate payments */}
        {payments.length === 0 && commitments.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
            No payments found for this wallet.
          </div>
        ) : payments.length > 0 ? (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {payments.map((p, i) => (
            <div key={p.proofId.toString()} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 20px', borderBottom: i < payments.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="badge badge-gray" style={{ fontSize: 10 }}>{p.purposeCode}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{p.paymentRef}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>To: {shortAddress(p.payee)} · {formatTs(Number(p.timestamp))}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700, color: 'var(--usdc)', marginBottom: 4 }}>
                  {formatUsdc(p.amount)} USDC
                </div>
                <Link to={`/receipt/${p.proofId}`} style={{ fontSize: 11, color: 'var(--usdc)', textDecoration: 'none' }}>
                  View receipt →
                </Link>
              </div>
            </div>
          ))}
        </div>
        ) : null}
        </>
      )}
    </div>
  )
}
