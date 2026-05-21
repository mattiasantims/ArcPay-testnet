import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'

// Genera deep link MetaMask — apre direttamente il browser interno di MetaMask
function toMetaMaskDeepLink(url) {
  try {
    const u = new URL(url)
    // Rimuove https:// e genera il deep link
    const dapp = u.host + u.pathname + u.search
    return `https://metamask.app.link/dapp/${dapp}`
  } catch {
    return url
  }
}

export default function QRCodeBox({ url, size = 200, label = 'Scan to pay' }) {
  const [copied, setCopied] = useState(false)
  const metaMaskUrl = toMetaMaskDeepLink(url)

  function copyLink() {
    navigator.clipboard.writeText(metaMaskUrl)
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

      {/* Banner MetaMask */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f6851b22', border: '1px solid #f6851b', borderRadius: 8, marginBottom: 12, maxWidth: 280, margin: '0 auto 12px' }}>
        <span style={{ fontSize: 18 }}>🦊</span>
        <span style={{ fontSize: 11, color: '#f6851b', fontWeight: 600, textAlign: 'center', lineHeight: 1.4 }}>
          Scan with MetaMask to pay directly inside the app
        </span>
      </div>

      <div style={{ display: 'inline-block', background: '#fff', padding: 16, borderRadius: 12 }}>
        <QRCodeSVG id="arcpay-qr-svg" value={metaMaskUrl} size={size} />
      </div>

      <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, fontFamily: 'var(--mono)', wordBreak: 'break-all', maxWidth: 280, margin: '8px auto 0' }}>
        metamask deep link
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
