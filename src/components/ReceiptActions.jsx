import { downloadReceiptPDF } from '../utils/pdf.js'
import { ARCSCAN_BASE } from '../config.js'

export default function ReceiptActions({ receipt }) {
  if (!receipt) return null

  function downloadJSON() {
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `arcpay_receipt_${receipt.receipt_id}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function copyLink() {
    navigator.clipboard.writeText(receipt.receipt_page || window.location.href)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: receipt.transaction_hash ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 8 }}>
      <button onClick={copyLink}                       className="btn-ghost" style={{ fontSize: 12, padding: '10px 6px' }}>🔗 Link</button>
      <button onClick={downloadJSON}                   className="btn-ghost" style={{ fontSize: 12, padding: '10px 6px' }}>📥 JSON</button>
      <button onClick={() => downloadReceiptPDF(receipt)} className="btn-ghost" style={{ fontSize: 12, padding: '10px 6px' }}>🖨️ PDF</button>
      {receipt.transaction_hash && (
        <a href={`${ARCSCAN_BASE}/tx/${receipt.transaction_hash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '10px 6px', width: '100%' }}>🔍 ArcScan ↗</button>
        </a>
      )}
    </div>
  )
}
