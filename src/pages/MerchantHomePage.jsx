import { Link } from 'react-router-dom'
import { isBookingContractConfigured } from '../config.js'

const WANT_TO_TEST = (
  <div className="card" style={{ padding: 28, marginTop: 20, border: '1px solid #f6851b44', background: '#f6851b08' }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: '#f6851b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
      🦊 Want to test ArcPay?
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>1. Install MetaMask</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          Download MetaMask from <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--usdc)' }}>metamask.io</a> for desktop or mobile.
        </p>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>2. Add Arc Testnet</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.8, fontFamily: 'var(--mono)', background: 'var(--surface2)', padding: '8px 12px', borderRadius: 8 }}>
          Network: Arc Testnet<br />
          RPC: rpc.testnet.arc.network<br />
          Chain ID: 5042002<br />
          Symbol: USDC<br />
          Explorer: testnet.arcscan.app
        </div>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>3. Get test USDC</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
          Visit the Arc testnet faucet to get free test USDC.
        </p>
        <a href="https://faucet.arc.network" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>Open faucet ↗</button>
        </a>
      </div>
    </div>
  </div>
)

export default function MerchantHomePage() {
  const bookingConfigured = isBookingContractConfigured()

  return (
    <div className="fade-up">

      {/* Hero */}
      <div style={{ padding: '36px 0 28px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 38, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-1.5px', marginBottom: 12 }}>
          Accept USDC on Arc.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 480, margin: '0 auto', lineHeight: 1.65 }}>
          Choose a payment flow to get started. Each generates a shareable link or QR code your customers can pay instantly.
        </p>
      </div>

      {/* 4 use cases */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>🔗</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Online Payments</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Create a payment link in seconds. Share via WhatsApp, email or website. Customer pays USDC in one click.
          </div>
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ width: '100%', padding: '10px' }}>Create payment link →</button>
          </Link>
        </div>

        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #0d0a1a 100%)', border: '1px solid #2e1f55', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>💎</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#a78bfa' }}>Luxury Retail</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Show a QR at the till — customer scans and pays in seconds. Instant receipt.
          </div>
          <Link to="/luxury" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Open luxury checkout →
            </button>
          </Link>
        </div>

        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #071a0f 100%)', border: `1px solid ${bookingConfigured ? 'var(--green-bdr)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>🏨</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: bookingConfigured ? 'var(--green)' : 'var(--text2)' }}>Hotel Booking</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Non-refundable portion goes straight to the hotel, refundable stays in escrow until the cancellation deadline.
          </div>
          <Link to="/booking" style={{ textDecoration: 'none' }}>
            <button className={bookingConfigured ? 'btn-green' : 'btn-ghost'} style={{ width: '100%', padding: '10px' }}>
              Open booking deposit →
            </button>
          </Link>
        </div>

        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #0a0f1a 100%)', border: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>✈️</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#60a5fa' }}>Travel Agency</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Schedule high-value travel payments across two milestones. Initial deposit today, scheduled tranche later.
          </div>
          <Link to="/travel" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#0a1628', border: '1px solid #1e3a5f', color: '#60a5fa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Open travel booking →
            </button>
          </Link>
        </div>
      </div>

      {/* Reports / Dashboard / Profile */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📊</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Payments Dashboard</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 'auto', paddingBottom: 12 }}>View all received payments, export CSV, download PDF receipts.</div>
          <Link to="/dashboard" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '8px', fontSize: 12 }}>Open dashboard →</button>
          </Link>
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📈</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Analytics</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 'auto', paddingBottom: 12 }}>Live on-chain analytics across all payment channels. Ask ArcPay AI.</div>
          <Link to="/analytics" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '8px', fontSize: 12 }}>Open analytics →</button>
          </Link>
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🏪</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Merchant Profile</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 'auto', paddingBottom: 12 }}>Register your on-chain profile. Link multiple wallets to one merchant entity.</div>
          <Link to="/merchant-profile" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '8px', fontSize: 12 }}>Open profile →</button>
          </Link>
        </div>
      </div>

      {WANT_TO_TEST}
    </div>
  )
}
