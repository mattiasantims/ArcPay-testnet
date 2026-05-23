import { COMMITMENT_STATUS_LABEL, COMMITMENT_TYPE_LABEL } from './commitment.js'
import { REFUND_STATUS_LABEL } from './refund.js'
import { ARCSCAN_BASE, ARC_COMMITMENT_ADDRESS, ARC_REFUND_ADDRESS, APP_URL } from '../config.js'

// ── Immediate payments (receipts) ──────────────────────────────────────────────
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

function formatTs(unix) {
  if (!unix || unix === 0) return ''
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

// ── Unified export: receipts + commitments + refunds ──────────────────────────
// Called from DashboardPage (merchant) and MyPaymentsPage (customer)
export function downloadUnifiedCSV({ receipts = [], commitments = [], refunds = [], walletAddress, role = 'merchant' }) {
  const lines = []
  const date  = new Date().toISOString().slice(0, 10)

  // Section 1 — Immediate payments
  if (receipts.length > 0) {
    lines.push('"=== IMMEDIATE PAYMENTS ==="')
    const headers = [
      'timestamp','merchantName','merchantWallet','customerWallet',
      'amount','token','paymentRef','purposeCode','description',
      'txHash','arcscanUrl','receiptUrl','status',
    ]
    lines.push(headers.map(h => `"${h}"`).join(','))
    for (const r of receipts) {
      lines.push([
        r.timestamp_utc    ?? '',
        r.merchant_name    ?? '',
        r.merchant_wallet  ?? '',
        r.customer_wallet  ?? '',
        r.amount           ?? '',
        r.token_symbol     ?? 'USDC',
        r.payment_ref      ?? '',
        r.purpose_code     ?? '',
        r.description      ?? '',
        r.transaction_hash ?? '',
        r.arcscan_link     ?? '',
        r.receipt_page     ?? '',
        r.status           ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    lines.push('')
  }

  // Section 2 — Commitments
  if (commitments.length > 0) {
    lines.push('"=== DELAYED & TRANCHE PAYMENTS ==="')
    const headers = [
      'timestamp','type','status','ref','description',
      'merchantWallet','customerWallet','totalAmount',
      'dueDate','deadline','trancheCount','tranchesPaid',
      'commitmentUrl','contractAddress',
    ]
    lines.push(headers.map(h => `"${h}"`).join(','))
    for (const c of commitments) {
      lines.push([
        formatTs(c.createdAt),
        COMMITMENT_TYPE_LABEL[c.type]    ?? '',
        COMMITMENT_STATUS_LABEL[c.status] ?? '',
        c.ref         ?? '',
        c.description ?? '',
        c.merchant    ?? '',
        c.customer    ?? '',
        c.totalAmount ?? '',
        formatTs(c.dueDate),
        formatTs(c.deadline),
        c.trancheAmounts?.length ?? 0,
        c.tranchesPaidCount ?? 0,
        `${APP_URL}/commitment/${c.commitmentId}`,
        ARC_COMMITMENT_ADDRESS ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    lines.push('')
  }

  // Section 3 — Refund requests
  if (refunds.length > 0) {
    lines.push('"=== REFUND REQUESTS ==="')
    const headers = [
      'requestedAt','status','refundId','proofRef','reason',
      'merchantWallet','customerWallet','amount','expiresAt','processedAt',
      'contractAddress',
    ]
    lines.push(headers.map(h => `"${h}"`).join(','))
    for (const r of refunds) {
      lines.push([
        formatTs(r.requestedAt),
        REFUND_STATUS_LABEL[r.status] ?? '',
        r.refundId    ?? '',
        r.proofRef    ?? '',
        r.reason      ?? '',
        r.merchant    ?? '',
        r.customer    ?? '',
        r.amount      ?? '',
        formatTs(r.expiresAt),
        formatTs(r.processedAt),
        ARC_REFUND_ADDRESS ?? '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    }
    lines.push('')
  }

  lines.push('"TESTNET ONLY. Testnet tokens have no real economic value."')

  const csv  = lines.join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `arcpay_${role}_${walletAddress?.slice(0, 8)}_${date}.csv`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
