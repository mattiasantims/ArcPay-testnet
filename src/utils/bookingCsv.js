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
    // b has both receipt object fields (snake_case) AND _raw (BigInt struct) if available
    const raw  = b._raw  || {}
    const cTx  = b.create_tx_hash  || ''
    const xTx  = b.cancel_tx_hash  || ''
    const rTx  = b.release_tx_hash || ''

    // Status: prefer raw BigInt struct, fallback to receipt numeric field
    const statusNum = raw.status !== undefined ? Number(raw.status) : Number(b.status ?? 99)
    const status    = ['Active','Cancelled','Released to Hotel'][statusNum] ?? ''

    // Amounts: prefer raw struct (precise), fallback to receipt strings
    const usdc = v => v !== undefined ? (Number(v)/1e6).toFixed(2) + ' USDC' : ''
    const pct  = v => v !== undefined ? (Number(v)/100).toFixed(0) + '%' : ''
    const iso  = v => v !== undefined && v !== 0n ? new Date(Number(v)*1000).toISOString() : ''

    const totalAmount = raw.totalAmount         ? usdc(raw.totalAmount)         : b.total_amount          ?? ''
    const nonRef      = raw.nonRefundableAmount ? usdc(raw.nonRefundableAmount) : b.non_refundable_amount ?? ''
    const refund      = raw.refundableAmount    ? usdc(raw.refundableAmount)    : b.refundable_amount     ?? ''
    const pctVal      = raw.nonRefundableBps    ? pct(raw.nonRefundableBps)     : b.non_refundable_pct    ?? ''
    const cancelDl    = raw.cancellationDeadline ? iso(raw.cancellationDeadline) : b.cancellation_deadline ?? ''
    const checkIn     = raw.checkInDate          ? iso(raw.checkInDate)          : b.check_in_date         ?? ''
    const createdAt   = raw.createdAt            ? iso(raw.createdAt)            : b.created_at            ?? ''
    const guest       = raw.guest    || b.guest_wallet    || ''
    const merchant    = raw.merchant || b.merchant_wallet || ''
    const bookingRef  = raw.bookingRef || b.booking_ref   || ''
    const bookingUrl  = b.booking_page || `${APP_URL}/booking/${b._id || b.booking_id || ''}`

    return [
      b.created_at ?? '',
      status,
      guest,
      merchant,
      b._name || b.merchant_name || '',
      totalAmount,
      nonRef,
      refund,
      pctVal,
      bookingRef,
      cancelDl,
      checkIn,
      createdAt,
      cTx,
      cTx ? `${ARCSCAN}/tx/${cTx}` : '',
      xTx,
      xTx ? `${ARCSCAN}/tx/${xTx}` : '',
      rTx,
      rTx ? `${ARCSCAN}/tx/${rTx}` : '',
      bookingUrl,
      'Arc Testnet (Chain ID: 5042002)',
      'TESTNET ONLY. Testnet tokens have no real economic value.',
    ]
  })

  const csv  = [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `arcpay_bookings_${walletAddress?.slice(0,8)}_${new Date().toISOString().slice(0,10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
