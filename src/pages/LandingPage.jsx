import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { readContract } from '@wagmi/core'
import { wagmiConfig } from '../walletConfig.js'
import { ARCPROOF_ADDRESS, ARCBOOKING_ADDRESS, ARCTRAVEL_ESCROW_ADDRESS } from '../config.js'
import ArcProofABI from '../abis/ArcProof.json'
import ArcBookingEscrowABI from '../abis/ArcBookingEscrow.json'
import ArcTravelEscrowABI from '../abis/ArcTravelEscrow.json'

async function fetchGlobalStats() {
  try {
    const [proofs, bookings, travels] = await Promise.all([
      readContract(wagmiConfig, { address: ARCPROOF_ADDRESS, abi: ArcProofABI, functionName: 'totalProofs' }).catch(() => 0n),
      readContract(wagmiConfig, { address: ARCBOOKING_ADDRESS, abi: ArcBookingEscrowABI, functionName: 'totalBookings' }).catch(() => 0n),
      readContract(wagmiConfig, { address: ARCTRAVEL_ESCROW_ADDRESS, abi: ArcTravelEscrowABI, functionName: 'totalTravelBookings' }).catch(() => 0n),
    ])
    return {
      proofs: Number(proofs),
      bookings: Number(bookings),
      travels: Number(travels),
      total: Number(proofs) + Number(bookings) + Number(travels),
    }
  } catch { return { proofs: 0, bookings: 0, travels: 0, total: 0 } }
}

export default function LandingPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    fetchGlobalStats().then(setStats)
  }, [])

  return (
    <div className="fade-up">

      {/* Hero */}
      <div style={{ padding: '48px 0 36px', textAlign: 'center' }}>
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
          fontFamily: 'var(--display)', fontSize: 44, fontWeight: 800,
          color: 'var(--text)', lineHeight: 1.1, letterSpacing: '-1.5px', marginBottom: 16,
        }}>
          Accept USDC on Arc.<br />
          <span style={{ color: 'var(--usdc)' }}>Instant on-chain payments.</span>
        </h1>
        <p style={{ fontSize: 15, color: 'var(--text2)', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.7 }}>
          ArcPay is an open payment infrastructure on Arc Network. Instant USDC payments, 
          programmable escrow, on-chain receipts — no backend, no intermediary, no custody.
        </p>

        {/* CTA buttons */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/merchant')}
            className="btn-primary"
            style={{ padding: '13px 28px', fontSize: 14, fontWeight: 700 }}
          >
            🏪 I'm a Merchant
          </button>
          <button
            onClick={() => navigate('/customer')}
            className="btn-ghost"
            style={{ padding: '13px 28px', fontSize: 14, fontWeight: 600 }}
          >
            💳 I'm a Customer
          </button>
        </div>
      </div>

      {/* What is ArcPay */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          What is ArcPay
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
              ArcPay is a <strong style={{ color: 'var(--text)' }}>payment primitive</strong> built on Arc Network — 
              a stablecoin-native L1 where gas is paid in USDC. No volatile tokens, no bridges, no complexity.
            </p>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7 }}>
              Every payment creates an <strong style={{ color: 'var(--text)' }}>immutable on-chain receipt</strong> in the same transaction — 
              verifiable by anyone, forever.
            </p>
          </div>
          <div>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 12 }}>
              Beyond simple payments, ArcPay offers <strong style={{ color: 'var(--text)' }}>programmable escrow</strong> for 
              hotel deposits and travel bookings — with automatic refund rules enforced by smart contracts.
            </p>
            <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7 }}>
              All contracts are open, unaudited testnet prototypes. <strong style={{ color: 'var(--yellow)' }}>TESTNET ONLY.</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Smart Contracts */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Smart Contracts — Arc Testnet
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {[
            { name: 'ArcProof', addr: ARCPROOF_ADDRESS, desc: 'Instant payment + on-chain receipt' },
            { name: 'ArcBookingEscrow', addr: ARCBOOKING_ADDRESS, desc: 'Hotel deposit with refund rules' },
            { name: 'ArcTravelEscrow', addr: ARCTRAVEL_ESCROW_ADDRESS, desc: 'Scheduled travel payment milestones' },
            { name: 'ArcMerchantRegistry', addr: '0xaDDde5C9866C1BF870B393379fFdCF1Ef7f9Fb49', desc: 'On-chain merchant identity' },
          ].map(c => (
            <div key={c.name} style={{ padding: '12px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--usdc)', marginBottom: 4 }}>{c.name}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>{c.addr}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{c.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Testnet Analytics */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          Testnet Activity
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total transactions', value: stats ? stats.total.toString() : '—', color: 'var(--usdc)' },
            { label: 'Online payments', value: stats ? stats.proofs.toString() : '—', color: 'var(--text)' },
            { label: 'Hotel bookings', value: stats ? stats.bookings.toString() : '—', color: 'var(--green)' },
            { label: 'Travel bookings', value: stats ? stats.travels.toString() : '—', color: '#60a5fa' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '16px 8px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: s.color, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Who uses + Why Arc */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 20 }}>
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
              { icon: '✈️', title: 'Travel',       desc: 'Scheduled milestone payments' },
            ].map(u => (
              <div key={u.title} style={{ padding: '12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{u.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 3 }}>{u.title}</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 }}>{u.desc}</div>
              </div>
            ))}
          </div>
        </div>

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

      {/* Coming soon */}
      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
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

      {/* Want to test */}
      <div className="card" style={{ padding: 28, marginBottom: 20, border: '1px solid #f6851b44', background: '#f6851b08' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#f6851b', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 16 }}>
          🦊 Want to test ArcPay?
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>1. Install MetaMask</div>
            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
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
              Visit the Arc testnet faucet to get free test USDC for transactions.
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
