import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readContract } from '@wagmi/core'
import { wagmiConfig } from '../walletConfig.js'
import {
  ARCPROOF_ADDRESS,
  ARCBOOKING_ADDRESS,
  ARCTRAVEL_ESCROW_ADDRESS,
  ARC_MERCHANT_PAYOUTS_ADDRESS,
  isMerchantPayoutsConfigured,
} from '../config.js'
import ArcProofABI from '../abis/ArcProof.json'
import ArcBookingEscrowABI from '../abis/ArcBookingEscrow.json'
import ArcTravelEscrowABI from '../abis/ArcTravelEscrow.json'
import ArcMerchantPayoutsABI from '../abis/ArcMerchantPayouts.json'

async function fetchGlobalStats() {
  try {
    const [proofs, bookings, travels, payouts] = await Promise.all([
      readContract(wagmiConfig, {
        address: ARCPROOF_ADDRESS,
        abi: ArcProofABI,
        functionName: 'totalProofs',
      }).catch(() => 0n),
      readContract(wagmiConfig, {
        address: ARCBOOKING_ADDRESS,
        abi: ArcBookingEscrowABI,
        functionName: 'totalBookings',
      }).catch(() => 0n),
      readContract(wagmiConfig, {
        address: ARCTRAVEL_ESCROW_ADDRESS,
        abi: ArcTravelEscrowABI,
        functionName: 'totalTravelBookings',
      }).catch(() => 0n),
      isMerchantPayoutsConfigured()
        ? readContract(wagmiConfig, {
            address: ARC_MERCHANT_PAYOUTS_ADDRESS,
            abi: ArcMerchantPayoutsABI,
            functionName: 'totalPayouts',
          }).catch(() => 0n)
        : Promise.resolve(0n),
    ])

    return {
      proofs: Number(proofs),
      bookings: Number(bookings),
      travels: Number(travels),
      payouts: Number(payouts),
      total: Number(proofs) + Number(bookings) + Number(travels) + Number(payouts),
    }
  } catch {
    return { proofs: 0, bookings: 0, travels: 0, payouts: 0, total: 0 }
  }
}

const smallCaps = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text3)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 16,
}

function SectionTitle({ eyebrow, title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={smallCaps}>{eyebrow}</div>
      <div style={{
        fontFamily: 'var(--display)',
        fontSize: 24,
        fontWeight: 800,
        color: 'var(--text)',
        letterSpacing: '-0.5px',
        marginBottom: children ? 8 : 0,
      }}>
        {title}
      </div>
      {children && (
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, margin: 0, maxWidth: 840 }}>
          {children}
        </p>
      )}
    </div>
  )
}

