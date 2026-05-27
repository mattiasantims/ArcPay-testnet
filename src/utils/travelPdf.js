// travelPdf.js — Travel Booking Receipt and Tranche Payment Receipt generation

import { fromUsdc } from './travel.js'
import { ARCSCAN_BASE, APP_URL } from '../config.js'

// ─── Travel Booking Receipt (initial payment) ─────────────────────────────────

export function buildTravelReceiptObject({ travel, txHash, travelId, agencyName, description }) {
  const fmt = raw => fromUsdc(raw).toFixed(2)
  return {
    arcpay_version:           'v0.1-testnet',
    travel_id:                travelId,
    type:                     'Travel Booking Receipt',
    status:                   ['Active', 'Tranche Paid', 'Cancelled', 'Cancelled — Missed Payment', 'Released to Merchant'][travel.status] || 'Unknown',
    merchant_wallet:          travel.merchant,
    agency_name:              agencyName || travel.merchant,
    customer_wallet:          travel.customer,
    total_package_amount:     fmt(travel.totalPackageAmount),
    initial_payment_amount:   fmt(travel.initialPaymentAmount),
    non_refundable_amount:    fmt(travel.nonRefundableAmount),
    refundable_escrow_amount: fmt(travel.refundableEscrowAmount),
    non_refundable_bps:       travel.nonRefundableBps?.toString(),
    non_refundable_pct:       `${Math.round(travel.nonRefundableBps / 100)}%`,
    tranche_amount:           fmt(travel.trancheAmount),
    payment_due_date:         travel.paymentDueDate ? new Date(travel.paymentDueDate * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    payment_deadline:         travel.paymentDeadline ? new Date(travel.paymentDeadline * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    cancellation_deadline:    travel.cancellationDeadline ? new Date(travel.cancellationDeadline * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    travel_start_date:        travel.travelStartDate ? new Date(travel.travelStartDate * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    travel_ref:               travel.travelRef,
    description:              description || '—',
    tranche_paid:             travel.tranchePaid ? 'Yes' : 'No',
    tranche_paid_at:          travel.tranchePaidAt ? new Date(travel.tranchePaidAt * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    created_at:               travel.createdAt ? new Date(travel.createdAt * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    closed_at:                travel.closedAt ? new Date(travel.closedAt * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    created_block:            travel.createdBlock?.toString(),
    transaction_hash:         txHash || '—',
    arcscan_link:             txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : '—',
    travel_page:              `${APP_URL}/travel/${travelId}`,
    network:                  'Arc Testnet (Chain ID: 5042002)',
    contract_address:         travel.merchant,
    disclaimer:               'TESTNET ONLY. Not a regulated escrow or travel booking service. Not a lending, financing, or credit product. Testnet tokens have no real economic value.',
  }
}

export function downloadTravelReceiptJSON(receipt) {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `arcpay_travel_${receipt.travel_id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadTravelReceiptPDF(receipt) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('PDF library not loaded'); return }
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18
  let y = margin

  const addLine = (text, size = 10, bold = false) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    const lines = doc.splitTextToSize(String(text), 174)
    lines.forEach(line => {
      if (y > 270) { doc.addPage(); y = margin }
      doc.text(line, margin, y)
      y += size * 0.45
    })
    y += 2
  }

  const addField = (key, val) => {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(key, margin, y)
    doc.setFont('helvetica', 'normal')
    const valLines = doc.splitTextToSize(String(val || '—'), 120)
    valLines.forEach((line, i) => {
      doc.text(line, 70, y + (i * 4))
    })
    y += Math.max(6, valLines.length * 4)
    if (y > 270) { doc.addPage(); y = margin }
  }

  // Header
  doc.setFillColor(8, 10, 15)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('ArcPay', margin, 13)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('Travel Booking Receipt · Arc Testnet', margin, 20)
  doc.setFontSize(8)
  doc.setFillColor(240, 80, 80)
  doc.roundedRect(148, 8, 44, 10, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text('TESTNET ONLY', 170, 14.5, { align: 'center' })

  y = 38
  doc.setTextColor(30, 30, 30)

  addLine(`Travel Booking Receipt · ${receipt.travel_ref || receipt.travel_id}`, 16, true)
  addLine(`${receipt.initial_payment_amount} USDC (initial payment)`, 13)
  addLine(receipt.created_at, 9)

  y += 4
  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, 192, y); y += 6

  addField('Status',              receipt.status)
  addField('Travel Ref',          receipt.travel_ref)
  addField('Description',         receipt.description)
  addField('Agency / Merchant',   receipt.merchant_wallet)
  addField('Agency',              receipt.agency_name !== receipt.merchant_wallet ? receipt.agency_name : receipt.merchant_wallet)
  if (receipt.merchant_legal_name) addField('Legal Name',  receipt.merchant_legal_name)
  if (receipt.merchant_country)    addField('Country',     receipt.merchant_country)
  if (receipt.merchant_address)    addField('Reg. Office', receipt.merchant_address)
  if (receipt.merchant_vat)        addField('VAT / Co. ID', receipt.merchant_vat)
  if (receipt.merchant_lei)        addField('LEI',         receipt.merchant_lei)
  addField('Customer',            receipt.customer_wallet)

  y += 2; doc.line(margin, y, 192, y); y += 4
  addField('Total Package',       `${receipt.total_package_amount} USDC`)
  addField('Initial Payment',     `${receipt.initial_payment_amount} USDC`)
  addField('Non-refundable',      `${receipt.non_refundable_amount} USDC (${receipt.non_refundable_pct})`)
  addField('Refundable Escrow',   `${receipt.refundable_escrow_amount} USDC`)
  addField('Scheduled Tranche',   `${receipt.tranche_amount} USDC`)
  addField('Tranche Paid',        receipt.tranche_paid)
  if (receipt.tranche_paid === 'Yes') addField('Tranche Paid At', receipt.tranche_paid_at)

  y += 2; doc.line(margin, y, 192, y); y += 4
  addField('Payment Due',         receipt.payment_due_date)
  addField('Payment Deadline',    receipt.payment_deadline)
  addField('Cancel Deadline',     receipt.cancellation_deadline)
  addField('Travel Start',        receipt.travel_start_date)

  y += 2; doc.line(margin, y, 192, y); y += 4
  addField('TX Hash',             receipt.transaction_hash)
  addField('ArcScan',             receipt.arcscan_link)
  addField('Network',             receipt.network)

  y += 6
  doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  const disclaimer = doc.splitTextToSize(receipt.disclaimer, 174)
  disclaimer.forEach(line => { doc.text(line, margin, y); y += 4 })
  y += 2
  doc.text(`Generated by ArcPay v0.1 · ${new Date().toISOString()}`, margin, y)

  doc.save(`arcpay_travel_${(receipt.travel_ref || receipt.travel_id || 'travel').replace(/[^a-zA-Z0-9-_]/g,'_')}.pdf`)
}

// ─── Tranche Payment Receipt ──────────────────────────────────────────────────

export function buildTrancheReceiptObject({ travel, txHash, travelId, agencyName }) {
  const fmt = raw => fromUsdc(raw).toFixed(2)
  return {
    arcpay_version:    'v0.1-testnet',
    travel_id:         travelId,
    type:              'Tranche Payment Receipt',
    travel_ref:        travel.travelRef,
    customer_wallet:   travel.customer,
    merchant_wallet:   travel.merchant,
    agency_name:       agencyName || travel.merchant,
    tranche_amount:    fmt(travel.trancheAmount),
    tranche_paid_at:   travel.tranchePaidAt ? new Date(travel.tranchePaidAt * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—',
    transaction_hash:  txHash || '—',
    arcscan_link:      txHash ? `${ARCSCAN_BASE}/tx/${txHash}` : '—',
    network:           'Arc Testnet (Chain ID: 5042002)',
    disclaimer:        'TESTNET ONLY. Not a regulated service. Testnet tokens have no real economic value.',
    generated_at:      new Date().toISOString(),
  }
}

export function downloadTrancheReceiptJSON(receipt) {
  const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `arcpay_tranche_${receipt.travel_id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadTrancheReceiptPDF(receipt) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('PDF library not loaded'); return }
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18
  let y = margin

  doc.setFillColor(8, 10, 15)
  doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text('ArcPay', margin, 13)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal')
  doc.text('Tranche Payment Receipt · Arc Testnet', margin, 20)
  doc.setFillColor(240, 80, 80)
  doc.roundedRect(148, 8, 44, 10, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.text('TESTNET ONLY', 170, 14.5, { align: 'center' })

  y = 38; doc.setTextColor(30, 30, 30)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.text(`Tranche Payment Receipt · ${receipt.travel_ref || receipt.travel_id}`, margin, y); y += 10
  doc.setFontSize(13); doc.setFont('helvetica', 'normal')
  doc.text(`${receipt.tranche_amount} USDC`, margin, y); y += 8
  doc.setFontSize(9); doc.text(receipt.tranche_paid_at, margin, y); y += 10

  doc.setDrawColor(220, 220, 220)
  doc.line(margin, y, 192, y); y += 6

  const addField = (key, val) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.text(key, margin, y)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(String(val || '—'), 120)
    lines.forEach((l, i) => doc.text(l, 70, y + i * 4))
    y += Math.max(6, lines.length * 4)
  }

  addField('Travel Ref',      receipt.travel_ref || receipt.travel_id)
  addField('Customer',        receipt.customer_wallet)
  addField('Agency',          receipt.merchant_wallet)
  addField('Agency Name',     receipt.agency_name)
  if (receipt.merchant_legal_name) addField('Legal Name',   receipt.merchant_legal_name)
  if (receipt.merchant_country)    addField('Country',      receipt.merchant_country)
  if (receipt.merchant_address)    addField('Reg. Office',  receipt.merchant_address)
  if (receipt.merchant_vat)        addField('VAT / Co. ID', receipt.merchant_vat)
  if (receipt.merchant_lei)        addField('LEI',          receipt.merchant_lei)
  addField('Tranche Amount',  `${receipt.tranche_amount} USDC`)
  addField('Paid At',         receipt.tranche_paid_at)
  addField('TX Hash',         receipt.transaction_hash)
  addField('ArcScan',         receipt.arcscan_link)
  addField('Network',         receipt.network)

  y += 6
  doc.setFontSize(8); doc.setTextColor(150, 150, 150)
  doc.text(receipt.disclaimer, margin, y); y += 5
  doc.text(`Generated by ArcPay v0.1 · ${receipt.generated_at}`, margin, y)

  doc.save(`arcpay_tranche_${receipt.travel_id}.pdf`)
}


// ─── Cancellation PDF ─────────────────────────────────────────────────────────
export function downloadTravelCancelPDF(receipt, cancelHash, isMissedPayment = false) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('PDF library not loaded'); return }
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18; let y = margin

  doc.setFillColor(8, 10, 15); doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255,255,255)
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('ArcPay', margin, 13)
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text(`Travel ${isMissedPayment ? 'Cancellation (Missed Payment)' : 'Cancellation'} · Arc Testnet`, margin, 20)
  doc.setFillColor(240,80,80); doc.roundedRect(148, 8, 44, 10, 2, 2, 'F')
  doc.setTextColor(255,255,255); doc.text('TESTNET ONLY', 170, 14.5, { align: 'center' })

  y = 38; doc.setTextColor(30,30,30)
  doc.setFontSize(16); doc.setFont('helvetica','bold')
  doc.text(`Travel ${isMissedPayment ? 'Cancelled — Missed Payment' : 'Cancelled'} · ${receipt.travel_ref || receipt.travel_id}`, margin, y); y += 10
  doc.setFontSize(22); doc.setTextColor(240,80,80)
  doc.text(`${receipt.refundable_escrow_amount} USDC ${isMissedPayment ? 'released to merchant' : 'refunded to customer'}`, margin, y); y += 10
  doc.setDrawColor(220,220,220); doc.line(margin, y, 192, y); y += 6

  const addField = (key, val) => {
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(100,100,100)
    doc.text(key, margin, y)
    doc.setFont('helvetica','normal'); doc.setTextColor(17,17,17)
    const lines = doc.splitTextToSize(String(val || '—'), 130)
    doc.text(lines, 70, y); y += Math.max(lines.length * 5, 7)
  }

  addField('Event',         isMissedPayment ? 'Travel Cancelled for Missed Payment' : 'Travel Cancelled Before Deadline')
  addField('Travel Ref',    receipt.travel_ref)
  addField('Customer',      receipt.customer_wallet)
  addField('Merchant',      receipt.merchant_wallet)
  addField(isMissedPayment ? 'Released' : 'Refunded', `${receipt.refundable_escrow_amount} USDC`)
  addField('Non-refundable', `${receipt.non_refundable_amount} USDC (retained by merchant)`)
  y += 2; doc.line(margin, y, 192, y); y += 4
  addField('Network',       'Arc Testnet · Chain ID 5042002')
  if (cancelHash) {
    addField('TX Hash',     cancelHash)
    addField('ArcScan',     `https://testnet.arcscan.app/tx/${cancelHash}`)
  }
  addField('Travel URL',    receipt.travel_page || '')

  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150)
  doc.text('TESTNET ONLY. Testnet tokens have no real economic value.', margin, 272)
  doc.text(`Generated by ArcPay v0.1 · ${new Date().toISOString()}`, margin, 277)
  doc.save(`arcpay_travel_cancelled_${(receipt.travel_ref || receipt.travel_id).replace(/[^a-zA-Z0-9-_]/g,'_')}.pdf`)
}

// ─── Release PDF ──────────────────────────────────────────────────────────────
export function downloadTravelReleasePDF(receipt, releaseHash) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('PDF library not loaded'); return }
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18; let y = margin

  doc.setFillColor(8, 10, 15); doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255,255,255)
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('ArcPay', margin, 13)
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text('Travel Escrow Released · Arc Testnet', margin, 20)
  doc.setFillColor(240,80,80); doc.roundedRect(148, 8, 44, 10, 2, 2, 'F')
  doc.setTextColor(255,255,255); doc.text('TESTNET ONLY', 170, 14.5, { align: 'center' })

  y = 38; doc.setTextColor(30,30,30)
  doc.setFontSize(16); doc.setFont('helvetica','bold')
  doc.text(`Escrow Released · ${receipt.travel_ref || receipt.travel_id}`, margin, y); y += 10
  doc.setFontSize(22); doc.setTextColor(39,117,202)
  doc.text(`${receipt.refundable_escrow_amount} USDC released`, margin, y); y += 10
  doc.setDrawColor(220,220,220); doc.line(margin, y, 192, y); y += 6

  const addField = (key, val) => {
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(100,100,100)
    doc.text(key, margin, y)
    doc.setFont('helvetica','normal'); doc.setTextColor(17,17,17)
    const lines = doc.splitTextToSize(String(val || '—'), 130)
    doc.text(lines, 70, y); y += Math.max(lines.length * 5, 7)
  }

  addField('Event',         'Escrow Released After Cancellation Deadline')
  addField('Travel Ref',    receipt.travel_ref)
  addField('Customer',      receipt.customer_wallet)
  addField('Merchant',      receipt.merchant_wallet)
  addField('Released',      `${receipt.refundable_escrow_amount} USDC`)
  y += 2; doc.line(margin, y, 192, y); y += 4
  addField('Network',       'Arc Testnet · Chain ID 5042002')
  if (releaseHash) {
    addField('TX Hash',     releaseHash)
    addField('ArcScan',     `https://testnet.arcscan.app/tx/${releaseHash}`)
  }
  addField('Travel URL',    receipt.travel_page || '')

  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150)
  doc.text('TESTNET ONLY. Testnet tokens have no real economic value.', margin, 272)
  doc.text(`Generated by ArcPay v0.1 · ${new Date().toISOString()}`, margin, 277)
  doc.save(`arcpay_travel_released_${(receipt.travel_ref || receipt.travel_id).replace(/[^a-zA-Z0-9-_]/g,'_')}.pdf`)
}

