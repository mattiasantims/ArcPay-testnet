import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="fade-up" style={{ textAlign: 'center', padding: '80px 24px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
      <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, marginBottom: 8 }}>Page not found</h1>
      <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 32, lineHeight: 1.6 }}>
        This page doesn't exist. If you were expecting a receipt or payment page, it may have expired or the link may be incorrect.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/"><button className="btn-primary" style={{ padding: '10px 24px' }}>🏠 Home</button></Link>
        <Link to="/dashboard"><button className="btn-ghost" style={{ padding: '10px 24px' }}>📊 Dashboard</button></Link>
        <Link to="/my-payments"><button className="btn-ghost" style={{ padding: '10px 24px' }}>💳 My Payments</button></Link>
      </div>
    </div>
  )
}
