import { TRAVEL_STATUS_LABEL } from './travel.js'
import { ARCSCAN_BASE, ARCTRAVEL_ESCROW_ADDRESS, APP_URL } from '../config.js'

function formatTs(unix) {
  if (!unix || unix === 0) return ''
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function fromUsdc(raw) {
  if (!raw) return '0.00'
  return (Number(BigInt(raw)) / 1e6).toFixed(6)
}

export function downloadTravelCSV(bookings, walletAddress) {
  if (!bookings || bookings.length === 0) return

  const headers = [
    'timestamp',
    'status',
    'customerWallet',
    'merchantWallet',
    'travelRef',
    'description',
    'totalPackageAmount',
    'initialPaymentAmount',
    'nonRefundableAmount',
    'refundableEscrowAmount',
    'nonRefundablePct',
    'trancheAmount',
    'tranchePaid',
    'travelStartDate',
    'paymentDueDate',
    'paymentDeadline',
    'cancellationDeadline',
    'createdAt',
    'closedAt',
    'metadataHash',
    'txHash',
    'arcscanUrl',
    'travelUrl',
    'network',
    'contractAddress',
    'testnetDisclaimer',
  ]

  const rows = bookings.map(b => {
    const txHash = b.txHash || ''
    return [
      formatTs(b.createdAt),
      TRAVEL_STATUS_LABEL[b.status] ?? b.status ?? '',
      b.customer    ?? '',
      b.merchant    ?? '',
      b.travelRef   ?? '',
      b.description ?? '',
      fromUsdc(b.totalPackageAmount),
      fromUsdc(b.initialPaymentAmount),
      fromUsdc(b.nonRefundableAmount),
      fromUsdc(b.refundableEscrowAmount),
      b.nonRefundableBps ? (b.nonRefundableBps / 100).toFixed(2) + '%' : '',
      fromUsdc(b.trancheAmount),
      b.tranchePaid ? 'Yes' : 'No',
      formatTs(b.travelStartDate),
      formatTs(b.paymentDueDate),
      formatTs(b.paymentDeadline),
      formatTs(b.cancellationDeadline),
      formatTs(b.createdAt),
      formatTs(b.closedAt),
      b.metadataHash ?? '',
      txHash,
      txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : `${ARCSCAN_BASE}/address/${b.merchant}`,
      `${APP_URL}/travel/${b.travelId}`,
      'Arc Testnet (Chain ID 5042002)',
      ARCTRAVEL_ESCROW_ADDRESS ?? '',
      'TESTNET ONLY. Testnet tokens have no real economic value. Not a regulated payment service.',
    ]
  })

  const csv = [headers, ...rows]
    .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `arcpay_travel_${walletAddress?.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