// ─── Tranche Request PDF ──────────────────────────────────────────────────────
export function downloadTrancheRequestPDF(receipt, reqHash) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('PDF library not loaded'); return }
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18; let y = margin

  doc.setFillColor(8, 10, 15); doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255,255,255)
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('ArcPay', margin, 13)
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text('Tranche Payment Requested · Arc Testnet', margin, 20)
  doc.setFillColor(240,80,80); doc.roundedRect(148, 8, 44, 10, 2, 2, 'F')
  doc.setTextColor(255,255,255); doc.text('TESTNET ONLY', 170, 14.5, { align: 'center' })

  y = 38; doc.setTextColor(30,30,30)
  doc.setFontSize(16); doc.setFont('helvetica','bold')
  doc.text(`Tranche Payment Requested · ${receipt.travel_ref || receipt.travel_id}`, margin, y); y += 10
  doc.setFontSize(22); doc.setTextColor(240,192,64)
  doc.text(`${receipt.tranche_amount} USDC due`, margin, y); y += 10
  doc.setDrawColor(220,220,220); doc.line(margin, y, 192, y); y += 6

  const addField = (key, val) => {
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(100,100,100)
    doc.text(key, margin, y)
    doc.setFont('helvetica','normal'); doc.setTextColor(17,17,17)
    const lines = doc.splitTextToSize(String(val || '—'), 130)
    doc.text(lines, 70, y); y += Math.max(lines.length * 5, 7)
  }

  addField('Event',         'Tranche Payment Requested by Merchant')
  addField('Travel Ref',    receipt.travel_ref)
  addField('Customer',      receipt.customer_wallet)
  addField('Merchant',      receipt.merchant_wallet)
  addField('Tranche Amount', `${receipt.tranche_amount} USDC`)
  addField('Payment Due',   receipt.payment_due_date)
  addField('Payment Deadline', receipt.payment_deadline)
  y += 2; doc.line(margin, y, 192, y); y += 4
  addField('Network',       'Arc Testnet · Chain ID 5042002')
  if (reqHash) {
    addField('TX Hash',     reqHash)
    addField('ArcScan',     `https://testnet.arcscan.app/tx/${reqHash}`)
  }
  addField('Travel URL',    receipt.travel_page || '')

  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150)
  doc.text('TESTNET ONLY. Testnet tokens have no real economic value.', margin, 272)
  doc.text(`Generated by ArcPay v0.1 · ${new Date().toISOString()}`, margin, 277)
  doc.save(`arcpay_tranche_request_${(receipt.travel_ref || receipt.travel_id).replace(/[^a-zA-Z0-9-_]/g,'_')}.pdf`)
}

