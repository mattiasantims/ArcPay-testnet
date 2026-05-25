export function downloadBookingCSV(bookings, walletAddress) {
  if (!bookings || bookings.length === 0) return
  const headers = [
    'timestamp','status','guestWallet','merchantWallet','merchantName',
    'totalAmount','nonRefundableAmount','refundableAmount','nonRefundablePct',
    'bookingRef','description','cancellationDeadline','checkInDate',
    'metadataHash','createdAt','closedAt',
    'createTxHash','createArcScan','cancelTxHash','cancelArcScan','releaseTxHash','releaseArcScan',
    'bookingUrl','network','contractAddress','testnetDisclaimer',
  ]
  const rows = bookings.map(b => [
    b.created_at ?? '',
    b.status               ?? '',
    b.guest_wallet         ?? '',
    b.merchant_wallet      ?? '',
    b.merchant_name        ?? '',
    b.total_amount         ?? '',
    b.non_refundable_amount ?? '',
    b.refundable_amount    ?? '',
    b.non_refundable_pct   ?? '',
    b.booking_ref          ?? '',
    b.description          ?? '',
    b.cancellation_deadline ?? '',
    b.check_in_date        ?? '',
    b.metadata_hash        ?? '',
    b.created_at           ?? '',
    b.closed_at            ?? '',
    b.create_tx_hash   ?? '',
    b.create_tx_hash   ? `https://testnet.arcscan.app/tx/${b.create_tx_hash}`  : '',
    b.cancel_tx_hash   ?? '',
    b.cancel_tx_hash   ? `https://testnet.arcscan.app/tx/${b.cancel_tx_hash}`  : '',
    b.release_tx_hash  ?? '',
    b.release_tx_hash  ? `https://testnet.arcscan.app/tx/${b.release_tx_hash}` : '',
    b.arcscan_link         ?? '',
    b.booking_page         ?? '',
    b.network              ?? '',
    b.contract_address     ?? '',
    b.disclaimer           ?? '',
  ])
  const csv  = [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `arcpay_bookings_${walletAddress?.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
