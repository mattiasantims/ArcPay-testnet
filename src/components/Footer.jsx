export default function Footer() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)', padding: '20px', textAlign: 'center' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <p style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          ArcPay v0.1 · Built on{' '}
          <a href="https://arc.network" target="_blank" rel="noopener noreferrer">Arc Network</a>
          {' '}Testnet · Powered by Circle USDC ·{' '}
          <a href="https://github.com/mattiasantims/arcproof-testnet" target="_blank" rel="noopener noreferrer">GitHub</a>
        </p>
        <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
          TESTNET ONLY · No custody · Self-declared merchant data · Not a regulated payment service
        </p>
      </div>
    </footer>
  )
}
