import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'

export default function QRCodeBox({ url, size = 200, label = 'Scan to pay' }) {
  const [copied, setCopied] = useState(false)

  function copyLink() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadQR() {
    const svg   = document.getElementById('arcpay-qr-svg')
    if (!svg) return
    const data  = new XMLSerializer().serializeToString(svg)
    const blob  = new Blob([data], { type: 'image/svg+xml' })
    const url2  = URL.createObjectURL(blob)
    const a     = document.createElement('a')
    a.href      = url2
    a.download  = 'arcpay-qr.svg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url2)
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {label && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
      )}
      <div style={{ display: 'inline-block', background: '#fff', padding: 16, borderRadius: 12 }}>
        <QRCodeSVG id="arcpay-qr-svg" value={url} size={size} />
      </div>
      <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontFamily: 'var(--mono)', wordBreak: 'break-all', maxWidth: 280, margin: '10px auto 0' }}>
        {url}
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
        <button onClick={copyLink} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
          {copied ? '✓ Copied!' : '🔗 Copy link'}
        </button>
        <button onClick={downloadQR} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
          ⬇ QR SVG
        </button>
      </div>
    </div>
  )
}
