import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { fetchGuestBookingIds, fetchBooking, fetchBookingTxHashes, formatUsdc, formatTs } from '../utils/booking.js'
import { shortAddress } from '../utils/wallet.js'
import { isBookingContractConfigured, isMerchantRegistryConfigured } from '../config.js'
import { getMerchantByWallet } from '../utils/merchant.js'

const STATUS_LABELS = {
  0: { label: 'Active',             badge: 'badge-green' },
  1: { label: 'Cancelled',          badge: 'badge-red'   },
  2: { label: 'Released',           badge: 'badge-gray'  },
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
      const valid = all.filter(Boolean).sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
      // Recupera nome merchant dal registry
      const withNames = await Promise.all(valid.map(async b => {
        let merchantName = shortAddress(b.merchant)
        if (isMerchantRegistryConfigured()) {
          try {
            const m = await getMerchantByWallet(b.merchant)
            if (m && m.tradingName) merchantName = m.tradingName
          } catch {}
        }
        let createTxHash = null, cancelTxHash = null, releaseTxHash = null
        try {
          const hashes = await fetchBookingTxHashes(b)
          createTxHash  = hashes.createHash
          cancelTxHash  = hashes.cancelHash
          releaseTxHash = hashes.releaseHash
        } catch {}
        return { ...b, merchantName, createTxHash, cancelTxHash, releaseTxHash }
      }))
      setBookings(withNames)
    }).finally(() => setLoading(false))
  }, [address, isConnected])

  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🏨</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to see your bookings</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  function exportCSV() {
    if (!bookings.length) return
    const headers = ['timestamp','status','guestWallet','merchantWallet','merchantName','totalAmount','nonRefundable','refundable','nonRefundablePct','bookingRef','cancellationDeadline','checkInDate','createdAt','createTxHash','createArcScan','cancelTxHash','cancelArcScan','releaseTxHash','releaseArcScan','bookingUrl','network','testnetDisclaimer']
    const rows = bookings.map(b => [
      b.createdAt ? new Date(Number(b.createdAt)*1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : '',
      ['Active','Cancelled','Released to Hotel'][Number(b.status)] ?? '',
      address ?? '',
      b.merchant ?? '',
      b.merchantName || shortAddress(b.merchant),
      b.totalAmount ? (Number(b.totalAmount)/1e6).toFixed(2) + ' USDC' : '',
      b.nonRefundableAmount ? (Number(b.nonRefundableAmount)/1e6).toFixed(2) + ' USDC' : '',
      b.refundableAmount ? (Number(b.refundableAmount)/1e6).toFixed(2) + ' USDC' : '',
      b.nonRefundableBps ? (Number(b.nonRefundableBps)/100).toFixed(0) + '%' : '',
      b.bookingRef ?? '',
      b.cancellationDeadline ? new Date(Number(b.cancellationDeadline)*1000).toISOString() : '',
      b.checkInDate ? new Date(Number(b.checkInDate)*1000).toISOString() : '',
      b.createdAt ? new Date(Number(b.createdAt)*1000).toISOString() : '',
      b.createTxHash  || '',
      b.createTxHash  ? `https://testnet.arcscan.app/tx/${b.createTxHash}`  : '',
      b.cancelTxHash  || '',
      b.cancelTxHash  ? `https://testnet.arcscan.app/tx/${b.cancelTxHash}`  : '',
      b.releaseTxHash || '',
      b.releaseTxHash ? `https://testnet.arcscan.app/tx/${b.releaseTxHash}` : '',
      `https://arc-pay-testnet.vercel.app/booking/${b.bookingId}`,
      'Arc Testnet (Chain ID: 5042002)',
      'TESTNET ONLY. Testnet tokens have no real economic value.',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `arcpay_mybookings_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Customer</span>
          <span className="badge badge-gray">Hotel Bookings</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>My Bookings</h1>
          {bookings.length > 0 && <button onClick={exportCSV} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>⬇ Export CSV</button>}
        </div>
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
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{b.merchantName || shortAddress(b.merchant)}</div>
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
