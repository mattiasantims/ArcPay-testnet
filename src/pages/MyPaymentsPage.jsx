import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { readContract } from '@wagmi/core'
import { wagmiConfig } from '../walletConfig.js'
import { getPublicClient } from '../utils/wallet.js'
import { ARCPROOF_ADDRESS, ARCSCAN_BASE } from '../config.js'
import ArcProofABI from '../abis/ArcProof.json'
import { formatUsdc, formatTs } from '../utils/receipts.js'
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
  const [payments, setPayments] = useState([])
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (!isConnected || !address) return
    setLoading(true)
    fetchSentProofIds(address).then(async ids => {
      const proofs = await Promise.all(ids.map(fetchProof))
      setPayments(proofs.filter(Boolean).sort((a, b) => Number(b.timestamp) - Number(a.timestamp)))
    }).finally(() => setLoading(false))
  }, [address, isConnected])

  function exportCSV() {
    const rows = [
      ['timestamp','merchantName','merchantWallet','customerWallet','amount','token','network','chainId','paymentRef','purposeCode','description','txHash','arcscanUrl','receiptUrl','status','testnetDisclaimer'],
      ...payments.map(p => [
        formatTs(Number(p.timestamp)),
        p.payee,
        p.payee,
        p.payer,
        formatUsdc(p.amount),
        'USDC',
        'Arc Testnet',
        '5042002',
        p.paymentRef,
        p.purposeCode,
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
      ) : payments.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
          No payments found for this wallet.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {payments.map((p, i) => (
            <div key={p.proofId.toString()} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 20px', borderBottom: i < payments.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>#{p.proofId.toString()}</span>
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
      )}
    </div>
  )
}
