// payoutPdf.js — Payout receipt PDF generation
import { fromUsdc } from './payout.js'
import { ARCSCAN_BASE, APP_URL } from '../config.js'

export function buildPayoutReceiptObject(payout, txHash, counterpartyAlias = '', counterpartyCategory = '', merchantProfile = null) {
  return {
    arcpay_version:    'v0.1-testnet',
    type:              'Payout Receipt',
    payout_id:         payout.id?.toString() ?? '',
    merchant_wallet:   payout.merchant,
    merchant_name:        merchantProfile?.tradingName     || '',
    merchant_legal_name:  merchantProfile?.legalName       || '',
    merchant_country:     merchantProfile?.country         || '',
    merchant_address:     merchantProfile?.businessAddress || '',
    merchant_vat:         merchantProfile?.vatOrCompanyId  || '',
    merchant_lei:         merchantProfile?.lei             || '',
    recipient_wallet:  payout.recipient,
    counterparty_alias:    counterpartyAlias,
    counterparty_category: counterpartyCategory,
    amount:            fromUsdc(payout.amount).toFixed(2),
    payment_ref:       payout.paymentRef,
    description:       payout.description,
    purpose_code:      payout.purposeCode,
    metadata_hash:     payout.metadataHash,
    batch_ref_hash:    payout.batchRefHash,
    is_batch_item:     payout.batchRefHash && payout.batchRefHash !== '0x' + '0'.repeat(64),
    created_at:        payout.createdAt ? new Date(Number(payout.createdAt) * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : '—',
    transaction_hash:  txHash || '',
    arcscan_link:      txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : '',
    payout_page:       `${APP_URL}/payout/${payout.id}`,
    network:           'Arc Testnet · Chain ID 5042002',
    disclaimer:        'Testnet demo only. Payout labels, descriptions and references may be publicly visible on-chain. Do not include personal, payroll, tax or confidential information.',
  }
}

export function downloadPayoutReceiptPDF(receipt) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('PDF library not loaded'); return }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18
  let y = margin

  const addField = (key, val) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(100,100,100)
    doc.text(key, margin, y)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(17,17,17)
    const lines = doc.splitTextToSize(String(val || '—'), 130)
    doc.text(lines, 70, y); y += Math.max(lines.length * 5, 7)
  }
  const addDivider = () => { doc.setDrawColor(220,220,220); doc.line(margin, y, 192, y); y += 5 }

  // Header
  doc.setFillColor(8, 10, 15); doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255,255,255)
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('ArcPay', margin, 13)
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text('Payout Receipt · Arc Testnet', margin, 20)
  doc.setFillColor(240,80,80); doc.roundedRect(148, 8, 44, 10, 2, 2, 'F')
  doc.setTextColor(255,255,255); doc.text('TESTNET ONLY', 170, 14.5, { align: 'center' })

  y = 38; doc.setTextColor(30,30,30)
  doc.setFontSize(16); doc.setFont('helvetica','bold')
  doc.text(`Payout Receipt · ${receipt.payment_ref || receipt.payout_id}`, margin, y); y += 9
  doc.setFontSize(22); doc.setTextColor(39,117,202)
  doc.text(`${receipt.amount} USDC`, margin, y); y += 8
  doc.setFontSize(9); doc.setTextColor(120,120,120); doc.setFont('helvetica','normal')
  doc.text(receipt.created_at, margin, y); y += 6
  addDivider()

  addField('Type',              receipt.is_batch_item ? 'Batch Payout Item' : 'Single Payout')
  addField('Payment Ref',       receipt.payment_ref)
  addField('Description',       receipt.description)
  addField('Purpose Code',      receipt.purpose_code)
  if (receipt.counterparty_alias) {
    addField('Counterparty Alias',    receipt.counterparty_alias)
    addField('Counterparty Category', receipt.counterparty_category)
  }
  addDivider()
  if (receipt.merchant_name)       addField('Merchant',        receipt.merchant_name)
  if (receipt.merchant_legal_name) addField('Legal name',      receipt.merchant_legal_name)
  if (receipt.merchant_country)    addField('Country',         receipt.merchant_country)
  if (receipt.merchant_address)    addField('Address',         receipt.merchant_address)
  if (receipt.merchant_vat)        addField('VAT/Company ID',  receipt.merchant_vat)
  if (receipt.merchant_lei)        addField('LEI',             receipt.merchant_lei)
  addField('Merchant wallet',     receipt.merchant_wallet)
  addField('Recipient wallet',    receipt.recipient_wallet)
  addField('Amount',            `${receipt.amount} USDC`)
  addDivider()
  addField('Network',           receipt.network)
  if (receipt.transaction_hash) {
    addField('TX Hash',         receipt.transaction_hash)
    addField('ArcScan',         receipt.arcscan_link)
  }
  addField('Metadata Hash',     receipt.metadata_hash)
  addField('Payout URL',        receipt.payout_page)

  y += 4
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150)
  const dl = doc.splitTextToSize(receipt.disclaimer, 174)
  dl.forEach(line => { doc.text(line, margin, y); y += 4 })
  y += 2
  doc.text(`Generated by ArcPay v0.1 · ${new Date().toISOString()}`, margin, y)

  doc.save(`arcpay_payout_${(receipt.payment_ref || receipt.payout_id || 'payout').replace(/[^a-zA-Z0-9-_]/g,'_')}.pdf`)
}

export function downloadPayoutReceiptJSON(receipt) {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = `arcpay_payout_${(receipt.payment_ref || receipt.payout_id || 'payout').replace(/[^a-zA-Z0-9-_]/g,'_')}.json`
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
