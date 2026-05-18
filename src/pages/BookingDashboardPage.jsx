import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchMerchantBookingIds, fetchGuestBookingIds, fetchBooking,
  formatUsdc, formatTs, formatDeadlineCountdown,
  buildBookingReceiptObject, executeReleaseAfterDeadline, executeCancelBeforeDeadline,
  BOOKING_STATUS_LABEL,
} from '../utils/booking.js'
import { getCachedBookingTxHash, getBookingRequests } from '../utils/bookingRequest.js'
import { isValidAddress } from '../utils/wallet.js'
import { downloadBookingCSV } from '../utils/bookingCsv.js'
import { isBookingContractConfigured } from '../config.js'
import BookingStatusBadge from '../components/BookingStatusBadge.jsx'

export default function BookingDashboardPage({ account, onConnect, connecting }) {
  const [role,       setRole]       = useState('merchant')
  const [addrInput,  setAddrInput]  = useState('')
  const [addr,       setAddr]       = useState('')
  const [bookings,   setBookings]   = useState([])
  const [receipts,   setReceipts]   = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [releasing,  setReleasing]  = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [now,        setNow]        = useState(Math.floor(Date.now()/1000))
  const configured = isBookingContractConfigured()

  useEffect(() => {
    if (account && !addr) { setAddr(account); setAddrInput(account) }
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
      const ids = role === 'merchant'
        ? await fetchMerchantBookingIds(a)
        : await fetchGuestBookingIds(a)
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
      const built = fetched.map(({ id, booking }, idx) => {
        const txHash   = getCachedBookingTxHash(id)
        const localReq = localReqs.find(r => r.bookingRef === booking.bookingRef)
        return {
          ...buildBookingReceiptObject({
            booking, txHash, bookingId: id,
            merchantName: localReq?.merchantName || null,
            description:  localReq?.description  || null,
          }),
          role,
          merchant_booking_number: totalMerchantBookings - idx,
        }
      })
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

  const isMerchantConnected = account && role === 'merchant' && addr?.toLowerCase() === account?.toLowerCase()

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
          {['merchant', 'guest'].map(r => (
            <button key={r} onClick={() => { setRole(r); setBookings([]); setReceipts([]) }}
              className={role === r ? 'btn-primary' : 'btn-ghost'}
              style={{ fontSize: 13, padding: '7px 16px', textTransform: 'capitalize' }}>
              {r === 'merchant' ? '🏨 Hotel view' : '👤 Guest view'}
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
          {!account && (
            <button onClick={onConnect} disabled={connecting} className="btn-ghost" style={{ padding: '10px 16px', height: 42 }}>
              {connecting ? <><span className="spinner" /></> : 'Connect'}
            </button>
          )}
        </div>
        {/* Wallet connection hint for hotel actions */}
        {role === 'merchant' && addr && account && addr.toLowerCase() !== account.toLowerCase() && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--yellow)', padding: '8px 12px', background: '#1a1200', border: '1px solid #f0c04033', borderRadius: 6 }}>
            ⚠️ Connected wallet does not match the hotel address. Connect with the hotel wallet to cancel or release bookings.
          </div>
        )}
        {role === 'merchant' && !account && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text2)' }}>
            Connect the hotel wallet to cancel bookings or release escrow.
          </div>
        )}
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Stats */}
      {receipts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total bookings', value: receipts.length.toString(), color: 'var(--text)' },
            { label: 'Total value',    value: `${totalValue.toFixed(2)} USDC`, color: 'var(--usdc)' },
            { label: 'In escrow',      value: `${totalEscrow.toFixed(2)} USDC`, color: 'var(--green)' },
            { label: 'Releasable',     value: releasable.length.toString(), color: releasable.length > 0 ? 'var(--yellow)' : 'var(--text2)' },
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <button onClick={() => downloadBookingCSV(receipts, addr)} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            📊 Export CSV
          </button>
          <button onClick={() => load(addr)} disabled={loading} className="btn-ghost" style={{ fontSize: 13, padding: '8px 16px' }}>
            ↻ Refresh
          </button>
        </div>
      )}

      {/* ── UPCOMING DEADLINES ── */}
      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            ⏱ Upcoming Deadlines — cancellation still possible
          </h3>
          {upcoming.map(({ id, booking }) => {
            const isMerchant = account?.toLowerCase() === booking.merchant?.toLowerCase()
            const isGuest    = account?.toLowerCase() === booking.guest?.toLowerCase()
            return (
              <div key={id} className="card" style={{ marginBottom: 10, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <BookingStatusBadge status={booking.status} />
                    </div>
                    <div style={{ fontSize: 13, fontFamily: 'var(--mono)', marginBottom: 4 }}>{booking.bookingRef}</div>
                    <div style={{ fontSize: 12, color: 'var(--green)', fontWeight: 600 }}>
                      ⏱ {formatDeadlineCountdown(booking.cancellationDeadline)} remaining
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: 'var(--usdc)' }}>
                      {formatUsdc(booking.totalAmount)} USDC
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>
                      {formatUsdc(booking.refundableAmount)} USDC in escrow
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      {formatUsdc(booking.nonRefundableAmount)} USDC non-refundable
                    </div>
                  </div>
                </div>

                {/* Hotel instructions */}
                {role === 'merchant' && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, lineHeight: 1.6 }}>
                    <strong style={{ color: 'var(--text)' }}>Hotel actions:</strong> Before the deadline you can cancel this booking on behalf of the guest
                    (e.g. if they requested cancellation via email or WhatsApp). The refundable portion will be returned to the guest automatically.
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/booking/${id}`} style={{ textDecoration: 'none' }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 12px' }}>View details</button>
                  </Link>
                  {/* Hotel: process guest cancellation */}
                  {role === 'merchant' && isMerchant && (
                    <button
                      onClick={() => handleProcessCancellation(id)}
                      disabled={cancelling === id}
                      style={{ fontSize: 11, padding: '6px 14px', background: '#1a1200', border: '1px solid #f0c040', color: '#f0c040', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
                      {cancelling === id ? '⏳ Processing...' : '✉️ Process guest cancellation'}
                    </button>
                  )}
                  {/* Guest: cancel directly */}
                  {role === 'guest' && isGuest && (
                    <button
                      onClick={() => handleProcessCancellation(id)}
                      disabled={cancelling === id}
                      style={{ fontSize: 11, padding: '6px 14px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
                      {cancelling === id ? '⏳ Cancelling...' : '✕ Cancel booking'}
                    </button>
                  )}
                  {/* Wallet not matching — show hint */}
                  {role === 'merchant' && !isMerchant && account && (
                    <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center' }}>
                      Connect hotel wallet to cancel
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── RELEASABLE ESCROWS ── */}
      {releasable.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            🏨 Ready to Release — deadline passed
          </h3>
          <div style={{ background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 10, padding: '12px 16px', marginBottom: 12, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            The cancellation deadline has passed. The refundable escrow can now be released to the hotel.
            {role === 'merchant' && ' As the hotel, click "Release escrow to hotel" to receive the funds.'}
            {role === 'guest' && ' The hotel can now release the escrow. You can also trigger the release — the funds will go to the hotel.'}
          </div>
          {releasable.map(({ id, booking }) => {
            const isMerchant = account?.toLowerCase() === booking.merchant?.toLowerCase()
            return (
              <div key={id} className="card" style={{ marginBottom: 10, padding: '16px 18px', borderColor: '#f0c04044', background: '#1a1200' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--yellow)', background: '#f0c04011', border: '1px solid #f0c04044', borderRadius: 20, padding: '2px 8px' }}>
                        Deadline passed
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontFamily: 'var(--mono)', marginBottom: 2 }}>{booking.bookingRef}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>Cancellation window closed</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: 'var(--yellow)' }}>
                      {formatUsdc(booking.refundableAmount)} USDC
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>escrow to release to hotel</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      + {formatUsdc(booking.nonRefundableAmount)} USDC already received
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleRelease(id)}
                    disabled={releasing === id || !account}
                    className="btn-primary"
                    style={{ fontSize: 12, padding: '8px 18px' }}>
                    {releasing === id
                      ? <><span className="spinner" />Releasing...</>
                      : '🏨 Release escrow to hotel'}
                  </button>
                  <Link to={`/booking/${id}`} style={{ textDecoration: 'none' }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '8px 12px' }}>View details</button>
                  </Link>
                </div>
                {!account && (
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
                    Connect wallet to release escrow.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── CLOSED BOOKINGS ── */}
      {closed.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Closed Bookings
          </h3>
          {closed.map(({ id, booking }) => (
            <div key={id} className="card" style={{ marginBottom: 8, padding: '12px 16px', opacity: 0.7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <BookingStatusBadge status={booking.status} />
                  <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{booking.bookingRef}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)' }}>{formatUsdc(booking.totalAmount)} USDC</span>
                  <Link to={`/booking/${id}`} style={{ textDecoration: 'none' }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View</button>
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {receipts.length === 0 && !loading && addr && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>🏨</div>
          <p>No bookings found for this {role} address.</p>
          <Link to="/booking">
            <button className="btn-primary" style={{ marginTop: 16, padding: '10px 24px' }}>
              Create booking request →
            </button>
          </Link>
        </div>
      )}
    </div>
  )
}
