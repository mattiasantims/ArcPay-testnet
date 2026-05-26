// payoutCsv.js — Merchant + recipient payout CSV export
import { fromUsdc, formatTs, PAYOUT_PURPOSE_CODES } from './payout.js'
import { ARCSCAN_BASE, ARC_MERCHANT_PAYOUTS_ADDRESS, APP_URL } from '../config.js'

const PURPOSE_LABEL = Object.fromEntries(PAYOUT_PURPOSE_CODES.map(p => [p.value, p.label]))

export function downloadPayoutCSV(payouts, walletAddress, role = 'merchant') {
  if (!payouts || payouts.length === 0) return

  const headers = [
    'timestamp',
    'type',
    'merchantWallet',
    'merchantName',
    'merchantLegalName',
    'merchantCountry',
    'recipientWallet',
    'counterpartyAlias',
    'category',
    'paymentRef',
    'batchRefHash',
    'purposeCode',
    'purposeLabel',
    'description',
    'amount',
    'metadataHash',
    'txHash',
    'arcscanUrl',
    'payoutUrl',
    'network',
    'contractAddress',
    'testnetDisclaimer',
  ]

  const rows = payouts.map(p => {
    const tx = p.txHash || ''
    const isBatch = p.batchRefHash && p.batchRefHash !== '0x' + '0'.repeat(64)
    return [
      formatTs(p.createdAt),
      isBatch ? 'Batch Payout Item' : 'Single Payout',
      p.merchant || '',
      p.merchantName      || '',
      p.merchantLegalName || '',
      p.merchantCountry   || '',
      p.recipient || '',
      p.counterpartyAlias || '',
      p.counterpartyCategory || '',
      p.paymentRef || '',
      isBatch ? p.batchRefHash : '',
      p.purposeCode || '',
      PURPOSE_LABEL[p.purposeCode] || p.purposeCode || '',
      p.description || '',
      `${fromUsdc(p.amount).toFixed(2)} USDC`,
      p.metadataHash || '',
      tx,
      tx ? `${ARCSCAN_BASE}/tx/${tx}` : '',
      `${APP_URL}/payout/${p.id}`,
      'Arc Testnet (Chain ID 5042002)',
      ARC_MERCHANT_PAYOUTS_ADDRESS || '',
      'Testnet demo only. Payout labels, descriptions and references may be publicly visible on-chain. Do not include personal, payroll, tax or confidential information.',
    ]
  })

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `arcpay_payouts_${role}_${walletAddress?.slice(0, 8)}_${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
