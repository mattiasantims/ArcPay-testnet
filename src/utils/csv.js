import { COMMITMENT_STATUS_LABEL, COMMITMENT_TYPE_LABEL } from './commitment.js'
import { REFUND_STATUS_LABEL } from './refund.js'
import { ARCSCAN_BASE, ARC_COMMITMENT_ADDRESS, ARC_REFUND_ADDRESS, APP_URL } from '../config.js'

function formatTs(unix) {
  if (!unix || unix === 0) return ''
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

// ── Immediate payments ────────────────────────────────────────────────────────
export function downloadCSV(receipts, merchantWallet) {
  if (!receipts || receipts.length === 0) return
  const headers = [
    'timestamp','merchantName','merchantWallet','customerWallet',
    'amount','token','network','chainId','paymentRef','purposeCode',
    'description','metadataHash','txHash','arcscanUrl','receiptUrl',
    'status','testnetDisclaimer',
  ]
  const rows = receipts.map(r => [
    r.timestamp_utc ?? '', r.merchant_name ?? '', r.merchant_wallet ?? '',
    r.customer_wallet ?? '', r.amount ?? '', r.token_symbol ?? 'USDC',
    r.network ?? '', '5042002', r.payment_ref ?? '', r.purpose_code ?? '',
    r.description ?? '', r.metadata_hash ?? '', r.transaction_hash ?? '',
    r.arcscan_link ?? '', r.receipt_page ?? '', r.status ?? '', r.disclaimer ?? '',
  ])
  exportCsv([headers, ...rows], `arcpay_${merchantWallet?.slice(0, 8)}_${today()}.csv`)
}

// ── Unified export: receipts + commitments + refunds ─────────────────────────
export function downloadUnifiedCSV({ receipts = [], commitments = [], refunds = [], walletAddress, role = 'merchant' }) {
  const lines = []

  if (receipts.length > 0) {
    lines.push('"=== IMMEDIATE PAYMENTS ==="')
    lines.push(csvRow(['timestamp','merchantWallet','customerWallet','amount','paymentRef',
      'purposeCode','description','txHash','arcscanUrl','receiptUrl','paymentStatus','refundStatus']))
    for (const r of receipts) {
      lines.push(csvRow([
        r.timestamp_utc ?? '', r.merchant_wallet ?? '', r.customer_wallet ?? '',
        r.amount ?? '', r.payment_ref ?? '', r.purpose_code ?? '',
        r.description ?? '', r.transaction_hash ?? '', r.arcscan_link ?? '',
        r.receipt_page ?? '', r.status ?? 'Confirmed', r.refundStatus ?? '—',
      ]))
    }
    lines.push('')
  }

  if (commitments.length > 0) {
    lines.push('"=== DELAYED & TRANCHE PAYMENTS ==="')
    lines.push(csvRow(['createdAt','type','commitmentStatus','ref','description',
      'merchantWallet','customerWallet','totalAmount','dueDate','deadline',
      'trancheCount','tranchesPaid','refundStatus','commitmentUrl']))
    for (const c of commitments) {
      // Find matching refund
      lines.push(csvRow([
        formatTs(c.createdAt),
        COMMITMENT_TYPE_LABEL[c.type] ?? '',
        COMMITMENT_STATUS_LABEL[c.status] ?? '',
        c.ref ?? '', c.description ?? '',
        c.merchant ?? '', c.customer ?? '', c.totalAmount ?? '',
        formatTs(c.dueDate), formatTs(c.deadline),
        c.trancheAmounts?.length ?? 0, c.tranchesPaidCount ?? 0,
        '—', // refund status injected by caller if needed
        `${APP_URL}/commitment/${c.commitmentId}`,
      ]))
    }
    lines.push('')
  }

  if (refunds.length > 0) {
    lines.push('"=== REFUND REQUESTS ==="')
    lines.push(csvRow(['requestedAt','processedAt','refundStatus','refundId',
      'proofRef','reason','merchantWallet','customerWallet','amount']))
    for (const r of refunds) {
      lines.push(csvRow([
        formatTs(r.requestedAt), formatTs(r.processedAt),
        REFUND_STATUS_LABEL[r.status] ?? '',
        r.refundId ?? '', r.proofRef ?? '', r.reason ?? '',
        r.merchant ?? '', r.customer ?? '', r.amount ?? '',
      ]))
    }
    lines.push('')
  }

  lines.push('"TESTNET ONLY. Testnet tokens have no real economic value."')
  exportCsv(lines, `arcpay_${role}_${walletAddress?.slice(0, 8)}_${today()}.csv`, true)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10) }
function csvRow(cells) { return cells.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',') }
function exportCsv(linesOrRows, filename, raw = false) {
  const csv  = raw ? linesOrRows.join('\n') : linesOrRows.map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
