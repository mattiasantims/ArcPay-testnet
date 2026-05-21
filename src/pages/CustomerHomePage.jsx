import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'

export default function CustomerHomePage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()

  return (
    <div className="fade-up">

      {/* Hero */}
      <div style={{ padding: '36px 0 28px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--usdc)', background: '#2775ca11', border: '1px solid #2775ca33', borderRadius: 20, padding: '4px 14px', marginBottom: 16, letterSpacing: '0.02em' }}>
          💳 Customer Portal
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-1px', marginBottom: 12 }}>
          Your payments on Arc.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', maxWidth: 440, margin: '0 auto 24px', lineHeight: 1.65 }}>
          View your payment history, hotel bookings and travel reservations. Connect your wallet to get started.
        </p>
        {!isConnected && (
          <button onClick={() => open()} className="btn-primary" style={{ padding: '11px 28px', fontSize: 14 }}>
            Connect Wallet
          </button>
        )}
      </div>

      {/* 3 report cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>💳</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>My Payments</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 20 }}>
            View all USDC payments you have sent. Download receipts as PDF or export to CSV.
          </div>
          <Link to="/my-payments" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ width: '100%', padding: '10px' }}>View my payments →</button>
          </Link>
        </div>

        <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏨</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>My Bookings</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 20 }}>
            View your hotel bookings, check escrow status, cancel before the deadline if needed.
          </div>
          <Link to="/my-bookings" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '10px' }}>View my bookings →</button>
          </Link>
        </div>

        <div className="card" style={{ padding: 28, display: 'flex', flexDirection: 'column', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>✈️</div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>My Travel</div>
          <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 'auto', paddingBottom: 20 }}>
            View your travel bookings, check tranche due dates, pay scheduled tranches on time.
          </div>
          <Link to="/my-travel" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ width: '100%', padding: '10px' }}>View my travel →</button>
          </Link>
        </div>
      </div>

      {/* Want to test */}
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

    </div>
  )
}
