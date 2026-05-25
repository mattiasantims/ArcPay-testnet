// Merchant booking CSV — same structure as guest MyBookingsPage CSV
export function downloadBookingCSV(bookings, walletAddress) {
  if (!bookings || bookings.length === 0) return

  const ARCSCAN  = 'https://testnet.arcscan.app'
  const APP_URL  = 'https://arc-pay-testnet.vercel.app'

  const headers = [
    'timestamp','status','guestWallet','merchantWallet','merchantName',
    'totalAmount','nonRefundable','refundable','nonRefundablePct',
    'bookingRef','cancellationDeadline','checkInDate','createdAt',
    'createTxHash','createArcScan',
    'cancelTxHash','cancelArcScan',
    'releaseTxHash','releaseArcScan',
    'bookingUrl','network','testnetDisclaimer',
  ]

  const rows = bookings.map(b => {
    // b is a buildBookingReceiptObject — fields use snake_case
    const ts     = v => v ? new Date(Number(v) * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : ''
    const usdc   = v => v ? (Number(v) / 1e6).toFixed(2) + ' USDC' : ''
    const status = ['Active','Cancelled','Released to Hotel'][Number(b.status ?? 0)] ?? ''

    // TX hashes: enriched externally by BookingDashboardPage
    const cTx = b.create_tx_hash  || ''
    const xTx = b.cancel_tx_hash  || ''
    const rTx = b.release_tx_hash || ''

    return [
      b.created_at            ?? '',
      status,
      b.guest_wallet          ?? '',
      b.merchant_wallet       ?? '',
      b.merchant_name         ?? '',
      b.total_amount          ?? '',
      b.non_refundable_amount ?? '',
      b.refundable_amount     ?? '',
      b.non_refundable_pct    ?? '',
      b.booking_ref           ?? '',
      b.cancellation_deadline ?? '',
      b.check_in_date         ?? '',
      b.created_at            ?? '',
      cTx,
      cTx ? `${ARCSCAN}/tx/${cTx}` : '',
      xTx,
      xTx ? `${ARCSCAN}/tx/${xTx}` : '',
      rTx,
      rTx ? `${ARCSCAN}/tx/${rTx}` : '',
      b.booking_page          ?? `${APP_URL}/booking/${b.booking_id}`,
      'Arc Testnet (Chain ID: 5042002)',
      'TESTNET ONLY. Testnet tokens have no real economic value.',
    ]
  })

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
