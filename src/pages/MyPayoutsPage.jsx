import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import {
  fetchRecipientPayouts, fetchPayoutTxHash,
  fmtUsdc, formatTs, PAYOUT_PURPOSE_CODES,
} from '../utils/payout.js'
import { downloadPayoutCSV } from '../utils/payoutCsv.js'
import { isMerchantPayoutsConfigured, isMerchantRegistryConfigured, ARCSCAN_BASE } from '../config.js'
import { getMerchantByWallet } from '../utils/merchant.js'

const PURPOSE_LABEL = Object.fromEntries(PAYOUT_PURPOSE_CODES.map(p => [p.value, p.label]))

export default function MyPayoutsPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isMerchantPayoutsConfigured()

  const [payouts,       setPayouts]       = useState([])
  const [txHashesReady, setTxHashesReady] = useState(false)
  const [loading,       setLoading]       = useState(false)

  useEffect(() => {
    if (!isConnected || !address || !configured) return
    setLoading(true); setTxHashesReady(false)
    fetchRecipientPayouts(address).then(async list => {
      setPayouts(list)
      // Build merchant profile lookup
      const merchantProfileCache = {}
      const uniqueMerchants = [...new Set(list.map(p => (p.merchant || '').toLowerCase()).filter(Boolean))]
      if (isMerchantRegistryConfigured()) {
        await Promise.all(uniqueMerchants.map(async mw => {
          try {
            const m = await getMerchantByWallet(mw)
            if (m && m.tradingName) merchantProfileCache[mw] = m
          } catch {}
        }))
      }
      const enriched = await Promise.all(list.map(async p => {
        const txHash = await fetchPayoutTxHash(p).catch(() => null)
        const mp = merchantProfileCache[(p.merchant || '').toLowerCase()]
        return {
          ...p, txHash,
          merchantName:      mp?.tradingName || '',
          merchantLegalName: mp?.legalName   || '',
          merchantCountry:   mp?.country     || '',
        }
      }))
      setPayouts(enriched)
      setTxHashesReady(true)
    }).catch(console.error).finally(() => setLoading(false))
  }, [address, isConnected, configured])

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)', fontSize: 14 }}>Merchant Payouts contract not configured.</p>
    </div>
  )

  if (!isConnected) return (
    <div className="card fade-up" style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>📥</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to see USDC payouts you have received.</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  const totalAmount = payouts.reduce((s, p) => s + parseFloat(fmtUsdc(p.amount) || 0), 0)

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Customer</span>
          <span className="badge badge-gray">Payouts</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>My Payouts</h1>
          {payouts.length > 0 && (
            <button
              onClick={() => downloadPayoutCSV(payouts, address, 'recipient')}
              disabled={!txHashesReady}
              className="btn-ghost"
              style={{ fontSize: 12, padding: '7px 14px', opacity: txHashesReady ? 1 : 0.5 }}>
              {txHashesReady ? '⬇ Export CSV' : '⏳ Loading TX hashes...'}
            </button>
          )}
        </div>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>USDC payouts received from merchants on Arc Testnet.</p>
      </div>

      {payouts.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--usdc)', fontFamily: 'var(--display)' }}>{totalAmount.toFixed(2)} USDC</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>Total received · {payouts.length} payout{payouts.length !== 1 ? 's' : ''}</div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}><span className="spinner" /> Loading...</div>
      )}

      {!loading && payouts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📥</div>
          <p>No payouts received yet.</p>
        </div>
      )}

      {payouts.map(p => {
        const isBatch = p.batchRefHash && p.batchRefHash !== '0x' + '0'.repeat(64)
        return (
          <div key={p.id} className="card" style={{ marginBottom: 8, padding: '12px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{p.paymentRef}</span>
                  {isBatch && <span className="badge badge-gray" style={{ fontSize: 10 }}>Batch item</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{p.description}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  ← {p.merchantName ? `${p.merchantName} · ` : ''}{p.merchant} · {PURPOSE_LABEL[p.purposeCode] || p.purposeCode} · {formatTs(p.createdAt)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{fmtUsdc(p.amount)} USDC</div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <Link to={`/payout/${p.id}`} style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
                </Link>
                {p.txHash && (
                  <a href={`${ARCSCAN_BASE}/tx/${p.txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>ArcScan ↗</button>
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
