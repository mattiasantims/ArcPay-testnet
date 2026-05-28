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
  const arc = ARCSCAN

  // Build refund lookup by proofRef
  const refundByRef = {}
  for (const r of refunds) {
    if (r.proofRef) refundByRef[r.proofRef] = r
  }

  // Fixed headers — one row per payment
  const headers = [
    'timestamp',
    'paymentRef',
    'paymentType',       // Immediate | Delayed Payment | Tranche Payment
    'paymentStatus',     // Fulfilled | Active | Overdue | Cancelled
    'refundStatus',      // — | Requested | Approved | Denied | Direct refund
    'merchantWallet',
    'merchantName',
    'merchantLegalName',
    'merchantCountry',
    'customerWallet',
    'totalAmount',
    'description',
    // TX hashes
    'txPayment',          // immediate payment OR commitment creation
    'txFulfilled',        // delayed fulfillment
    'txTranche1',
    'txTranche2',
    'txTranche3',
    'txCancellation',
    'txRefundRequested',
    'txRefundProcessed',  // approve / deny
    'txDirectRefund',
    // ArcScan links
    'arcscanPayment',
    'arcscanRefund',
    // Page link
    'receiptUrl',
  ]

  const rows = [csvRow(headers)]

  // ── Immediate payments ────────────────────────────────────────────────────
  for (const r of receipts) {
    const ref    = r.payment_ref || ''
    const refund = refundByRef[ref] || refundByRef[r.payment_ref] || null
    const rStatus = refund ? (REFUND_STATUS_LABEL[refund.status] || '—') : '—'
    const reqTx   = refund?.requestTxHash || ''
    const proTx   = refund?.processTxHash || ''
    const isDirect = refund?.status === 3

    rows.push(csvRow([
      r.timestamp_utc          ?? '',
      ref,
      'Immediate',
      'Fulfilled',
      rStatus,
      r.merchant_wallet        ?? '',
      r.merchant_name          ?? '',
      r.merchant_legal_name    ?? '',
      r.merchant_country       ?? '',
      r.customer_wallet        ?? '',
      r.amount                 ?? '',
      r.description            ?? '',
      // TX hashes
      r.transaction_hash       ?? '',
      '',  // fulfilled
      '',  // tranche1
      '',  // tranche2
      '',  // tranche3
      '',  // cancellation
      isDirect ? '' : reqTx,
      isDirect ? '' : proTx,
      isDirect ? proTx : '',
      // Links
      r.transaction_hash ? `${arc}/tx/${r.transaction_hash}` : '',
      reqTx ? `${arc}/tx/${reqTx}` : (proTx ? `${arc}/tx/${proTx}` : ''),
      `${APP_URL}/receipt/${r.receipt_id || ''}`,
    ]))
  }

  // ── Delayed & Tranche payments ────────────────────────────────────────────
  for (const c of commitments) {
    const ref       = c.ref || ''
    const refund    = refundByRef[ref] || null
    const rStatus   = refund ? (REFUND_STATUS_LABEL[refund.status] || '—') : '—'
    const reqTx     = refund?.requestTxHash || ''
    const proTx     = refund?.processTxHash || ''
    const isDirect  = refund?.status === 3
    const isOverdue = c.status === 0 && Math.floor(Date.now()/1000) >= (c.deadline || 0)
    const pStatus   = isOverdue ? 'Overdue' : (COMMITMENT_STATUS_LABEL[c.status] || '')
    const tHashes   = c.trancheHashes || []
    const typeLabel = c.type === 0 ? 'Delayed Payment' : 'Tranche Payment'

    rows.push(csvRow([
      c.createdAt ? formatTs(c.createdAt) : '',
      ref,
      typeLabel,
      pStatus,
      rStatus,
      c.merchant    ?? '',
      c.merchantName ?? '',
      c.merchantLegalName ?? '',
      c.merchantCountry   ?? '',
      c.customer    ?? '',
      c.totalAmount ?? '',
      c.description ?? '',
      // TX hashes
      c.createTxHash   || '',
      c.fulfillTxHash  || '',
      tHashes[0]       || '',
      tHashes[1]       || '',
      tHashes[2]       || '',
      c.cancelTxHash   || '',
      isDirect ? '' : reqTx,
      isDirect ? '' : proTx,
      isDirect ? proTx : '',
      // Links
      c.createTxHash ? `${arc}/tx/${c.createTxHash}` : '',
      reqTx ? `${arc}/tx/${reqTx}` : (proTx ? `${arc}/tx/${proTx}` : ''),
      `${APP_URL}/commitment/${c.commitmentId || ''}`,
    ]))
  }

  const csv  = rows.join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = role === 'merchant'
    ? `arcpay_merchant_${walletAddress?.slice(0,8)}_${new Date().toISOString().slice(0,10)}.csv`
    : `arcpay_customer_${walletAddress?.slice(0,8)}_${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
}


export function downloadCSV(receipts, merchantWallet) {
  if (!receipts || receipts.length === 0) return
  const lines = []
  lines.push(csvRow([
    'timestamp', 'merchantWallet',
    'merchantName', 'merchantLegalName', 'merchantCountry',
    'customerWallet', 'amount',
    'paymentRef', 'purposeCode', 'description', 'paymentStatus',
    'txHash', 'arcscanUrl', 'receiptUrl',
  ]))
  for (const r of receipts) {
    lines.push(csvRow([
      r.timestamp_utc ?? '', r.merchant_wallet ?? '',
      r.merchant_name ?? '', r.merchant_legal_name ?? '', r.merchant_country ?? '',
      r.customer_wallet ?? '',
      r.amount ?? '', r.payment_ref ?? '', r.purpose_code ?? '',
      r.description ?? '', paymentStatus(r),
      r.transaction_hash ?? '',
      r.transaction_hash ? `${ARCSCAN}/tx/${r.transaction_hash}` : '',
      r.receipt_page ?? '',
    ]))
  }
  exportCsv(lines, `arcpay_${merchantWallet?.slice(0, 8)}_${today()}.csv`)
}
