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
  doc.text(`Tranche Payment Receipt — Travel #${receipt.travel_id}`, margin, y); y += 10
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

  addField('Travel ID',       `#${receipt.travel_id}`)
  addField('Travel Ref',      receipt.travel_ref)
  addField('Customer',        receipt.customer_wallet)
  addField('Agency',          receipt.merchant_wallet)
  addField('Agency Name',     receipt.agency_name)
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
