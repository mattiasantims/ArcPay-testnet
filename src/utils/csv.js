import { COMMITMENT_STATUS_LABEL, COMMITMENT_TYPE_LABEL } from './commitment.js'
import { REFUND_STATUS_LABEL } from './refund.js'
import { APP_URL } from '../config.js'

const ARCSCAN = 'https://testnet.arcscan.app'

function formatTs(unix) {
  if (!unix || unix === 0) return ''
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}
function today() { return new Date().toISOString().slice(0, 10) }
function csvRow(cells) { return cells.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') }
function exportCsv(lines, filename) {
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Derive payment status from payment + refund
function paymentStatus(r) {
  const rs = r.refundStatus
  if (!rs || rs === '—') return 'Paid'
  if (rs === 'Requested')     return 'Refund Requested'
  if (rs === 'Approved')      return 'Refunded'
  if (rs === 'Direct refund') return 'Refunded'
  if (rs === 'Denied')        return 'Refund Denied'
  return 'Paid'
}

// ── Unified export ────────────────────────────────────────────────────────────
export function downloadUnifiedCSV({ receipts = [], commitments = [], refunds = [], walletAddress, role = 'merchant' }) {
  const lines = []

  // ── Immediate payments ───────────────────────────────────────────────────
  if (receipts.length > 0) {
    lines.push('"=== IMMEDIATE PAYMENTS ==="')
    lines.push(csvRow([
      'timestamp', 'merchantWallet', 'customerWallet', 'amount',
      'paymentRef', 'purposeCode', 'description',
      'paymentStatus',                    // Paid / Refund Requested / Refunded / Refund Denied
      'txHash', 'arcscanUrl', 'receiptUrl',
    ]))
    for (const r of receipts) {
      lines.push(csvRow([
        r.timestamp_utc    ?? '',
        r.merchant_wallet  ?? '',
        r.customer_wallet  ?? '',
        r.amount           ?? '',
        r.payment_ref      ?? '',
        r.purpose_code     ?? '',
        r.description      ?? '',
        paymentStatus(r),
        r.transaction_hash ?? '',
        r.transaction_hash ? `${ARCSCAN}/tx/${r.transaction_hash}` : '',
        r.receipt_page     ?? '',
      ]))
    }
    lines.push('')
  }

  // ── Delayed & tranche payments ────────────────────────────────────────────
  if (commitments.length > 0) {
    lines.push('"=== DELAYED & TRANCHE PAYMENTS ==="')
    lines.push(csvRow([
      'createdAt', 'type', 'commitmentStatus', 'ref', 'description',
      'merchantWallet', 'customerWallet', 'totalAmount',
      'dueDate', 'deadline', 'trancheCount', 'tranchesPaid',
      'commitmentUrl',
    ]))
    for (const c of commitments) {
      lines.push(csvRow([
        formatTs(c.createdAt),
        COMMITMENT_TYPE_LABEL[c.type]    ?? '',
        COMMITMENT_STATUS_LABEL[c.status] ?? '',
        c.ref          ?? '',
        c.description  ?? '',
        c.merchant     ?? '',
        c.customer     ?? '',
        c.totalAmount  ?? '',
        formatTs(c.dueDate),
        formatTs(c.deadline),
        c.trancheAmounts?.length  ?? 0,
        c.tranchesPaidCount       ?? 0,
        `${APP_URL}/commitment/${c.commitmentId}`,
      ]))
    }
    lines.push('')
  }

  // ── Refund requests ───────────────────────────────────────────────────────
  if (refunds.length > 0) {
    lines.push('"=== REFUND REQUESTS ==="')
    lines.push(csvRow([
      'requestedAt', 'processedAt', 'refundStatus',
      'proofRef', 'reason',                         // no refundId column
      'merchantWallet', 'customerWallet', 'amount',
      'requestTxHash', 'requestArcScan',
      'processTxHash', 'processArcScan',
    ]))
    for (const r of refunds) {
      const reqTx  = r.requestTxHash  || ''
      const procTx = r.processTxHash  || ''
      lines.push(csvRow([
        formatTs(r.requestedAt),
        formatTs(r.processedAt),
        REFUND_STATUS_LABEL[r.status] ?? '',
        r.proofRef  ?? '',
        r.reason    ?? '',
        r.merchant  ?? '',
        r.customer  ?? '',
        r.amount    ?? '',
        reqTx,
        reqTx  ? `${ARCSCAN}/tx/${reqTx}`  : '',
        procTx,
        procTx ? `${ARCSCAN}/tx/${procTx}` : '',
      ]))
    }
    lines.push('')
  }

  lines.push('"TESTNET ONLY. Testnet tokens have no real economic value."')
  exportCsv(lines, `arcpay_${role}_${walletAddress?.slice(0, 8)}_${today()}.csv`)
}

// ── Legacy single-section export (kept for compatibility) ─────────────────────
export function downloadCSV(receipts, merchantWallet) {
  if (!receipts || receipts.length === 0) return
  const lines = []
  lines.push(csvRow([
    'timestamp', 'merchantWallet', 'customerWallet', 'amount',
    'paymentRef', 'purposeCode', 'description', 'paymentStatus',
    'txHash', 'arcscanUrl', 'receiptUrl',
  ]))
  for (const r of receipts) {
    lines.push(csvRow([
      r.timestamp_utc ?? '', r.merchant_wallet ?? '', r.customer_wallet ?? '',
      r.amount ?? '', r.payment_ref ?? '', r.purpose_code ?? '',
      r.description ?? '', paymentStatus(r),
      r.transaction_hash ?? '',
      r.transaction_hash ? `${ARCSCAN}/tx/${r.transaction_hash}` : '',
      r.receipt_page ?? '',
    ]))
  }
  exportCsv(lines, `arcpay_${merchantWallet?.slice(0, 8)}_${today()}.csv`)
}
