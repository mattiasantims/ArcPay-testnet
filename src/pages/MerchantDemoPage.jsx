import { useState } from 'react'
import { buildPaymentUrl } from '../utils/paymentRequest.js'
import { QRCodeSVG } from 'qrcode.react'

const DEMOS = {
  hotel: {
    label: '🏨 Hotel',
    name: 'Demo Rome Hotel',
    items: [
      { desc: 'Deluxe Superior Room', detail: 'Check-in Jun 20 · Check-out Jun 22', price: 280 },
      { desc: 'City Tax', detail: '2 nights × €3.50/person', price: 7 },
      { desc: 'Breakfast Package', detail: '2 mornings × €18.00', price: 36 },
    ],
    ref: 'BOOK-2026-4821',
    purpose: 'SERVICE',
    color: '#b8860b',
    bg: '#1a1508',
    accent: '#d4a017',
  },
  boutique: {
    label: '👗 Boutique',
    name: 'Demo Luxury Boutique',
    items: [
      { desc: 'Silk Evening Dress — Navy Blue', detail: 'Size 38 · Ref SKU-9921', price: 420 },
      { desc: 'Leather Belt — Gold Buckle', detail: 'Size M · Ref SKU-4402', price: 85 },
    ],
    ref: 'ORD-2026-7743',
    purpose: 'RETAIL',
    color: '#c084fc',
    bg: '#120a1a',
    accent: '#a855f7',
  },
  freelance: {
    label: '💼 Freelancer',
    name: 'Alex Rivera · Strategy & Consulting',
    items: [
      { desc: 'Business Strategy Consulting', detail: 'April 2026 · 8 hours', price: 960 },
      { desc: 'Market Analysis Report', detail: 'Q2 2026 deliverable', price: 240 },
    ],
    ref: 'INV-2026-0089',
    purpose: 'INVOICE',
    color: '#34d399',
    bg: '#071a0f',
    accent: '#10b981',
  },
  ecommerce: {
    label: '🛍️ E-commerce',
    name: 'Demo Online Store',
    items: [
      { desc: 'Premium Smartphone — 256GB', detail: 'Color: Titanium · Serial on delivery', price: 1199 },
      { desc: 'Protective Case', detail: 'Clear · Model compatible', price: 49 },
      { desc: 'Express Shipping — Dubai', detail: 'Delivery 24-48h', price: 15 },
    ],
    ref: 'ORD-2026-DXB-3301',
    purpose: 'RETAIL',
    color: '#60a5fa',
    bg: '#080f1a',
    accent: '#3b82f6',
  },
  charity: {
    label: '❤️ Charity',
    name: 'Demo Wildlife Charity',
    items: [
      { desc: 'Wildlife Protection Donation', detail: 'Supporting endangered species programs', price: 100 },
    ],
    ref: 'DON-2026-0512',
    purpose: 'DONATION',
    color: '#f87171',
    bg: '#1a0808',
    accent: '#ef4444',
  },
}

const DEMO_MERCHANT_ADDRESS = '0x320e684A88dB337009d5ec39EE5e88867a7aB8C8'

