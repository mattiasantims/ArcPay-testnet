export default function BookingActions({
  booking, account, now,
  onGuestCancel, onMerchantCancel, onRelease,
  loading, allowRefund = true,
}) {
  if (!booking || booking.status !== 0) return null

  const isGuest    = account?.toLowerCase() === booking.guest?.toLowerCase()
  const isMerchant = account?.toLowerCase() === booking.merchant?.toLowerCase()
  const beforeDL   = now < Number(booking.cancellationDeadline)
  const afterDL    = now >= Number(booking.cancellationDeadline)

  if (beforeDL && isGuest) return (
    <div>
      <button onClick={onGuestCancel} disabled={loading} className="btn-ghost btn-full" style={{ borderColor: '#f04f4f', color: '#f08080' }}>
        {loading ? <><span className="spinner" />Processing...</> : '✕ Cancel booking and receive refundable amount'}
      </button>
    </div>
  )

  if (beforeDL && isMerchant) return (
    <div>
      <button onClick={onMerchantCancel} disabled={loading} className="btn-ghost btn-full" style={{ borderColor: '#f0c040', color: '#f0c040' }}>
        {loading ? <><span className="spinner" />Processing...</> : '↩ Process guest cancellation request'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, lineHeight: 1.5 }}>
        Use this only if the guest requested cancellation off-chain before the deadline. The refundable escrow will be returned to the guest.
      </div>
    </div>
  )

  if (afterDL && isMerchant) return (
    <div>
      <button onClick={onRelease} disabled={loading} className="btn-primary btn-full">
        {loading ? <><span className="spinner" />Processing...</> : '🏨 Release escrow to hotel'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
        Cancellation deadline has passed. The escrow can now be released to the hotel.
      </div>
    </div>
  )

  if (afterDL && isGuest) return (
    <div style={{ fontSize: 13, color: 'var(--text2)', padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
      Cancellation deadline has passed. The hotel will process the escrow release.
    </div>
  )

  return (
    <div style={{ fontSize: 13, color: 'var(--text2)', padding: 12, background: 'var(--surface2)', borderRadius: 8 }}>
      Connect the guest or hotel wallet to see available actions.
    </div>
  )
}
