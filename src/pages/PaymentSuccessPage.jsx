import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { ARCSCAN_BASE } from '../config.js'
import { shortAddress } from '../utils/wallet.js'

export default function PaymentSuccessPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const type       = params.get('type') || 'payment'
  const txHash     = params.get('txHash')
  const proofId    = params.get('proofId')
  const bookingId  = params.get('bookingId')
  const travelId   = params.get('travelId')
  const amount     = params.get('amount')
  const merchant   = params.get('merchant')
  const customer   = params.get('customer')
  const ref        = params.get('ref')
  const mode       = params.get('mode') // 'merchant' | 'customer'

  const isMerchant = mode === 'merchant'

  // Costruisce URL receipt con params
  function getReceiptUrl() {
    if (!receiptPath) return null
    const params = new URLSearchParams()
    if (merchant) params.set('name', merchant)
    if (ref) params.set('ref', ref)
    return `${receiptPath}?${params.toString()}`
  }

  const typeLabels = {
    payment:  { icon: '✅', title: isMerchant ? 'Payment Received' : 'Payment Complete',      badge: 'Online Payment'   },
    booking:  { icon: '🏨', title: isMerchant ? 'Booking Received' : 'Booking Confirmed',     badge: 'Hotel Booking'    },
    travel:   { icon: '✈️', title: isMerchant ? 'Travel Booking Received' : 'Travel Booking Confirmed', badge: 'Travel Agency' },
    tranche:  { icon: '💳', title: 'Tranche Payment Complete',                                 badge: 'Scheduled Tranche'},
  }
  const { icon, title, badge } = typeLabels[type] || typeLabels.payment

  // Receipt link
  let receiptPath = null
  if (proofId)   receiptPath = `/receipt/${proofId}`
  if (bookingId) receiptPath = `/booking/${bookingId}`
  if (travelId)  receiptPath = `/travel/${travelId}`

  // Dashboard link
  const dashboardPath = type === 'booking' ? '/booking-dashboard'
    : type === 'travel' || type === 'tranche' ? '/travel-dashboard'
    : '/dashboard'

  const noId = !proofId && !bookingId && !travelId

  return (
    <div className="fade-up" style={{ maxWidth: 560, margin: '0 auto', padding: '20px 0' }}>

      {/* Main card */}
      <div className="card" style={{
        textAlign: 'center', padding: '36px 24px', marginBottom: 16,
        borderColor: 'var(--green-bdr)', background: 'var(--green-bg)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>{icon}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
          <span className="badge badge-green">{badge}</span>
          <span className="badge badge-gray">Arc Testnet</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, color: 'var(--green)', marginBottom: 8 }}>
          {title}
        </h1>

        {noId && (
          <div style={{ background: '#1a1000', border: '1px solid var(--yellow)', borderRadius: 8, padding: '10px 14px', margin: '12px 0', fontSize: 12, color: 'var(--yellow)', textAlign: 'left', lineHeight: 1.6 }}>
            ⚠ Payment was successful, but the receipt ID could not be detected automatically.
            You can still verify the transaction on ArcScan or refresh your dashboard.
          </div>
        )}
      </div>

      {/* Details */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Transaction details
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {amount && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>Amount</span>
              <span style={{ color: 'var(--usdc)', fontWeight: 700, fontSize: 15 }}>{amount} USDC</span>
            </div>
          )}
          {ref && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>Reference</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{ref}</span>
            </div>
          )}
          {merchant && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>{isMerchant ? 'Customer' : 'Merchant'}</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>
                {shortAddress(isMerchant ? customer : merchant)}
              </span>
            </div>
          )}
          {(proofId || bookingId || travelId) && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>ID</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>
                #{(proofId || bookingId || travelId)?.toString()}
              </span>
            </div>
          )}
          {txHash && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--text3)', fontSize: 13 }}>TX Hash</span>
              <a
                href={`${ARCSCAN_BASE}/tx/${txHash}`}
                target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--usdc)' }}
              >
                {txHash.slice(0,10)}...{txHash.slice(-6)} ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {receiptPath && (
          <button onClick={() => navigate(getReceiptUrl() || receiptPath)} className="btn-primary btn-full" style={{ padding: '13px' }}>
            📄 View {type === 'booking' ? 'Booking Receipt' : type === 'travel' || type === 'tranche' ? 'Travel Booking' : 'Payment Receipt'}
          </button>
        )}
        {receiptPath && (
          <button
            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${receiptPath}`); }}
            className="btn-ghost btn-full" style={{ padding: '11px', fontSize: 13 }}
          >
            🔗 Copy Receipt Link
          </button>
        )}
        {txHash && (
          <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost btn-full" style={{ padding: '11px' }}>🔍 View on ArcScan</button>
          </a>
        )}
        {isMerchant && (
          <button onClick={() => navigate(-2)} className="btn-ghost btn-full" style={{ padding: '11px' }}>
            + Create Another Payment
          </button>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to={dashboardPath} style={{ flex: 1, textDecoration: 'none' }}>
            <button className="btn-ghost btn-full" style={{ padding: '11px', fontSize: 13 }}>📊 Dashboard</button>
          </Link>
          <Link to="/" style={{ flex: 1, textDecoration: 'none' }}>
            <button className="btn-ghost btn-full" style={{ padding: '11px', fontSize: 13 }}>🏠 Home</button>
          </Link>
        </div>
      </div>

      {/* Testnet disclaimer */}
      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text3)', marginTop: 20, lineHeight: 1.6 }}>
        TESTNET ONLY — Testnet tokens have no real economic value. This is not a financial instrument or tax document.
      </p>
    </div>
  )
}
