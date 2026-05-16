import { APP_URL } from '../config.js'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { decodePaymentRequest } from '../utils/paymentRequest.js'
import { shortAddress } from '../utils/wallet.js'

export default function QRPage() {
  const [params] = useSearchParams()
  const navigate  = useNavigate()
  const r         = params.get('r')
  const req       = r ? decodePaymentRequest(r) : null
  const payUrl    = r ? `${APP_URL}/pay?r=${r}` : null

  if (!req || !payUrl) {
    return (
      <div style={{
        minHeight: '100vh', background: '#050608',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}>
        <p style={{ color: '#666' }}>Invalid QR request.</p>
        <button onClick={() => navigate('/create')} className="btn-ghost" style={{ marginTop: 16 }}>
          ← Create payment request
        </button>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#050608',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: 32, textAlign: 'center',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, background: '#2775ca', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff' }}>A</div>
        <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: '#fff' }}>ArcPay</div>
      </div>

      {/* Amount */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 14, color: '#666', marginBottom: 8 }}>
          {req.name || shortAddress(req.merchant)}
        </div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 72, fontWeight: 800, color: '#2775ca', letterSpacing: '-3px', lineHeight: 1 }}>
          {req.amount}
        </div>
        <div style={{ fontSize: 22, color: '#888', marginTop: 8 }}>USDC</div>
        {req.desc && <div style={{ fontSize: 16, color: '#666', marginTop: 12 }}>{req.desc}</div>}
        {req.ref && <div style={{ fontSize: 13, color: '#444', marginTop: 6, fontFamily: 'var(--mono)' }}>{req.ref}</div>}
      </div>

      {/* QR */}
      <div style={{ background: '#fff', padding: 24, borderRadius: 20, marginBottom: 32 }}>
        <QRCodeSVG value={payUrl} size={280} />
      </div>

      <div style={{ fontSize: 16, color: '#555', marginBottom: 8 }}>Scan with your phone to pay</div>
      <div style={{ fontSize: 12, color: '#333', fontFamily: 'var(--mono)', wordBreak: 'break-all', maxWidth: 360, marginBottom: 32 }}>
        {payUrl}
      </div>

      {/* Badges */}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 32 }}>
        <span style={{ fontSize: 12, color: '#2775ca', background: '#2775ca11', border: '1px solid #2775ca33', borderRadius: 20, padding: '4px 12px', fontFamily: 'var(--mono)' }}>
          USDC · Arc Testnet
        </span>
        <span style={{ fontSize: 12, color: '#555', background: '#ffffff11', border: '1px solid #333', borderRadius: 20, padding: '4px 12px' }}>
          ⚡ Sub-second finality
        </span>
      </div>

      <button onClick={() => navigate(-1)} style={{
        background: 'transparent', border: '1px solid #333', color: '#666',
        borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontSize: 13,
      }}>
        ← Back
      </button>

      <div style={{ position: 'absolute', bottom: 20, fontSize: 11, color: '#333' }}>
        TESTNET ONLY · Testnet tokens have no real economic value
      </div>
    </div>
  )
}
