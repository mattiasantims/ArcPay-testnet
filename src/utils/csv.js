export function downloadCSV(receipts, merchantWallet) {
  if (!receipts || receipts.length === 0) return

  const headers = [
    'timestamp','merchantName','merchantWallet','customerWallet',
    'amount','token','network','chainId','paymentRef','purposeCode',
    'description','metadataHash','txHash','arcscanUrl','receiptUrl',
    'status','testnetDisclaimer',
  ]

  const rows = receipts.map(r => [
    r.timestamp_utc    ?? '',
    r.merchant_name    ?? '',
    r.merchant_wallet  ?? '',
    r.customer_wallet  ?? '',
    r.amount           ?? '',
    r.token_symbol     ?? 'USDC',
    r.network          ?? '',
    '5042002',
    r.payment_ref      ?? '',
    r.purpose_code     ?? '',
    r.description      ?? '',
    r.metadata_hash    ?? '',
    r.transaction_hash ?? '',
    r.arcscan_link     ?? '',
    r.receipt_page     ?? '',
    r.status           ?? '',
    r.disclaimer       ?? '',
  ])

  const csv  = [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `arcpay_${merchantWallet?.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
