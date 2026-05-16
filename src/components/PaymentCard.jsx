import { shortAddress } from '../utils/wallet.js'

export default function PaymentCard({ merchantName, amount, description, paymentRef, purposeCode, merchantWallet }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Paying to</div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{merchantName || shortAddress(merchantWallet)}</div>
          {merchantName && (
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 2 }}>
              {shortAddress(merchantWallet)}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-1px', lineHeight: 1 }}>
            {amount}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginTop: 4 }}>USDC</div>
        </div>
      </div>
      {description && <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 10 }}>{description}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {paymentRef && <span className="badge badge-gray">{paymentRef}</span>}
        {purposeCode && <span className="badge badge-blue">{purposeCode}</span>}
        <span className="badge badge-yellow">Arc Testnet</span>
        <span style={{ fontSize: 11, color: 'var(--usdc)', fontFamily: 'var(--mono)' }}>USDC</span>
      </div>
    </div>
  )
}
