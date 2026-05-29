import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMerchantBookingIds, fetchGuestBookingIds, fetchBooking, fetchBookingTxHashes,
  formatUsdc, formatTs, formatDeadlineCountdown,
  buildBookingReceiptObject,
  executeReleaseAfterDeadline, executeCancelBeforeDeadline,
} from '../utils/booking.js'
import { getCachedBookingTxHash, getBookingRequests } from '../utils/bookingRequest.js'
import { isValidAddress } from '../utils/wallet.js'
import { downloadBookingCSV } from '../utils/bookingCsv.js'
import { getMerchantIdByWallet, getMerchantWallets } from '../utils/merchant.js'
import { getMerchantByWallet } from '../utils/merchant.js'
import { isMerchantRegistryConfigured, isBookingContractConfigured, ARCSCAN_BASE } from '../config.js'
import BookingStatusBadge from '../components/BookingStatusBadge.jsx'

export default function BookingDashboardPage({ account, onConnect, connecting }) {
  const [role,       setRole]       = useState('merchant')
  const [addrInput,  setAddrInput]  = useState('')
  const [addr,       setAddr]       = useState('')
  const [bookings,   setBookings]   = useState([])
  const [receipts,   setReceipts]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [linkedWallets, setLinkedWallets] = useState([])
  const [error,      setError]      = useState('')
  const [releasing,  setReleasing]  = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [now,        setNow]        = useState(Math.floor(Date.now()/1000))
  const configured = isBookingContractConfigured()

  useEffect(() => {
    if (!account) return
    if (isMerchantRegistryConfigured()) {
      getMerchantIdByWallet(account).then(async id => {
        if (id && id.toString() !== '0') {
          const wallets = await getMerchantWallets(id)
          if (wallets && wallets.length > 0) {
            setLinkedWallets(wallets.map(w => w.toLowerCase()))
          }
        }
        if (!addr) { setAddr(account); setAddrInput(account) }
      }).catch(() => {
        if (!addr) { setAddr(account); setAddrInput(account) }
      })
    } else {
      if (!addr) { setAddr(account); setAddrInput(account) }
    }
  }, [account])

  useEffect(() => { if (addr) load(addr) }, [addr, role])

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now()/1000)), 1000)
    return () => clearInterval(t)
  }, [])

  async function load(a) {
    if (!isValidAddress(a)) { setError('Invalid wallet address'); return }
    setLoading(true); setError('')
    try {
      let ids = []
      if (role === 'merchant') {
        const walletsToLoad = linkedWallets.length > 0 ? linkedWallets : [a]
        for (const w of walletsToLoad) {
          const wIds = await fetchMerchantBookingIds(w)
          ids.push(...wIds)
        }
        ids = [...new Set(ids.map(id => id.toString()))].map(id => BigInt(id))
      } else {
        ids = await fetchGuestBookingIds(a)
      }
      const reversed = [...ids].reverse()
      const fetched  = []
      for (const id of reversed) {
        try {
          const b = await fetchBooking(id.toString())
          if (b) fetched.push({ id: id.toString(), booking: b })
        } catch {}
      }
      setBookings(fetched)

      const localReqs = getBookingRequests()
      const totalMerchantBookings = fetched.length

      // Build merchant profile lookup (unique merchants only)
      const merchantProfileCache = {}
      if (isMerchantRegistryConfigured()) {
        const uniqueMerchants = [...new Set(fetched.map(({ booking }) => (booking?.merchant || '')).filter(Boolean))]
        await Promise.all(uniqueMerchants.map(async mw => {
          try {
            const m = await getMerchantByWallet(mw)
            if (m && m.active) merchantProfileCache[mw.toLowerCase()] = m
          } catch {}
        }))
      }

      // Sequential TX hash fetching to avoid RPC rate limits on multi-booking merchants
      const built = []
      for (let idx = 0; idx < fetched.length; idx++) {
        const { id, booking } = fetched[idx]
        const txHash   = getCachedBookingTxHash(id)
        const localReq = localReqs.find(r => r.bookingRef === booking.bookingRef)
        let createTxHash = null, cancelTxHash = null, releaseTxHash = null
        try {
          const hashes = await fetchBookingTxHashes({ ...booking, bookingId: id, id })
          createTxHash  = hashes.createHash
          cancelTxHash  = hashes.cancelHash
          releaseTxHash = hashes.releaseHash
        } catch {}
        built.push({
          ...buildBookingReceiptObject({
            booking, txHash: txHash || createTxHash, bookingId: id,
            merchantName: localReq?.merchantName || null,
            description:  localReq?.description  || null,
            merchantProfile: merchantProfileCache[(booking?.merchant || '').toLowerCase()],
          }),
          create_tx_hash:  createTxHash,
          cancel_tx_hash:  cancelTxHash,
          release_tx_hash: releaseTxHash,
          _raw:  booking,
          _id:   id,
          _name: localReq?.merchantName || null,
          role,
          merchant_booking_number: totalMerchantBookings - idx,
        })
      }
      setReceipts(built)
    } catch (e) { setError('Failed to load bookings. Are you on Arc Testnet?') }
    finally { setLoading(false) }
  }

  async function handleProcessCancellation(bookingId) {
    if (!account) { setError('Connect merchant wallet to process cancellation'); return }
    setCancelling(bookingId)
    try {
      await executeCancelBeforeDeadline(account, bookingId)
      await load(addr)
    } catch (e) { setError(e.message || 'Cancellation failed') }
    finally { setCancelling(null) }
  }

  async function handleRelease(bookingId) {
    if (!account) { setError('Connect wallet to release escrow'); return }
    setReleasing(bookingId)
    try {
      await executeReleaseAfterDeadline(account, bookingId)
      await load(addr)
    } catch (e) { setError(e.message || 'Release failed') }
    finally { setReleasing(null) }
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)', fontSize: 14 }}>
        Booking escrow contract not configured. Deploy <code>ArcBookingEscrow.sol</code> and update <code>src/config.js</code>.
      </p>
    </div>
  )

  // Classify bookings
  const active     = bookings.filter(b => b.booking.status === 0)
  const upcoming   = active.filter(b => now < Number(b.booking.cancellationDeadline))
  const releasable = active.filter(b => now >= Number(b.booking.cancellationDeadline))
  const closed     = bookings.filter(b => b.booking.status !== 0)

  const totalValue  = receipts.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0)
  const totalEscrow = receipts.filter(r => r.status === 'Active').reduce((s, r) => s + parseFloat(r.refundable_amount || 0), 0)

  function BookingRow({ id, booking, highlight }) {
    const txHash = receipts.find(r => String(r.booking_id) === String(id))?.transaction_hash
    return (
      <div className="card" style={{ marginBottom: 8, padding: '12px 16px', ...(highlight ? { borderColor: highlight } : {}) }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <BookingStatusBadge status={booking.status} />
            <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{booking.bookingRef}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{formatUsdc(booking.totalAmount)} USDC</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Escrow: {formatUsdc(booking.refundableAmount)}</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Link to={`/booking/${id}?mode=${role}`} style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button>
              </Link>
              {txHash && (
                <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
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
          Booking Dashboard
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>Monitor booking deposits, escrow status, and upcoming deadlines.</p>
      </div>

      {/* Role selector + address input */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {[['merchant','🏨 Hotel View'], ['guest','👤 Guest View']].map(([r, label]) => (
            <button key={r} onClick={() => { setRole(r); setBookings([]); setReceipts([]) }}
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
            {loading ? <><span className="spinner" />Loading...</> : '🔍 Load'}
          </button>
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Stats */}
      {receipts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total bookings', value: receipts.length.toString(),        color: 'var(--text)' },
            { label: 'Total value',    value: `${totalValue.toFixed(2)} USDC`,   color: 'var(--usdc)' },
            { label: 'In escrow',      value: `${totalEscrow.toFixed(2)} USDC`,  color: 'var(--green)' },
            { label: 'Releasable',     value: releasable.length.toString(),       color: releasable.length > 0 ? 'var(--yellow)' : 'var(--text2)' },
          ].map(s => (
            <div key={s.label} className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: 'var(--display)', letterSpacing: '-0.5px' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Export + Refresh */}
      {receipts.length > 0 && (
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => {
              console.log('[CSV] receipts[0]:', JSON.stringify({
                create_tx_hash: receipts[0]?.create_tx_hash,
                cancel_tx_hash: receipts[0]?.cancel_tx_hash,
                release_tx_hash: receipts[0]?.release_tx_hash,
                booking_id: receipts[0]?.booking_id,
              }))
              downloadBookingCSV(receipts, addr)
            }} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            📊 Export CSV
          </button>
          <button onClick={() => load(addr)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            ↺ Refresh
          </button>
        </div>
      )}

      {/* Releasable */}
      {releasable.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            🏨 Ready to Release ({releasable.length})
          </h3>
          {releasable.map(({ id, booking }) => (
            <BookingRow key={id} id={id} booking={booking} highlight="var(--yellow)" />
          ))}
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ⏱ Upcoming ({upcoming.length})
          </h3>
          {upcoming.map(({ id, booking }) => (
            <BookingRow key={id} id={id} booking={booking} />
          ))}
        </div>
      )}

      {/* Closed */}
      {closed.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Closed ({closed.length})
          </h3>
          {closed.map(({ id, booking }) => (
            <BookingRow key={id} id={id} booking={booking} />
          ))}
        </div>
      )}

      {receipts.length === 0 && !loading && addr && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>📭</div>
          <p>No bookings found for this address.</p>
        </div>
      )}
    </div>
  )
}
