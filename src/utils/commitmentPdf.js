import jsPDF from 'jspdf'
import { COMMITMENT_STATUS_LABEL, COMMITMENT_TYPE_LABEL } from './commitment.js'
import { ARCSCAN_BASE, APP_URL } from '../config.js'

function formatTs(unix) {
  if (!unix || unix === 0) return 'N/A'
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

export function downloadCommitmentPDF(c, txHash) {
  if (!c) return
  const doc    = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 20
  const w      = 210 - margin * 2
  let y        = margin

  // ── Header ──
  doc.setFillColor(10, 10, 20)
  doc.rect(0, 0, 210, 40, 'F')
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('ArcPay', margin, 18)
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(160, 160, 180)
  doc.text(`${COMMITMENT_TYPE_LABEL[c.type] ?? 'Commitment'} Receipt · Arc Testnet`, margin, 26)
  doc.setFontSize(10); doc.setTextColor(255, 200, 0)
  doc.text('TESTNET ONLY', 210 - margin, 14, { align: 'right' })
  y = 50

  // ── Title ──
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 120, 255)
  doc.text(`${COMMITMENT_TYPE_LABEL[c.type] ?? 'Commitment'} · ${c.ref}`, margin, y); y += 10

  doc.setFontSize(24); doc.setFont('helvetica', 'bold'); doc.setTextColor(30, 120, 255)
  doc.text(`${c.totalAmount} USDC`, margin, y + 6); y += 14

  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 120, 140)
  doc.text(formatTs(c.createdAt), margin, y); y += 10

  // ── Divider ──
  doc.setDrawColor(40, 40, 60); doc.setLineWidth(0.3); doc.line(margin, y, margin + w, y); y += 6

  // ── Fields ──
  function addField(label, value, highlight) {
    if (y > 260) { doc.addPage(); y = margin }
    doc.setFontSize(9); doc.setFont('helvetica', 'bold')
    doc.setTextColor(100, 100, 130); doc.text(label, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(highlight ? [30, 120, 255] : [30, 30, 50])
    const lines = doc.splitTextToSize(String(value ?? 'N/A'), w - 60)
    doc.text(lines, margin + 60, y)
    y += lines.length * 5 + 2
  }

  addField('Status',      COMMITMENT_STATUS_LABEL[c.status] ?? c.status)
  addField('Type',        COMMITMENT_TYPE_LABEL[c.type] ?? c.type)
  addField('Ref',         c.ref)
  if (c.description) addField('Description', c.description)

  doc.setDrawColor(40, 40, 60); doc.line(margin, y, margin + w, y); y += 6

  addField('Merchant',    c.merchant)
  addField('Customer',    c.customer)

  doc.setDrawColor(40, 40, 60); doc.line(margin, y, margin + w, y); y += 6
  addField('Total Amount', `${c.totalAmount} USDC`, true)

  if (c.type === 0) {
    // Delayed
    addField('Due Date',    formatTs(c.dueDate))
    addField('Deadline',    formatTs(c.deadline))
    addField('Paid',        c.paid ? 'Yes' : 'No')
  } else {
    // Tranche
    addField('Tranches',    `${c.tranchesPaidCount} / ${c.trancheAmounts.length} paid`)
    c.trancheAmounts.forEach((amt, i) => {
      addField(`  Tranche ${i + 1}`, `${amt} USDC — Due: ${formatTs(c.trancheDueDates[i])} — ${c.tranchePaid[i] ? '✓ Paid' : 'Pending'}`)
    })
  }

  doc.setDrawColor(40, 40, 60); doc.line(margin, y, margin + w, y); y += 6

  addField('Network',     'Arc Testnet · Chain ID 5042002')
  addField('Created',     formatTs(c.createdAt))
  if (txHash) {
    addField('TX Hash',   txHash)
    addField('ArcScan',   `${ARCSCAN_BASE}/tx/${txHash}`)
  }
  addField('Receipt URL', `${APP_URL}/commitment/${c.commitmentId}`)

  // ── Footer disclaimer ──
  if (y > 265) { doc.addPage(); y = margin }
  doc.setFontSize(7); doc.setTextColor(120, 120, 130)
  doc.text(
    'TESTNET ONLY. Testnet tokens have no real economic value. Not a regulated payment service. No custody. No KYC/AML.',
    margin, 285, { maxWidth: w }
  )

  const filename = `arcpay_${c.type === 0 ? 'delayed' : 'tranche'}_${c.ref}.pdf`
  doc.save(filename)
}
