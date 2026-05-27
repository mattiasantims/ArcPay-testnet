import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import {
  fetchMerchantTravelIds, fetchCustomerTravelIds,
  fetchTravelBooking, fetchTravelTxHashes, fromUsdc,
  TRAVEL_STATUS_LABEL, TRAVEL_STATUS_COLOR,
  getCachedTravelTxHash,
} from '../utils/travel.js'
import { isValidAddress, shortAddress } from '../utils/wallet.js'
import { isTravelContractConfigured, isMerchantRegistryConfigured, ARCSCAN_BASE } from '../config.js'
import { getMerchantIdByWallet, getMerchantWallets, getMerchantByWallet } from '../utils/merchant.js'
import { downloadTravelCSV } from '../utils/travelCsv.js'

export default function TravelDashboardPage({ account }) {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isTravelContractConfigured()

  const [role,     setRole]     = useState('merchant')
  const [addrInput, setAddrInput] = useState('')
  const [addr,     setAddr]     = useState('')
  const [bookings,      setBookings]      = useState([])
  const [txHashesReady, setTxHashesReady] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [linkedWallets, setLinkedWallets] = useState([])
  const [error,    setError]    = useState('')
  const [now,      setNow]      = useState(Math.floor(Date.now() / 1000))

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!isConnected || !address) return
    if (isMerchantRegistryConfigured()) {
      getMerchantIdByWallet(address).then(async id => {
        if (id && id.toString() !== '0') {
          const wallets = await getMerchantWallets(id)
          if (wallets && wallets.length > 0) {
            setLinkedWallets(wallets.map(w => w.toLowerCase()))
          }
        }
        if (!addr) { setAddr(address); setAddrInput(address) }
      }).catch(() => {
        if (!addr) { setAddr(address); setAddrInput(address) }
      })
    } else {
      if (!addr) { setAddr(address); setAddrInput(address) }
    }
  }, [address, isConnected])

  useEffect(() => { if (addr) load() }, [addr, role])

  async function load() {
    if (!isValidAddress(addr)) { setError('Invalid wallet address'); return }
    setLoading(true); setError('')
    try {
      let ids = []
      if (role === 'merchant') {
        const walletsToLoad = linkedWallets.length > 0 ? linkedWallets : [addr]
        for (const w of walletsToLoad) {
          const wIds = await fetchMerchantTravelIds(w)
          ids.push(...wIds)
        }
        ids = [...new Set(ids.map(id => id.toString()))].map(id => BigInt(id))
      } else {
        ids = await fetchCustomerTravelIds(addr)
      }
      setTxHashesReady(false)
      const fetched = []
      for (const id of [...ids].reverse()) {
        try {
          const t = await fetchTravelBooking(id.toString())
          if (t) fetched.push(t)
        } catch {}
      }
      setBookings(fetched)
      // Build merchant profile cache
      const merchantProfileCache = {}
      if (isMerchantRegistryConfigured()) {
        const uniqueMerchants = [...new Set(fetched.map(t => (t?.merchant || '')).filter(Boolean))]
        await Promise.all(uniqueMerchants.map(async mw => {
          try {
            const m = await getMerchantByWallet(mw)
            if (m && m.active) merchantProfileCache[mw.toLowerCase()] = m
          } catch {}
        }))
      }

      // Enrich with TX hashes from scanBlock + merchant profile
      const enriched = await Promise.all(fetched.map(async t => {
        const mp = merchantProfileCache[(t?.merchant || '').toLowerCase()]
        try {
          const h = await fetchTravelTxHashes(t)
          return {
            ...t,
            createTxHash:         h.createHash,
            cancelTxHash:         h.cancelHash,
            releaseTxHash:        h.releaseHash,
            trancheRequestTxHash: h.trancheReqHash,
            tranchePaidTxHash:    h.tranchePaidHash,
            merchantName:         mp?.tradingName || '',
            merchantLegalName:    mp?.legalName   || '',
            merchantCountry:      mp?.country     || '',
          }
        } catch {
          return {
            ...t,
            merchantName:         mp?.tradingName || '',
            merchantLegalName:    mp?.legalName   || '',
            merchantCountry:      mp?.country     || '',
          }
        }
      }))
      setBookings(enriched)
      setTxHashesReady(true)
    } catch { setError('Failed to load. Are you on Arc Testnet?') }
    finally { setLoading(false) }
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)', fontSize: 14 }}>
        Travel escrow contract not configured. Deploy <code>ArcTravelEscrow.sol</code> and update <code>src/config.js</code>.
      </p>
    </div>
  )

  // Classify
  const active      = bookings.filter(b => b.status === 0)
  const tranchePaid = bookings.filter(b => b.status === 1)
  const closed      = bookings.filter(b => b.status >= 2)

  const upcoming    = active.filter(b => now < b.paymentDueDate)
  const readyToReq  = active.filter(b => now >= b.paymentDueDate && now < b.paymentDeadline && !b.trancheRequested)
  const awaiting    = active.filter(b => b.trancheRequested && !b.tranchePaid && now <= b.paymentDeadline)
  const overdue     = active.filter(b => !b.tranchePaid && now > b.paymentDeadline)
  const releasable  = [...active, ...tranchePaid].filter(b => now >= b.cancellationDeadline)

  const totalInitial  = bookings.reduce((s, b) => s + fromUsdc(b.initialPaymentAmount), 0)
  const totalEscrow   = [...active, ...tranchePaid].reduce((s, b) => s + fromUsdc(b.refundableEscrowAmount), 0)
  const totalNonRef   = bookings.reduce((s, b) => s + fromUsdc(b.nonRefundableAmount), 0)
  const totalTranches = bookings.filter(b => b.tranchePaid).reduce((s, b) => s + fromUsdc(b.trancheAmount), 0)
  const totalOverdue  = overdue.reduce((s, b) => s + fromUsdc(b.trancheAmount), 0)

  function StatusBadge({ status }) {
    return (
      <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, background: `${TRAVEL_STATUS_COLOR[status]}22`, border: `1px solid ${TRAVEL_STATUS_COLOR[status]}44`, color: TRAVEL_STATUS_COLOR[status], fontFamily: 'var(--mono)' }}>
        {TRAVEL_STATUS_LABEL[status]}
      </span>
    )
  }

  function BookingRow({ b, highlight }) {
    return (
      <div className="card" style={{ marginBottom: 8, padding: '12px 16px', ...(highlight ? { borderColor: highlight } : {}) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={b.status} />
            <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{b.travelRef}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{fromUsdc(b.totalPackageAmount).toFixed(2)} USDC</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Tranche: {fromUsdc(b.trancheAmount).toFixed(2)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Link to={`/travel/${b.travelId}?mode=${role}`} style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
              </Link>
              {b.txHash && (
                <a href={`${ARCSCAN_BASE}/tx/${b.txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>ArcScan ↗</button>
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Travel Booking Dashboard
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Monitor scheduled travel payments, tranches, and escrow status.</p>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {['merchant', 'customer'].map(r => (
            <button key={r} onClick={() => { setRole(r); setBookings([]) }}
              className={role === r ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 13, padding: '7px 16px', textTransform: 'capitalize' }}>
              {r === 'merchant' ? '✈️ Agency view' : '👤 Customer view'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Wallet address</label>
            <input value={addrInput} onChange={e => setAddrInput(e.target.value)} placeholder="0x..." />
          </div>
          <button onClick={() => setAddr(addrInput.trim())} disabled={loading} className="btn-primary" style={{ padding: '10px 20px', height: 42 }}>
            {loading ? <><span className="spinner" />Loading...</> : '🔍 Load'}
          </button>
          {!isConnected && (
            <button onClick={() => open()} className="btn-ghost" style={{ padding: '10px 16px', height: 42 }}>Connect</button>
          )}
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Stats */}
      {bookings.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total bookings',    value: bookings.length, color: 'var(--text)' },
            { label: 'Initial collected', value: `${totalInitial.toFixed(2)} USDC`, color: 'var(--usdc)' },
            { label: 'Escrow locked',     value: `${totalEscrow.toFixed(2)} USDC`, color: 'var(--green)' },
            { label: 'Non-ref retained',  value: `${totalNonRef.toFixed(2)} USDC`, color: '#f04f4f' },
            { label: 'Tranches paid',     value: `${totalTranches.toFixed(2)} USDC`, color: 'var(--usdc)' },
            { label: 'Overdue tranches',  value: overdue.length, color: overdue.length > 0 ? 'var(--red)' : 'var(--text3)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, fontFamily: 'var(--display)' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Export + Refresh */}
      {bookings.length > 0 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => downloadTravelCSV(bookings, addr)} disabled={!txHashesReady} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px', opacity: txHashesReady ? 1 : 0.5 }}>
            {txHashesReady ? '📊 Export CSV' : '⏳ Loading TX hashes...'}
          </button>
          <button onClick={() => setAddr(addr)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            ↺ Refresh
          </button>
        </div>
      )}

      {/* Releasable */}
      {releasable.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ✈️ Ready to Release ({releasable.length})
          </h3>
          {releasable.map(b => <BookingRow key={b.travelId} b={b} highlight="var(--green-bdr)" />)}
        </div>
      )}

      {/* Overdue */}
      {overdue.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ⚠️ Overdue — Missed Payment ({overdue.length})
          </h3>
          <div style={{ background: '#1a0808', border: '1px solid #5a1c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#f08080', lineHeight: 1.6 }}>
            These customers missed the payment deadline. As the agency, you can cancel and retain the escrow.
          </div>
          {overdue.map(b => <BookingRow key={b.travelId} b={b} highlight="#5a1c1c" />)}
        </div>
      )}

      {/* Awaiting payment */}
      {awaiting.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ⏳ Awaiting Customer Payment ({awaiting.length})
          </h3>
          {awaiting.map(b => <BookingRow key={b.travelId} b={b} highlight="#f0c04044" />)}
        </div>
      )}

      {/* Ready to request */}
      {readyToReq.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--usdc)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            📨 Ready to Request ({readyToReq.length})
          </h3>
          {readyToReq.map(b => <BookingRow key={b.travelId} b={b} highlight="var(--border2)" />)}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            📅 Upcoming ({upcoming.length})
          </h3>
          {upcoming.map(b => <BookingRow key={b.travelId} b={b} />)}
        </div>
      )}

      {/* Tranche paid */}
      {tranchePaid.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--usdc)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ✅ Tranche Paid ({tranchePaid.length})
          </h3>
          {tranchePaid.map(b => <BookingRow key={b.travelId} b={b} />)}
        </div>
      )}

      {/* Closed */}
      {closed.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Closed ({closed.length})
          </h3>
          {closed.map(b => <BookingRow key={b.travelId} b={b} />)}
        </div>
      )}

      {bookings.length === 0 && !loading && addr && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>✈️</div>
          <p>No travel bookings found.</p>
          <Link to="/travel">
            <button className="btn-primary" style={{ marginTop: 16, padding: '10px 24px' }}>
              Create travel booking →
            </button>
          </Link>
        </div>
      )}
    </div>
  )
}
