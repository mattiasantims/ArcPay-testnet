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
          Move USDC on Arc.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 560, margin: '0 auto', lineHeight: 1.65 }}>
          Accept customer payments, manage real merchant flows and send supplier or team payouts from one non-custodial workspace.
        </p>
      </div>

      {/* Merchant flows */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 25, marginBottom: 10 }}>🔗</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Online Payments</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Create hosted checkout links for instant USDC payments linked to order or invoice references.
          </div>
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ width: '100%', padding: '10px' }}>Create link →</button>
          </Link>
        </div>

        <div className="card" style={{ padding: 22, background: 'linear-gradient(135deg, #0f1219 0%, #0d0a1a 100%)', border: '1px solid #2e1f55', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 25, marginBottom: 10 }}>💎</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#a78bfa' }}>Luxury Retail</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Use QR-based stablecoin checkout for premium, dealer or high-value in-person payments.
          </div>
          <Link to="/luxury" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Open checkout →
            </button>
          </Link>
        </div>

        <div className="card" style={{ padding: 22, background: 'linear-gradient(135deg, #0f1219 0%, #071a0f 100%)', border: `1px solid ${bookingConfigured ? 'var(--green-bdr)' : 'var(--border)'}`, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 25, marginBottom: 10 }}>🏨</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: bookingConfigured ? 'var(--green)' : 'var(--text2)' }}>Hotel Booking</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Collect booking deposits with non-refundable amounts, refundable escrow and release history.
          </div>
          <Link to="/booking" style={{ textDecoration: 'none' }}>
            <button className={bookingConfigured ? 'btn-green' : 'btn-ghost'} style={{ width: '100%', padding: '10px' }}>
              Open booking →
            </button>
          </Link>
        </div>

        <div className="card" style={{ padding: 22, background: 'linear-gradient(135deg, #0f1219 0%, #0a0f1a 100%)', border: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 25, marginBottom: 10 }}>✈️</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#60a5fa' }}>Travel Agency</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Offer full payment or staged travel payment options with customer-visible terms.
          </div>
          <Link to="/travel" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#0a1628', border: '1px solid #1e3a5f', color: '#60a5fa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Open travel →
            </button>
          </Link>
        </div>

        <div className="card" style={{ padding: 22, background: 'linear-gradient(135deg, #0f1219 0%, #1a1200 100%)', border: '1px solid #f6851b44', display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 25, marginBottom: 10 }}>📤</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#fbbf24' }}>Merchant Payouts</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 16 }}>
            Send USDC to suppliers, contractors or team wallets, individually or in batch.
          </div>
          <Link to="/payouts" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#201400', border: '1px solid #f6851b66', color: '#fbbf24', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              Send payouts →
            </button>
          </Link>
        </div>
      </div>

      {/* Operating layer */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Merchant operating layer
          </div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 22, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.5px' }}>
            From checkout to payout, with on-chain proof.
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 16 }}>
            ArcPay links incoming payments and outbound payouts to business references such as orders, bookings, invoices and payout batches. Each supported flow can generate receipts, CSV records and ArcScan-verifiable transaction evidence.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { icon: '🏷️', label: 'Payment refs' },
              { icon: '🧾', label: 'PDF receipts' },
              { icon: '📄', label: 'CSV exports' },
              { icon: '🔎', label: 'ArcScan proof' },
            ].map(item => (
              <div key={item.label} style={{ padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 18, marginBottom: 5 }}>{item.icon}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>
            Non-custodial by design
          </div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 20, color: 'var(--text)', marginBottom: 10, letterSpacing: '-0.4px' }}>
            Your keys. Your assets. Your payments.
          </div>
          <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
            ArcPay does not custody merchant or customer funds. Users connect their own wallets, approve their own transactions and keep control of their assets.
          </p>
          <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            Testnet MVP only. Not a bank, payroll processor or regulated payment service.
          </div>
        </div>
      </div>

      {/* Tools */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📈</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 7 }}>Analytics</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 14 }}>
            Monitor payment channels, booking activity, travel flows and merchant payout activity from one dashboard.
          </div>
          <Link to="/analytics" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '9px', fontSize: 12 }}>Open analytics →</button>
          </Link>
        </div>

        <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🏪</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 7 }}>Merchant Profile</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 14 }}>
            Register a self-declared on-chain merchant profile, link wallets and publish customer-visible payment policies.
          </div>
          <Link to="/merchant-profile" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '9px', fontSize: 12 }}>Open profile →</button>
          </Link>
        </div>
      </div>

      {WANT_TO_TEST}
    </div>
  )
}
