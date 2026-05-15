import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { PURPOSE_CODES } from '../config.js'
import { buildPaymentUrl, savePaymentRequest } from '../utils/paymentRequest.js'
import { generateRef } from '../utils/formatting.js'
import { shortAddress } from '../utils/wallet.js'

export default function CreatePaymentPage({ account, balance }) {
  const { open } = useWeb3Modal()
  const [form, setForm] = useState({
    name:    '',
    amount:  '',
    desc:    '',
    ref:     generateRef(),
    purpose: 'INVOICE',
    note:    '',
  })
  const [paymentUrl, setPaymentUrl] = useState('')
  const [copied,     setCopied]     = useState(false)
  const [error,      setError]      = useState('')

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function validate() {
    if (!account)                                         return 'Connect your wallet first'
    if (!form.amount || parseFloat(form.amount) <= 0)    return 'Amount must be greater than 0'
    if (!form.ref.trim())                                 return 'Payment reference is required'
    if (!form.purpose)                                    return 'Purpose code is required'
    return null
  }

  function handleCreate() {
    setError('')
    const err = validate()
    if (err) { setError(err); return }

    const req = {
      id:       form.ref.trim(),
      merchant: account,
      amount:   form.amount,
      ref:      form.ref.trim(),
      purpose:  form.purpose,
      name:     form.name.trim(),
      desc:     form.desc.trim(),
      note:     form.note.trim(),
      createdAt: new Date().toISOString(),
    }

    const url = buildPaymentUrl(req)
    savePaymentRequest(req)
    setPaymentUrl(url)
  }

  function copyLink() {
    navigator.clipboard.writeText(paymentUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!account) {
    return (
      <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 32, marginBottom: 16 }}>💳</div>
        <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to create a payment request</p>
        <button onClick={() => open()} className="btn-primary btn-full" style={{ maxWidth: 280, margin: '0 auto' }}>
          Connect Wallet
        </button>
      </div>
    )
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Create Payment Request
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          Generate a payment link and QR code to accept USDC on Arc.
        </p>
      </div>

      {!paymentUrl ? (
        <div className="card">
          {/* Wallet info */}
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Receiving payments to</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(account)}</span>
              {balance && <span style={{ fontSize: 12, color: 'var(--usdc)', fontWeight: 600 }}>{balance} USDC</span>}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Your name / business name</label>
              <input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Hotel Roma, Mattia Santi, Charity Foundation..." />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Shown to customer on checkout page. Not stored on-chain.</div>
            </div>

            <div>
              <label className="label">Amount (USDC) <span className="required">*</span></label>
              <input name="amount" value={form.amount} onChange={handleChange} type="number" min="0.000001" step="0.000001" placeholder="e.g. 150.00" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Payment Reference <span className="required">*</span></label>
                <input name="ref" value={form.ref} onChange={handleChange} placeholder="PAY-2026-001" maxLength={64} />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Stored on-chain · max 64 chars</div>
              </div>
              <div>
                <label className="label">Purpose code <span className="required">*</span></label>
                <select name="purpose" value={form.purpose} onChange={handleChange}>
                  {PURPOSE_CODES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="label">Description</label>
              <textarea name="desc" value={form.desc} onChange={handleChange} rows={2} placeholder="e.g. 1 night Deluxe Room, Q3 consulting services..." />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Shown to customer. Not stored on-chain — only its hash is.</div>
            </div>

            <div>
              <label className="label">Customer note (optional)</label>
              <input name="note" value={form.note} onChange={handleChange} placeholder="e.g. Booking ref #12345" />
            </div>


            {/* Payment method — static display */}
            <div>
              <label className="label">Payment method</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  opacity: 0.35, cursor: 'not-allowed',
                }}>
                  <span style={{ fontSize: 18 }}>💳</span>
                  <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>Credit / Debit Card</span>
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  background: '#0a1628', border: '2px solid var(--usdc)',
                }}>
                  <span style={{ fontSize: 18 }}>◆</span>
                  <span style={{ fontSize: 13, color: 'var(--usdc)', fontWeight: 600 }}>USDC on Arc Network</span>
                </div>
              </div>
            </div>

            {error && <div className="error-box">{error}</div>}

            <button onClick={handleCreate} className="btn-primary btn-full" style={{ marginTop: 4 }}>
              🔗 Generate Payment Link + QR
            </button>
          </div>
        </div>
      ) : (
        <div className="fade-up">
          <div className="card" style={{ borderColor: 'var(--green-bdr)', background: 'var(--green-bg)', textAlign: 'center', padding: '28px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--green)', marginBottom: 8 }}>
              Payment Request Created
            </h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
              Share the link or show the QR at checkout.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={copyLink} className="btn-green" style={{ padding: '10px 24px' }}>
                {copied ? '✓ Copied!' : '🔗 Copy Payment Link'}
              </button>
              <Link to={`/qr?r=${new URL(paymentUrl).searchParams.get('r')}`}>
                <button className="btn-ghost" style={{ padding: '10px 20px' }}>
                  📺 Full-screen QR
                </button>
              </Link>
            </div>
          </div>

          {/* Payment summary */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>Payment request</div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{form.name || shortAddress(account)}</div>
                {form.desc && <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>{form.desc}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-1px' }}>{form.amount}</div>
                <div style={{ fontSize: 14, color: 'var(--text2)' }}>USDC</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="badge badge-gray">{form.ref}</span>
              <span className="badge badge-blue">{form.purpose}</span>
              <span className="badge badge-yellow">Arc Testnet</span>
            </div>
          </div>

          {/* QR */}
          <div className="card" style={{ padding: 28 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                QR Code — Scan to pay
              </div>
              <div style={{ display: 'inline-block', background: '#fff', padding: 16, borderRadius: 12 }}>
                <QRCodeSVG value={paymentUrl} size={180} />
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
                {paymentUrl}
              </p>
            </div>
          </div>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <button onClick={() => { setPaymentUrl(''); setForm(prev => ({ ...prev, ref: generateRef() })) }} className="btn-ghost" style={{ padding: '10px 24px', fontSize: 13 }}>
              + Create another request
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
