import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import {
  fetchMerchantPayouts, fetchRecipientPayouts, fetchPayoutTxHash,
  fetchMerchantCounterparties, fmtUsdc, formatTs,
  PAYOUT_PURPOSE_CODES,
} from '../utils/payout.js'
import { isValidAddress } from '../utils/wallet.js'
import { isMerchantPayoutsConfigured, isMerchantRegistryConfigured, ARCSCAN_BASE } from '../config.js'
import { getMerchantByWallet } from '../utils/merchant.js'
import { downloadPayoutCSV } from '../utils/payoutCsv.js'

const PURPOSE_LABEL = Object.fromEntries(PAYOUT_PURPOSE_CODES.map(p => [p.value, p.label]))

export default function PayoutDashboardPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isMerchantPayoutsConfigured()

  const [role,           setRole]           = useState('merchant')
  const [addrInput,      setAddrInput]      = useState('')
  const [addr,           setAddr]           = useState('')
  const [payouts,        setPayouts]        = useState([])
  const [cpMap,          setCpMap]          = useState({})  // id -> {aliasName, category}
  const [txHashesReady,  setTxHashesReady]  = useState(false)
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')

  useEffect(() => {
    if (!isConnected || !address) return
    if (!addr) { setAddr(address); setAddrInput(address) }
  }, [isConnected, address])

  useEffect(() => { if (addr) load(addr) }, [addr, role])

  async function load(a) {
    if (!isValidAddress(a)) { setError('Invalid wallet address'); return }
    setLoading(true); setError(''); setTxHashesReady(false)
    try {
      const list = role === 'merchant'
        ? await fetchMerchantPayouts(a)
        : await fetchRecipientPayouts(a)
      setPayouts(list)

      // Load merchant counterparties to resolve alias names (only for merchant role and own wallet)
      let cpLookup = {}
      if (role === 'merchant' && a.toLowerCase() === address?.toLowerCase()) {
        try {
          const cps = await fetchMerchantCounterparties(a)
          cpLookup = Object.fromEntries(cps.map(c => [c.id, { aliasName: c.aliasName, category: c.category }]))
        } catch {}
      }
      setCpMap(cpLookup)

      // Build unique merchant profile lookup
      const merchantProfileCache = {}
      const uniqueMerchants = [...new Set(list.map(p => (p.merchant || '')).filter(Boolean))]
      if (isMerchantRegistryConfigured()) {
        await Promise.all(uniqueMerchants.map(async mw => {
          try {
            const m = await getMerchantByWallet(mw)
            if (m && m.active) merchantProfileCache[mw.toLowerCase()] = m
          } catch {}
        }))
      }
      // Enrich with TX hashes + merchant profile
      const enriched = await Promise.all(list.map(async p => {
        const txHash = await fetchPayoutTxHash(p).catch(() => null)
        const mp = merchantProfileCache[(p.merchant || '').toLowerCase()]
        return {
          ...p, txHash,
          counterpartyAlias:    cpLookup[p.counterpartyId?.toString()]?.aliasName || '',
          counterpartyCategory: cpLookup[p.counterpartyId?.toString()]?.category  || '',
          merchantName:         mp?.tradingName     || '',
          merchantLegalName:    mp?.legalName       || '',
          merchantCountry:      mp?.country         || '',
        }
      }))
      setPayouts(enriched)
      setTxHashesReady(true)
    } catch (e) {
      console.error(e)
      setError('Failed to load payouts. Are you on Arc Testnet?')
    } finally { setLoading(false) }
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)', fontSize: 14 }}>
        Merchant Payouts contract not configured. Deploy <code>ArcMerchantPayouts.sol</code> and update <code>src/config.js</code>.
      </p>
    </div>
  )

  const totalAmount = payouts.reduce((s, p) => s + parseFloat(fmtUsdc(p.amount) || 0), 0)
  const batchItems  = payouts.filter(p => p.batchRefHash && p.batchRefHash !== '0x' + '0'.repeat(64)).length

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Payouts Dashboard
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Monitor outbound USDC payouts to suppliers, contractors and team wallets.</p>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['merchant','💸 Sent by me'], ['recipient','📥 Received by me']].map(([r, label]) => (
            <button key={r} onClick={() => { setRole(r); setPayouts([]) }}
              className={role === r ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 13, padding: '7px 16px' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Wallet address</label>
            <input value={addrInput} onChange={e => setAddrInput(e.target.value)} placeholder="0x..." />
          </div>
          <button onClick={() => setAddr(addrInput.trim())} disabled={loading} className="btn-primary" style={{ padding: '10px 20px', height: 42 }}>
            {loading ? <><span className="spinner" /> Loading...</> : '🔍 Load'}
          </button>
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {payouts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total payouts', value: payouts.length.toString(),     color: 'var(--text)' },
            { label: 'Total amount',  value: `${totalAmount.toFixed(2)} USDC`, color: 'var(--usdc)' },
            { label: 'Batch items',   value: batchItems.toString(),         color: 'var(--text2)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'var(--display)', letterSpacing: '-0.5px' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {payouts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            onClick={() => downloadPayoutCSV(payouts, addr, role)}
            disabled={!txHashesReady}
            className="btn-ghost"
            style={{ fontSize: 13, padding: '8px 16px', opacity: txHashesReady ? 1 : 0.5 }}>
            {txHashesReady ? '📊 Export CSV' : '⏳ Loading TX hashes...'}
          </button>
          <button onClick={() => load(addr)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>↺ Refresh</button>
        </div>
      )}

      {payouts.length === 0 && !loading && addr && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>💸</div>
          <p>No payouts found for this address.</p>
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
                  {p.counterpartyAlias && <span className="badge badge-blue" style={{ fontSize: 10 }}>{p.counterpartyAlias}</span>}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>{p.description}</div>
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  {role === 'merchant' ? `→ ${p.recipient}` : `← ${p.merchant}`} · {PURPOSE_LABEL[p.purposeCode] || p.purposeCode} · {formatTs(p.createdAt)}
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
