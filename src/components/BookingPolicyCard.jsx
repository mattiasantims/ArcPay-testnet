import { formatUsdcFull } from '../utils/booking.js'
import { shortAddress } from '../utils/wallet.js'

export default function BookingPolicyCard({ req, totalAmount, nonRefundableBps }) {
  const bps    = parseInt(nonRefundableBps || 3000)
  const total  = parseFloat(totalAmount || 0)
  const nonRef = ((total * bps) / 10000).toFixed(2)
  const ref    = (total - parseFloat(nonRef)).toFixed(2)
  const pct    = Math.round(bps / 100)

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Refund Policy
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#1a0808', border: '1px solid #5a1c1c', borderRadius: 8, padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#f08080', marginBottom: 6 }}>Released immediately to hotel</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: '#f04f4f', letterSpacing: '-0.5px' }}>
            {nonRef} USDC
          </div>
          <div style={{ fontSize: 11, color: '#f08080', marginTop: 4 }}>Non-refundable ({pct}%)</div>
        </div>
        <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-bdr)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 6 }}>Locked in escrow</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: 'var(--green)', letterSpacing: '-0.5px' }}>
            {ref} USDC
          </div>
          <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>Refundable ({100 - pct}%)</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
        Once you pay, <strong style={{ color: 'var(--text)' }}>{nonRef} USDC</strong> is released immediately to the hotel.
        The remaining <strong style={{ color: 'var(--text)' }}>{ref} USDC</strong> is locked in escrow and is refundable
        if you cancel before the cancellation deadline.
      </div>
    </div>
  )
}
