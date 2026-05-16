import { Link } from 'react-router-dom'
import { isBookingContractConfigured } from '../config.js'

export default function HomePage({ account, onConnect, connecting }) {
  const bookingConfigured = isBookingContractConfigured()

  return (
    <div className="fade-up">

      {/* Hero — compact, horizontal-friendly */}
      <div style={{ padding: '40px 0 32px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--usdc)',
          background: '#2775ca11', border: '1px solid #2775ca33',
          borderRadius: 20, padding: '4px 14px', marginBottom: 20,
          letterSpacing: '0.02em',
        }}>
          ◆ Arc Testnet · USDC Payments · Chain ID 5042002
        </div>
        <h1 style={{
          fontFamily: 'var(--display)', fontSize: 42, fontWeight: 800,
          color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-1.5px', marginBottom: 14,
        }}>
          Accept USDC on Arc.<br />
          <span style={{ color: 'var(--usdc)' }}>Instant on-chain payments.</span>
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text2)', maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.65 }}>
          Instant USDC payments with on-chain receipts, programmable booking escrow, and merchant analytics — all in one.
        </p>
      </div>

      {/* Four main cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>

        {/* Online Payments */}
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>🔗</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            Online Payments
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Create a payment link in seconds. Share it via WhatsApp, email or your website.
            Customer pays USDC in one click — you receive it instantly with an on-chain receipt.
          </div>
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ width: '100%', padding: '10px' }}>
              Create payment link →
            </button>
          </Link>
        </div>

        {/* Luxury Retail */}
        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #0d0a1a 100%)', border: '1px solid #2e1f55', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>💎</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#a78bfa' }}>
            Luxury Retail Checkout
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Premium USDC checkout for boutiques, luxury retail and temporary shops.
            Show a QR at the till — customer scans and pays in seconds, receipt instant.
          </div>
          <Link to="/luxury" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Open luxury checkout →
            </button>
          </Link>
        </div>

        {/* Hotel Booking */}
        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #071a0f 100%)', border: `1px solid ${bookingConfigured ? 'var(--green-bdr)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>🏨</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: bookingConfigured ? 'var(--green)' : 'var(--text2)' }}>
            Hotel Booking Deposit
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
            Guest pays the deposit — non-refundable portion goes straight to the hotel,
            refundable portion stays in escrow until the cancellation deadline.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 'auto', paddingBottom: 16 }}>
            ERC-8183-inspired conditional payment lifecycle
          </div>
          {bookingConfigured ? (
            <Link to="/booking" style={{ textDecoration: 'none' }}>
              <button className="btn-green" style={{ width: '100%', padding: '10px' }}>
                Open booking deposit →
              </button>
            </Link>
          ) : (
            <div>
              <div style={{ fontSize: 11, color: 'var(--yellow)', marginBottom: 8, padding: '6px 8px', background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 6 }}>
                ⚠️ Deploy ArcBookingEscrow.sol to activate
              </div>
              <Link to="/booking" style={{ textDecoration: 'none' }}>
                <button className="btn-ghost" style={{ width: '100%', padding: '10px', fontSize: 12 }}>
                  View setup instructions →
                </button>
              </Link>
            </div>
          )}
        </div>
        {/* Travel Agency */}
        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #0a0f1a 100%)', border: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>✈️</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#60a5fa' }}>
            Travel Agency
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
            Schedule high-value travel payments across two milestones. Customer pays an initial deposit today and one future tranche on the agreed date.
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 'auto', paddingBottom: 16 }}>
            Scheduled payment milestone · Escrow protected
          </div>
          <Link to="/travel" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#0a1628', border: '1px solid #1e3a5f', color: '#60a5fa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Open travel booking →
            </button>
          </Link>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>🏪</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            Merchant Profile
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Register a self-declared public merchant profile on-chain. Link multiple wallets to the same merchant entity for pre-filled checkout flows.
          </div>
          <Link to="/merchant-profile" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '10px' }}>
              Open merchant profile →
            </button>
          </Link>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 26, marginBottom: 10 }}>📈</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>
            Merchant Analytics
          </div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Live on-chain analytics across all payment channels. Volume, escrow status, booking deadlines, and Ask ArcPay AI — updated on demand.
          </div>
          <Link to="/analytics" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '10px' }}>
              Open analytics →
            </button>
          </Link>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 24 }}>

        {/* Who uses */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            Who uses ArcPay
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { icon: '🏨', title: 'Hotels',       desc: 'Booking deposits with smart refund rules' },
              { icon: '👗', title: 'Boutiques',    desc: 'QR at the till, paid in seconds' },
              { icon: '💼', title: 'Freelancers',  desc: 'Invoice link via WhatsApp or email' },
              { icon: '❤️', title: 'Charities',    desc: 'Donations with on-chain proof' },
              { icon: '🏢', title: 'B2B',          desc: 'Invoice payments with auto receipt' },
              { icon: '🌐', title: 'Online sellers', desc: 'Payment link anywhere on the web' },
            ].map(u => (
              <div key={u.title} style={{ padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{u.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{u.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>{u.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Why Arc */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
            Why Arc
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { icon: '◈', title: 'USDC gas',     desc: 'Fees paid in USDC — no volatile gas token' },
              { icon: '⚡', title: 'Sub-second',   desc: 'Receipt immutable in under 1 second' },
              { icon: '🔗', title: 'Atomic proof', desc: 'Payment and receipt in same transaction' },
              { icon: '◇', title: 'Circle-backed', desc: "Built on Circle's stablecoin-native L1" },
            ].map(f => (
              <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 16, color: 'var(--usdc)', flexShrink: 0, marginTop: 1 }}>{f.icon}</div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{f.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Roadmap */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
          Roadmap — Coming Soon
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { icon: '🔧', label: 'Freelance Service Escrow' },
            { icon: '📦', label: 'Marketplace Delivery Escrow' },
            { icon: '🎯', label: 'Donations / Milestone Funding' },
            { icon: '💶', label: 'EURC / Multi-stablecoin' },
            { icon: '🤖', label: 'x402 / API Payments' },
            { icon: '⚡', label: 'ERC-8183 Work Payments' },
          ].map(r => (
            <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, opacity: 0.55 }}>
              <span style={{ fontSize: 14 }}>{r.icon}</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
