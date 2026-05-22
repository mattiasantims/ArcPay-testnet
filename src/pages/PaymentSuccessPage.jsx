export default function PaymentSuccessPage() {
  return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
      <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, marginBottom: 8 }}>
        Payment Successful
      </h1>
      <p style={{ color: 'var(--text2)', fontSize: 14 }}>
        Your USDC payment on Arc Testnet has been confirmed on-chain.
      </p>
    </div>
  )
}
