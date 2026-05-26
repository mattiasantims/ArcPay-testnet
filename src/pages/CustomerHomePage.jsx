import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'

const WANT_TO_TEST = (
  <div className="card" style={{ padding: 28, border: '1px solid #f6851b44', background: '#f6851b08' }}>
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
        <div style={{ fontSize: 12, color: 'var(--text2a)', lineHeight: 1.8, fontFamily: 'var(--mono)', background: 'var(--surface2)', padding: '8px 12px', borderRadius: 8 }}>
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
        <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>Open faucet ↗</button>
        </a>
      </div>
    </div>
  </div>
)

export default function CustomerHomePage() {
  const { isConnected } = useAccount()
  const { open } = useWeb3Modal()

  return (
    <div className="fade-up">

      {/* Hero */}
      <div style={{ padding: '36px 0 28px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--usdc)', background: '#2775ca11', border: '1px solid #2775ca33', borderRadius: 20, padding: '4px 14px', marginBottom: 16, letterSpacing: '0.02em' }}>
          💳 Customer & Counterparty Portal
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-1px', marginBottom: 12 }}>
          Verify your USDC activity on Arc.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 560, margin: '0 auto 24px', lineHeight: 1.65 }}>
          Access payments, booking receipts, travel flows and merchant payouts linked to your wallet. Download records, check transaction hashes and verify everything on ArcScan.
        </p>
        {!isConnected && (
          <button onClick={() => open()} className="btn-primary" style={{ padding: '11px 28px', fontSize: 14 }}>
            Connect Wallet
          </button>
        )}
      </div>

      {/* Customer and counterparty records */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>💳</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8 }}>My Payments</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 18 }}>
            View USDC payments you have sent to merchants. Download PDF receipts or export records to CSV.
          </div>
          <Link to="/my-payments" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ width: '100%', padding: '10px' }}>View my payments →</button>
          </Link>
        </div>

        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #071a0f 100%)', border: '1px solid var(--green-bdr)', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>🏨</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: 'var(--green)' }}>My Bookings</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 18 }}>
            Track hotel booking deposits, refundable escrow status, cancellation deadlines and release events.
          </div>
          <Link to="/my-bookings" style={{ textDecoration: 'none' }}>
            <button className="btn-green" style={{ width: '100%', padding: '10px' }}>View my bookings →</button>
          </Link>
        </div>

        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #0a0f1a 100%)', border: '1px solid #1e3a5f', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>✈️</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#60a5fa' }}>My Travel</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 18 }}>
            Review travel reservations, scheduled tranche dates, payment status and downloadable receipts.
          </div>
          <Link to="/my-travel" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#0a1628', border: '1px solid #1e3a5f', color: '#60a5fa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              View my travel →
            </button>
          </Link>
        </div>

        <div className="card" style={{ padding: 24, background: 'linear-gradient(135deg, #0f1219 0%, #181107 100%)', border: '1px solid #f59e0b44', display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{ fontSize: 30, marginBottom: 12 }}>📤</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#fbbf24' }}>My Received Payouts</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 18 }}>
            View USDC payouts received from merchants, suppliers or teams with payment references and ArcScan proof.
          </div>
          <Link to="/my-payouts" style={{ textDecoration: 'none' }}>
            <button style={{ width: '100%', padding: '10px', background: '#1c1306', border: '1px solid #f59e0b66', color: '#fbbf24', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
              View my payouts →
            </button>
          </Link>
        </div>
      </div>

      {/* Proof and records */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🔎</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Verify on ArcScan</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            Every supported payment flow links to a transaction hash that can be checked directly on ArcScan.
          </div>
        </div>

        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🧾</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Download receipts</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            Keep receipt-style records with payment references, descriptions, amounts, wallets and network details.
          </div>
        </div>

        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>📄</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Export records</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
            Export CSV records for your own reconciliation, accounting or operational follow-up.
          </div>
        </div>
      </div>

      {WANT_TO_TEST}
    </div>
  )
}
