import { BOOKING_STATUS_LABEL, BOOKING_STATUS_COLOR } from '../utils/booking.js'

export default function BookingStatusBadge({ status }) {
  const label = BOOKING_STATUS_LABEL[status] ?? 'Unknown'
  const color = BOOKING_STATUS_COLOR[status] ?? '#7b88a8'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      fontSize: 11, fontFamily: 'var(--mono)', padding: '3px 9px',
      borderRadius: 20, border: `1px solid ${color}44`,
      background: `${color}11`, color,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  )
}
