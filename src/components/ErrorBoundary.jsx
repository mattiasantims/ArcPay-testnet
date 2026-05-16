import { Component } from 'react'
import { ARCSCAN_BASE } from '../config.js'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('ArcPay ErrorBoundary:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const txHash = new URLSearchParams(window.location.search).get('txHash')

    return (
      <div style={{ textAlign: 'center', padding: '60px 24px', maxWidth: 520, margin: '0 auto' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, marginBottom: 8, color: 'var(--yellow)' }}>
          Something went wrong
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 8, lineHeight: 1.6 }}>
          Something went wrong in the interface. Your transaction may still have succeeded.
        </p>
        <p style={{ color: 'var(--text3)', fontSize: 13, marginBottom: 28 }}>
          Check ArcScan or go back to your dashboard to verify.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <a href="/"><button className="btn-primary" style={{ padding: '10px 20px' }}>🏠 Home</button></a>
          <a href="/dashboard"><button className="btn-ghost" style={{ padding: '10px 20px' }}>📊 Dashboard</button></a>
        </div>
        {txHash && (
          <a
            href={`${ARCSCAN_BASE}/tx/${txHash}`}
            target="_blank" rel="noopener noreferrer"
            style={{ fontSize: 12, color: 'var(--usdc)' }}
          >
            View transaction on ArcScan ↗
          </a>
        )}
        {process.env.NODE_ENV !== 'production' && (
          <details style={{ marginTop: 20, textAlign: 'left', fontSize: 11, color: 'var(--text3)' }}>
            <summary>Error details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', marginTop: 8 }}>
              {this.state.error?.toString()}
            </pre>
          </details>
        )}
      </div>
    )
  }
}