// ─── Full Travel PDF (all events) ─────────────────────────────────────────────
export function downloadFullTravelPDF(receipt, events = []) {
  const { jsPDF } = window.jspdf
  if (!jsPDF) { alert('PDF library not loaded'); return }
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 18; let y = margin

  const addField = (key, val) => {
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(100,100,100)
    doc.text(key, margin, y)
    doc.setFont('helvetica','normal'); doc.setTextColor(17,17,17)
    const lines = doc.splitTextToSize(String(val || '—'), 130)
    doc.text(lines, 70, y); y += Math.max(lines.length * 5, 7)
  }
  const addDivider = () => { doc.setDrawColor(220,220,220); doc.line(margin, y, 192, y); y += 4 }

  doc.setFillColor(8, 10, 15); doc.rect(0, 0, 210, 28, 'F')
  doc.setTextColor(255,255,255)
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('ArcPay', margin, 13)
  doc.setFontSize(9); doc.setFont('helvetica','normal')
  doc.text('Travel Booking + Event History · Arc Testnet', margin, 20)
  doc.setFillColor(240,80,80); doc.roundedRect(148, 8, 44, 10, 2, 2, 'F')
  doc.setTextColor(255,255,255); doc.text('TESTNET ONLY', 170, 14.5, { align: 'center' })

  y = 38; doc.setTextColor(30,30,30)
  doc.setFontSize(16); doc.setFont('helvetica','bold')
  doc.text(`Travel Booking · ${receipt.travel_ref || receipt.travel_id}`, margin, y); y += 10
  doc.setFontSize(22); doc.setTextColor(39,117,202)
  doc.text(`${receipt.total_package_amount} USDC`, margin, y); y += 10
  addDivider()

  doc.setTextColor(30,30,30)
  addField('Travel Ref',    receipt.travel_ref)
  addField('Customer',      receipt.customer_wallet)
  addField('Merchant',      receipt.merchant_wallet)
  addField('Total Package', `${receipt.total_package_amount} USDC`)
  addField('Initial',       `${receipt.initial_payment_amount} USDC`)
  addField('Tranche',       `${receipt.tranche_amount} USDC`)
  addField('Travel Start',  receipt.travel_start_date)
  addField('Network',       'Arc Testnet · Chain ID 5042002')
  addDivider()

  // Event history
  doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(39,117,202)
  doc.text(`Event History (${events.length} event${events.length !== 1 ? 's' : ''})`, margin, y); y += 7

  events.forEach((ev, i) => {
    if (y > 260) { doc.addPage(); y = 20 }
    doc.setFillColor(245,245,245); doc.roundedRect(margin, y-4, 174, ev.txHash ? 20 : 12, 2,2,'F')
    doc.setFontSize(9); doc.setFont('helvetica','bold'); doc.setTextColor(17,17,17)
    doc.text(`${i+1}. ${ev.label}`, margin+3, y+1)
    if (ev.timestamp) {
      doc.setFont('helvetica','normal'); doc.setTextColor(100,100,100)
      doc.text(ev.timestamp, 140, y+1)
    }
    y += 7
    if (ev.detail) {
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80)
      const dl = doc.splitTextToSize(ev.detail, 166)
      doc.text(dl, margin+3, y); y += dl.length * 4 + 1
    }
    if (ev.txHash) {
      doc.setFontSize(7.5); doc.setFont('helvetica','normal'); doc.setTextColor(39,117,202)
      const tl = doc.splitTextToSize(`TX: ${ev.txHash}`, 166)
      doc.text(tl, margin+3, y); y += tl.length * 4 + 1
      const al = doc.splitTextToSize(`ArcScan: https://testnet.arcscan.app/tx/${ev.txHash}`, 166)
      doc.text(al, margin+3, y); y += al.length * 4 + 1
    }
    y += 4
  })

  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150)
  doc.text('TESTNET ONLY. Testnet tokens have no real economic value.', margin, 272)
  doc.text(`Generated by ArcPay v0.1 · ${new Date().toISOString()}`, margin, 277)
  doc.save(`arcpay_full_travel_${(receipt.travel_ref || receipt.travel_id || 'travel').replace(/[^a-zA-Z0-9-_]/g,'_')}.pdf`)
}