function MiniCard({ icon, title, desc, accent = 'var(--usdc)' }) {
  return (
    <div className="card" style={{ padding: 22, display: 'flex', flexDirection: 'column', minHeight: 154 }}>
      <div style={{ fontSize: 24, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, marginBottom: 8, color: accent }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
        {desc}
      </div>
    </div>
  )
}

function Chip({ children }) {
  return (
    <div style={{
      padding: '8px 11px',
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 999,
      fontSize: 12,
      color: 'var(--text2)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </div>
  )
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
      <div style={{ padding: '48px 0 38px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--usdc)',
          background: '#2775ca11', border: '1px solid #2775ca33',
          borderRadius: 20, padding: '4px 14px', marginBottom: 20,
          letterSpacing: '0.02em',
        }}>
          ◆ Arc Testnet · USDC Movement · Chain ID 5042002
        </div>

        <h1 style={{
          fontFamily: 'var(--display)', fontSize: 46, fontWeight: 800,
          color: 'var(--text)', lineHeight: 1.08, letterSpacing: '-1.6px', marginBottom: 16,
        }}>
          Move USDC on Arc.<br />
          <span style={{ color: 'var(--usdc)' }}>Accept payments. Send payouts.</span><br />
          Keep verifiable records.
        </h1>

        <p style={{ fontSize: 15, color: 'var(--text2)', maxWidth: 720, margin: '0 auto 30px', lineHeight: 1.75 }}>
          ArcPay is a lightweight, non-custodial stablecoin payment gateway and merchant operating layer built on Arc.
          Merchants can accept USDC payments, send supplier or team payouts, and keep on-chain payment proof linked to
          off-chain business records.
        </p>

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
            👤 I'm a Counterparty
          </button>
        </div>
      </div>

      {/* Why stablecoins */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <SectionTitle eyebrow="Why stablecoins" title="Stablecoins can make blockchain payments practical for merchants">
          Faster settlement, lower volatility than crypto-native assets, transparent transaction verification and direct wallet-to-wallet execution.
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <MiniCard icon="💵" title="Lower volatility" desc="USDC reduces the volatility problem that makes many crypto-assets difficult to use for merchant payments." />
          <MiniCard icon="🌍" title="Global by design" desc="Stablecoin payments can support digital, physical and cross-border commerce without fragmented payment flows." />
          <MiniCard icon="🔎" title="Verifiable settlement" desc="Every transaction can be checked on-chain and linked to a business reference, receipt or internal record." />
        </div>
      </div>

      {/* Why Arc */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <SectionTitle eyebrow="Why Arc" title="Built for a stablecoin-native payment environment">
          ArcPay uses Arc Testnet to explore how payment-focused blockchain infrastructure can support real-world stablecoin commerce.
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          <MiniCard icon="◈" title="USDC-first experience" desc="ArcPay is designed around stablecoin payments, not speculative crypto checkout." />
          <MiniCard icon="⚡" title="Payment-focused flows" desc="Test checkout, deposits, travel payments and merchant payouts in a web-based Arc environment." />
          <MiniCard icon="🔗" title="Transparent verification" desc="Merchants, customers and counterparties can use transaction hashes, receipts and ArcScan links." />
        </div>
      </div>

      {/* Merchant workspace */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <SectionTitle eyebrow="Merchant workspace" title="One place to move USDC across real merchant flows">
          ArcPay is not only about accepting payments. It helps merchants move USDC across checkout, high-value retail, bookings, travel payments and outbound payouts.
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
          {[
            { icon: '🔗', title: 'Online checkout', desc: 'Hosted payment links for instant USDC payments.', to: '/create' },
            { icon: '💎', title: 'High-value retail', desc: 'QR-based flows for premium or in-person payments.', to: '/luxury' },
            { icon: '🏨', title: 'Hotel deposits', desc: 'Deposit, refund and escrow release event history.', to: '/booking' },
            { icon: '✈️', title: 'Travel flows', desc: 'Full payment or staged payment options.', to: '/travel' },
            { icon: '📤', title: 'Merchant payouts', desc: 'Send USDC to suppliers, contractors or team wallets.', to: '/payouts' },
          ].map(item => (
            <div key={item.title} style={{ padding: '16px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', minHeight: 184 }}>
              <div style={{ fontSize: 24, marginBottom: 10 }}>{item.icon}</div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 7 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 'auto' }}>{item.desc}</div>
              <button onClick={() => navigate(item.to)} className="btn-ghost" style={{ width: '100%', padding: '8px', fontSize: 12, marginTop: 14 }}>
                Open →
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Records */}
      <div className="card" style={{ padding: 28, marginBottom: 20, background: 'linear-gradient(135deg, #0f1219 0%, #07131f 100%)' }}>
        <SectionTitle eyebrow="Business records" title="More than payment execution: proof, refs and reconciliation">
          A merchant payment is useful only if it can be reconciled. ArcPay links each payment or payout to a business reference such as an order ID, booking reference, invoice number or payout reference.
        </SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { icon: '🏷️', title: 'Payment reference', desc: 'Connect on-chain transactions to orders, invoices, bookings or payout batches.' },
            { icon: '⛓️', title: 'On-chain proof', desc: 'Each supported flow generates transaction evidence that can be verified through ArcScan.' },
            { icon: '📄', title: 'PDF receipts', desc: 'Download receipt-style records for customers, merchants and counterparties.' },
            { icon: '📊', title: 'CSV exports', desc: 'Export structured records for finance, accounting or operational reconciliation.' },
          ].map(item => (
            <div key={item.title} style={{ padding: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Non-custodial + profile */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 28 }}>
          <div style={smallCaps}>Non-custodial by design</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
            Your keys. Your assets. Your payments.
          </div>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
            ArcPay does not custody merchant or customer funds. Users connect their own wallets, approve their own transactions and keep control of their assets.
          </p>
          <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, margin: 0 }}>
            Testnet MVP only. ArcPay does not provide regulated payment, banking, payroll or safeguarding services.
          </p>
        </div>

        <div className="card" style={{ padding: 28 }}>
          <div style={smallCaps}>Merchant layer</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 10 }}>
            Profile today. Reputation signals tomorrow.
          </div>
          <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 14 }}>
            ArcPay includes an on-chain merchant profile and public policy layer. Future versions may introduce privacy-preserving reputation badges based on activity and enabled modules.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip>Registered profile</Chip>
            <Chip>Receipt-enabled</Chip>
            <Chip>Booking escrow</Chip>
            <Chip>Scheduled payments</Chip>
            <Chip>Merchant payouts</Chip>
            <Chip>Policy published</Chip>
          </div>
        </div>
      </div>

      {/* Testnet Analytics */}
      <div className="card" style={{ padding: 28, marginBottom: 20 }}>
        <div style={smallCaps}>ArcPay Testnet Activity</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Total transactions', value: stats ? stats.total.toString() : '—', color: 'var(--usdc)' },
            { label: 'Incoming payments', value: stats ? stats.proofs.toString() : '—', color: 'var(--text)' },
            { label: 'Booking & travel flows', value: stats ? (stats.bookings + stats.travels).toString() : '—', color: 'var(--green)' },
            { label: 'Merchant payouts', value: stats ? stats.payouts.toString() : '—', color: '#60a5fa' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '16px 8px', background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: s.color, marginBottom: 6 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Roadmap */}
      <div className="card" style={{ padding: 24, marginBottom: 20 }}>
        <div style={smallCaps}>Roadmap — from web app to merchant infrastructure</div>
        <p style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, margin: '0 0 16px' }}>
          ArcPay is currently a web-based testnet MVP. The roadmap expands toward merchant APIs, webhooks, e-commerce plugins, accounting exports, EURC support and AI-assisted analytics.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            'Checkout APIs', 'Signed webhooks', 'Shopify / WooCommerce plugins', 'POS and PMS integrations',
            'ERP / accounting exports', 'EURC support', 'AI merchant analytics', 'Privacy-preserving reputation',
          ].map(item => <Chip key={item}>{item}</Chip>)}
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
            <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>Open faucet ↗</button>
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}