export default function MerchantDemoPage({ account }) {
  const [type,       setType]       = useState('hotel')
  const [showQR,     setShowQR]     = useState(false)
  const [customAmt,  setCustomAmt]  = useState('')
  const demo = DEMOS[type]

  const total = demo.items.reduce((s, i) => s + i.price, 0)
  const finalAmount = customAmt && parseFloat(customAmt) > 0
    ? parseFloat(customAmt).toFixed(2)
    : total.toFixed(2)

  const merchantWallet = account || DEMO_MERCHANT_ADDRESS

  // Build ArcPay URL
  const paymentUrl = buildPaymentUrl({
    merchant: merchantWallet,
    amount:   finalAmount,
    ref:      demo.ref,
    purpose:  demo.purpose,
    name:     demo.name,
    desc:     demo.items.map(i => i.desc).join(' + '),
    note:     '',
  })

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24, textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)',
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 20, padding: '4px 14px', marginBottom: 16,
        }}>
          🎬 Merchant Demo — Simulated checkout
        </div>
        <h1 style={{
          fontFamily: 'var(--display)', fontSize: 24, fontWeight: 700,
          letterSpacing: '-0.5px', marginBottom: 6,
        }}>Merchant Demo</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          Simulated checkout pages showing how any merchant can accept USDC via ArcPay.
        </p>
      </div>

      {/* Merchant type selector */}
      <div style={{
        display: 'flex', gap: 8, flexWrap: 'wrap',
        justifyContent: 'center', marginBottom: 28,
      }}>
        {Object.entries(DEMOS).map(([key, d]) => (
          <button
            key={key}
            onClick={() => { setType(key); setShowQR(false); setCustomAmt('') }}
            style={{
              padding: '8px 16px', borderRadius: 20, fontSize: 13,
              border: type === key ? `1px solid ${d.accent}` : '1px solid var(--border)',
              background: type === key ? `${d.accent}22` : 'var(--surface)',
              color: type === key ? d.accent : 'var(--text2)',
              cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500,
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Simulated merchant checkout */}
      <div style={{
        background: demo.bg,
        border: `1px solid ${demo.accent}33`,
        borderRadius: 16, overflow: 'hidden', marginBottom: 20,
      }}>

        {/* Merchant header */}
        <div style={{
          background: `${demo.accent}15`,
          borderBottom: `1px solid ${demo.accent}33`,
          padding: '20px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, color: demo.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Checkout
            </div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, color: '#fff' }}>
              {demo.name}
            </div>
          </div>
          <div style={{
            fontSize: 11, color: demo.color,
            background: `${demo.accent}22`, border: `1px solid ${demo.accent}44`,
            borderRadius: 20, padding: '4px 10px',
          }}>
            Secure Checkout
          </div>
        </div>

        {/* Order items */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Order Summary
          </div>

          {demo.items.map((item, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '12px 0',
              borderBottom: i < demo.items.length - 1 ? `1px solid ${demo.accent}22` : 'none',
              gap: 12,
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#e2e8f5', marginBottom: 3 }}>{item.desc}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>{item.detail}</div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, color: '#e2e8f5', flexShrink: 0 }}>
                {item.price.toFixed(2)} USDC
              </div>
            </div>
          ))}

          {/* Total */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginTop: 16, paddingTop: 16,
            borderTop: `1px solid ${demo.accent}44`,
          }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f5' }}>Total</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 24, fontWeight: 800, color: demo.accent, letterSpacing: '-0.5px' }}>
              ${total.toFixed(2)}
            </div>
          </div>

          {/* Reference */}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8, fontFamily: 'var(--mono)' }}>
            Ref: {demo.ref}
          </div>
        </div>

        {/* Payment methods */}
        <div style={{ padding: '0 24px 24px' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14 }}>
            Payment Method
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

            {/* Credit card (disabled) */}
            <div style={{
              padding: '14px 16px', borderRadius: 10,
              border: '1px solid var(--border)', background: 'var(--surface2)',
              display: 'flex', alignItems: 'center', gap: 12, opacity: 0.5,
            }}>
              <span style={{ fontSize: 20 }}>💳</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Credit / Debit Card</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>Visa, Mastercard, Amex</div>
              </div>
            </div>

            {/* USDC via ArcPay — ACTIVE */}
            <a
              href={paymentUrl}
              style={{ textDecoration: 'none' }}
              onClick={e => { e.preventDefault(); setShowQR(true) }}
            >
              <div style={{
                padding: '16px', borderRadius: 10,
                border: `2px solid ${demo.accent}`,
                background: `${demo.accent}11`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, background: '#2775ca',
                    borderRadius: 8, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff',
                  }}>A</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f5' }}>Pay with USDC</div>
                    <div style={{ fontSize: 11, color: '#2775ca' }}>via ArcPay · Arc Network · instant receipt</div>
                  </div>
                </div>
                <div style={{
                  fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700,
                  color: '#2775ca', letterSpacing: '-0.3px',
                }}>
                  {finalAmount} USDC
                </div>
              </div>
            </a>

          </div>

          {/* Custom amount override */}
          <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }}>Demo amount override:</div>
            <input
              type="number"
              value={customAmt}
              onChange={e => { setCustomAmt(e.target.value); setShowQR(false) }}
              placeholder={total.toFixed(2)}
              style={{ maxWidth: 120, padding: '6px 10px', fontSize: 12 }}
            />
          </div>
        </div>
      </div>

      {/* Demo wallet notice */}
      {!account && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 8, fontSize: 12, color: 'var(--yellow)' }}>
          ⚠️ No wallet connected — payments will go to the demo merchant address. Connect your wallet to receive payments to your own address.
        </div>
      )}
      {account && (
        <div style={{ marginBottom: 16, padding: '8px 14px', background: 'var(--green-bg)', border: '1px solid var(--green-bdr)', borderRadius: 8, fontSize: 12, color: 'var(--green)' }}>
          ✓ Connected — payments will go to your wallet: {account.slice(0,6)}...{account.slice(-4)}
        </div>
      )}
      {showQR && (
        <div className="card fade-up" style={{ marginBottom: 20 }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Pay with USDC</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Scan QR with your phone or open the payment link in your browser
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'center' }}>
            {/* QR */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                📱 Scan with phone
              </div>
              <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 10 }}>
                <QRCodeSVG value={paymentUrl} size={140} />
              </div>
            </div>

            {/* Or open link */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                🖥️ Or pay in browser
              </div>
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <button className="btn-primary" style={{ padding: '12px 24px', fontSize: 14, width: '100%' }}>
                  Open Payment Page →
                </button>
              </a>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
                No QR scan needed — pay directly in browser
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 12, background: 'var(--surface2)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
            ⚡ Powered by ArcPay · Arc Testnet · USDC · Sub-second finality
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>About this demo</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
          This page simulates how any merchant — hotel, boutique, freelancer, e-commerce, charity —
          can embed a "Pay with USDC" button in their existing checkout flow.
          <br /><br />
          Clicking the button shows both options:
          <strong style={{ color: 'var(--text)' }}> QR code</strong> for in-person physical checkout
          (merchant shows on tablet, customer scans with phone) and
          <strong style={{ color: 'var(--text)' }}> direct payment link</strong> for online checkout
          (customer pays in browser without switching device).
          <br /><br />
          Every payment generates a verifiable on-chain Payment Receipt via ArcPay.
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-blue">Physical checkout</span>
          <span className="badge badge-green">Online checkout</span>
          <span className="badge badge-gray">Arc Testnet</span>
          <span className="badge badge-yellow">TESTNET ONLY</span>
        </div>
      </div>
    </div>
  )
}
