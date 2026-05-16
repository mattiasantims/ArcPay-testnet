import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { fetchGuestBookingIds, fetchBooking, formatUsdc, formatTs } from '../utils/booking.js'
import { shortAddress } from '../utils/wallet.js'
import { isBookingContractConfigured } from '../config.js'

const STATUS_LABELS = {
  0: { label: 'Active',                 color: 'var(--green)',  badge: 'badge-green' },
  1: { label: 'Cancelled before cutoff', color: '#f08080',       badge: 'badge-red'   },
  2: { label: 'Released to merchant',    color: 'var(--text2)',  badge: 'badge-gray'  },
}

export default function MyBookingsPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isBookingContractConfigured()
  const [bookings, setBookings] = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(() => {
    if (!isConnected || !address || !configured) return
    setLoading(true)
    fetchGuestBookingIds(address).then(async ids => {
      const all = await Promise.all(ids.map(id => fetchBooking(id).catch(() => null)))
      setBookings(all.filter(Boolean).sort((a, b) => Number(b.createdAt) - Number(a.createdAt)))
    }).finally(() => setLoading(false))
  }, [address, isConnected])

  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🏨</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to see your bookings</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Customer</span>
          <span className="badge badge-gray">Hotel Bookings</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>My Bookings</h1>
        <p style={{ color: 'var(--text2)', fontSize: 13 }}>Hotel bookings for {shortAddress(address)}</p>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /> Loading bookings...</div>
      ) : bookings.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>No bookings found for this wallet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {bookings.map(b => {
            const st = STATUS_LABELS[Number(b.status)] || STATUS_LABELS[0]
            const now = Math.floor(Date.now() / 1000)
            const canCancel = Number(b.status) === 0 && now < Number(b.cancellationDeadline)
            return (
              <div key={b.bookingId.toString()} className="card" style={{ padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className={`badge ${st.badge}`}>{st.label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>#{b.bookingId.toString()}</span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{shortAddress(b.merchant)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Created {formatTs(Number(b.createdAt))}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--usdc)' }}>
                      {formatUsdc(b.totalAmount)} USDC
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                      Escrow: {formatUsdc(b.refundableAmount)} USDC
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Link to={`/booking/${b.bookingId}`} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>
                    View details →
                  </Link>
                  {canCancel && (
                    <Link to={`/booking/${b.bookingId}`} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px', color: '#f08080', borderColor: '#f08080' }}>
                      Cancel booking
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
