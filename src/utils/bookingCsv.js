export function downloadBookingCSV(bookings, walletAddress) {
  if (!bookings || bookings.length === 0) return

  const ARCSCAN = 'https://testnet.arcscan.app'
  const APP_URL = 'https://arc-pay-testnet.vercel.app'

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
    // b._raw = raw booking struct (BigInt fields), b._id = booking id
    // Fallback to receipt object fields if raw not available
    const raw  = b._raw  || b
    const id   = b._id   || b.booking_id || ''
    const name = b._name || b.merchant_name || ''

    const ts  = v => v ? new Date(Number(v)*1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : ''
    const iso = v => v ? new Date(Number(v)*1000).toISOString() : ''

    const status    = ['Active','Cancelled','Released to Hotel'][Number(raw.status ?? 0)] ?? ''
    const total     = raw.totalAmount          ? (Number(raw.totalAmount)/1e6).toFixed(2)          + ' USDC' : ''
    const nonRef    = raw.nonRefundableAmount  ? (Number(raw.nonRefundableAmount)/1e6).toFixed(2)  + ' USDC' : ''
    const refund    = raw.refundableAmount     ? (Number(raw.refundableAmount)/1e6).toFixed(2)     + ' USDC' : ''
    const pct       = raw.nonRefundableBps     ? (Number(raw.nonRefundableBps)/100).toFixed(0)     + '%'     : ''

    const cTx = b.create_tx_hash  || ''
    const xTx = b.cancel_tx_hash  || ''
    const rTx = b.release_tx_hash || ''

    return [
      ts(raw.createdAt),
      status,
      raw.guest    ?? '',
      raw.merchant ?? '',
      name,
      total,
      nonRef,
      refund,
      pct,
      raw.bookingRef           ?? '',
      iso(raw.cancellationDeadline),
      iso(raw.checkInDate),
      iso(raw.createdAt),
      cTx,
      cTx ? `${ARCSCAN}/tx/${cTx}` : '',
      xTx,
      xTx ? `${ARCSCAN}/tx/${xTx}` : '',
      rTx,
      rTx ? `${ARCSCAN}/tx/${rTx}` : '',
      `${APP_URL}/booking/${id}`,
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
