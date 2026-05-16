import { QRCodeSVG } from 'qrcode.react'
import { useState } from 'react'

// MetaMask in-app browser deep link
// https://link.metamask.io/dapp/{urlWithoutProtocol}
function buildMetaMaskDappUrl(checkoutUrl) {
  try {
    const urlWithoutProtocol = checkoutUrl.replace(/^https?:\/\//, '')
    return `https://link.metamask.io/dapp/${urlWithoutProtocol}`
  } catch {
    return checkoutUrl
  }
}

export default function QRCodeBox({ url, size = 180, label = '' }) {
  const [tab,    setTab]    = useState('metamask') // 'metamask' | 'standard'
  const [copied, setCopied] = useState(false)

  const metaMaskUrl = buildMetaMaskDappUrl(url)
  const activeUrl   = tab === 'metamask' ? metaMaskUrl : url

  function copyLink() {
    navigator.clipboard.writeText(activeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadQR() {
    const svg = document.getElementById('arcpay-qr-svg')
    if (!svg) return
    const data = new XMLSerializer().serializeToString(svg)
    const blob = new Blob([data], { type: 'image/svg+xml' })
    const u    = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = u; a.download = 'arcpay-qr.svg'
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(u)
  }

  return (
    <div style={{ textAlign: 'center' }}>
      {label && (
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
        <button
          onClick={() => setTab('metamask')}
          style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === 'metamask' ? '#f6851b' : 'var(--surface2)',
            color: tab === 'metamask' ? '#fff' : 'var(--text3)',
          }}
        >
          🦊 MetaMask Mobile
        </button>
        <button
          onClick={() => setTab('standard')}
          style={{
            padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
            background: tab === 'standard' ? 'var(--usdc)' : 'var(--surface2)',
            color: tab === 'standard' ? '#fff' : 'var(--text3)',
          }}
        >
          🌐 Standard
        </button>
      </div>

      {/* Info text */}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>
        {tab === 'metamask'
          ? 'Scan with MetaMask — opens checkout inside the app, no external browser.'
          : 'Standard checkout link. Works with any browser or wallet.'}
      </div>

      {/* QR */}
      <div style={{ display: 'inline-block', background: '#fff', padding: 14, borderRadius: 12 }}>
        <QRCodeSVG id="arcpay-qr-svg" value={activeUrl} size={size} />
      </div>

      {/* URL preview */}
      <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 6, fontFamily: 'var(--mono)', wordBreak: 'break-all', maxWidth: 300, margin: '6px auto 0', opacity: 0.7 }}>
        {activeUrl.length > 80 ? activeUrl.slice(0, 80) + '…' : activeUrl}
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
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
