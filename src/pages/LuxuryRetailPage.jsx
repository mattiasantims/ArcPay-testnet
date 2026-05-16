import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import QRCodeBox from '../components/QRCodeBox.jsx'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount } from 'wagmi'
import { isMerchantRegistryConfigured } from '../config.js'
import { getMerchantByWallet } from '../utils/merchant.js'
import { buildPaymentUrl, savePaymentRequest } from '../utils/paymentRequest.js'
import { generateRef } from '../utils/formatting.js'
import { shortAddress } from '../utils/wallet.js'
import { fetchReceivedProofIds, fetchProof, recoverTxHash } from '../utils/receipts.js'
import { ARCSCAN_BASE } from '../config.js'

function luxuryRef(prefix) {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const n = String(Math.floor(Math.random() * 9000) + 1000)
  return `${prefix}-${y}${m}-${n}`
}

const DEMO_ITEMS = [
  {
    label:  '👗 Boutique purchase',
    prefix: 'BOUTIQUE',
    desc:   '',
    amount: '',
  },
  {
    label:  '🛍️ Temporary shop',
    prefix: 'TEMPSHOP',
    desc:   '',
    amount: '',
  },
  {
    label:  '💎 Private sale',
    prefix: 'PRIVATE',
    desc:   '',
    amount: '',
  },
]

export default function LuxuryRetailPage({ account }) {
  const { open } = useWeb3Modal()
  const { isConnected } = useAccount()
  const [form, setForm] = useState({
    name:    '',
    amount:  '',
    desc:    '',
    ref:     '',
    note:    '',
  })
  const [paymentUrl, setPaymentUrl] = useState('')
  const [copied,     setCopied]     = useState(false)
  const [error,      setError]      = useState('')
  const [polling,    setPolling]    = useState(false)
  const [received,   setReceived]   = useState(null) // { proofId, amount, payer, txHash }
  const [pollRef,    setPollRef]    = useState(null)

  // Auto-compila il nome dal profilo merchant
  useEffect(() => {
    if (!account || !isMerchantRegistryConfigured()) return
    getMerchantByWallet(account).then(m => {
      if (m && m.tradingName) {
        setForm(prev => prev.name ? prev : { ...prev, name: m.tradingName })
      }
    }).catch(() => {})
  }, [account])

  function startPolling(merchantAddress, amount, ref, generatedAt) {
    if (pollRef) clearInterval(pollRef)
    setReceived(null)
    setPolling(true)
    let attempts = 0
    const intervalId = setInterval(async () => {
      attempts++
      try {
        const ids = await fetchReceivedProofIds(merchantAddress)
        for (const id of [...ids].reverse()) {
          const proof = await fetchProof(id)
          if (!proof) continue
          const proofTs = Number(proof.timestamp)
          const proofAmount = Number(proof.amount) / 1e6
          const matchAmount = Math.abs(proofAmount - parseFloat(amount)) < 0.01
          const matchRef = !ref || proof.paymentRef === ref
          const matchPurpose = !proof.purposeCode || proof.purposeCode === 'RETAIL'
          if (proofTs >= generatedAt && matchAmount && matchRef && matchPurpose) {
            const txHash = await recoverTxHash(id, proof.createdBlock)
            clearInterval(intervalId)
            setPolling(false)
            setReceived({
              proofId: id.toString(),
              amount: proofAmount.toFixed(2),
              payer: proof.payer,
              merchant: proof.payee,
              ref: proof.paymentRef,
              txHash,
            })
            setPollRef(null)
            return
          }
        }
      } catch { /* continue polling */ }
      if (attempts >= 60) { clearInterval(intervalId); setPolling(false); setPollRef(null) }
    }, 5000)
    setPollRef(intervalId)
  }

  function handleChange(e) { setForm(prev => ({ ...prev, [e.target.name]: e.target.value })) }

  function applyDemo(item) {
    setForm(prev => ({ ...prev, desc: item.desc, ref: luxuryRef(item.prefix), amount: item.amount }))
    setPaymentUrl(''); setError('')
  }

  function handleCreate() {
    setError('')
    if (!account)                                      { setError('Connect wallet first'); return }
    if (!form.amount || parseFloat(form.amount) <= 0)  { setError('Amount required'); return }
    if (!form.ref.trim())                              { setError('Reference required'); return }

    const req = {
      id:        form.ref,
      merchant:  account,
      amount:    form.amount,
      ref:       form.ref.trim(),
      purpose:   'RETAIL',
      name:      form.name.trim(),
      desc:      form.desc.trim(),
      note:      form.note.trim(),
      createdAt: new Date().toISOString(),
    }
    const url = buildPaymentUrl(req)
    savePaymentRequest(req)
    setPaymentUrl(url)
    startPolling(account, form.amount, req.ref, Math.floor(Date.now() / 1000))
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Luxury Retail</span>
          <span className="badge badge-gray">Instant Payment</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Luxury Retail Checkout
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          Premium USDC checkout for boutiques, luxury retail, and temporary shops. Instant payment with on-chain receipt.
        </p>
      </div>

      {/* Demo presets */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Demo presets
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEMO_ITEMS.map(item => (
            <button key={item.ref} onClick={() => applyDemo(item)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!paymentUrl ? (
        <div className="card" style={{
          background: 'linear-gradient(135deg, #0f1219 0%, #161b26 100%)',
          border: '1px solid #2e3a55',
        }}>
          {account && (
            <div style={{
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 20,
              display: 'flex', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Merchant wallet</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(account)}</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Store / brand name</label>
              <input name="name" value={form.name} onChange={handleChange} placeholder="e.g. Demo Luxury Boutique" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Amount (USDC) *</label>
                <input name="amount" value={form.amount} onChange={handleChange} type="number" min="0.01" step="0.01" placeholder="420.00" />
              </div>
              <div>
                <label className="label">Order reference *</label>
                <input name="ref" value={form.ref} onChange={handleChange} placeholder="BOUTIQUE-2026-001" maxLength={64} />
              </div>
            </div>
            <div>
              <label className="label">Item / description</label>
              <input name="desc" value={form.desc} onChange={handleChange} placeholder="e.g. Silk Evening Dress — Navy Blue" />
            </div>
            <div>
              <label className="label">Private note (optional)</label>
              <input name="note" value={form.note} onChange={handleChange} placeholder="e.g. Client: Ms. Chen" />
            </div>

            {error && <div className="error-box">{error}</div>}

            {!account ? (
              <button onClick={() => open()} className="btn-primary btn-full">
                Connect Wallet
              </button>
            ) : (
              <button onClick={handleCreate} className="btn-primary btn-full" style={{ background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa' }}>
                💎 Generate Luxury Checkout Link
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="fade-up">
          <div className="card" style={{
            background: 'linear-gradient(135deg, #0d0a1a 0%, #1a0f2e 100%)',
            border: '1px solid #6b44ff44', textAlign: 'center', padding: '28px 24px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>💎</div>
            <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: '#a78bfa', marginBottom: 8 }}>
              Luxury Checkout Ready
            </h2>
            <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 800, color: '#7c3aed', letterSpacing: '-1px', marginBottom: 4 }}>
              {form.amount} USDC
            </div>
            {form.name && <div style={{ fontSize: 14, color: '#a78bfa', marginBottom: 16 }}>{form.name}</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => { navigator.clipboard.writeText(paymentUrl); setCopied(true); setTimeout(()=>setCopied(false),2000) }}
                style={{ padding: '10px 24px', background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                {copied ? '✓ Copied!' : '🔗 Copy payment link'}
              </button>
              <a href={paymentUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <button style={{ padding: '10px 20px', background: '#7c3aed', border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  Open checkout →
                </button>
              </a>
            </div>
          </div>

          {received && (
            <div className="card" style={{ padding: 22, marginBottom: 16, borderColor: 'var(--green-bdr)', background: 'var(--green-bg)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <div className="badge badge-green" style={{ marginBottom: 8 }}>Payment received</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: 'var(--green)' }}>{received.amount} USDC</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>Customer: <span style={{ fontFamily: 'var(--mono)' }}>{shortAddress(received.payer)}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Reference: <span style={{ fontFamily: 'var(--mono)' }}>{received.ref}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>Proof ID: #{received.proofId}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Link to={`/receipt/${received.proofId}`} style={{ textDecoration: 'none' }}>
                    <button className="btn-primary" style={{ padding: '9px 14px', fontSize: 12 }}>View receipt</button>
                  </Link>
                  {received.txHash && (
                    <a href={`${ARCSCAN_BASE}/tx/${received.txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      <button className="btn-ghost" style={{ padding: '9px 14px', fontSize: 12 }}>ArcScan ↗</button>
                    </a>
                  )}
                  <button onClick={() => { setReceived(null); setPaymentUrl(''); setForm(prev => ({ ...prev, ref: generateRef() })) }} className="btn-ghost" style={{ padding: '9px 14px', fontSize: 12 }}>Create another payment</button>
                </div>
              </div>
            </div>
          )}

          {!received && polling && (
            <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: '#6b44ff44', color: 'var(--text2)', fontSize: 13, textAlign: 'center' }}>
              Watching ArcProof for this payment. The merchant confirmation will appear here once the transaction is detected.
            </div>
          )}

          <div className="card" style={{ padding: 24, marginBottom: 16, background: 'linear-gradient(135deg, #0f1219 0%, #0d0a1a 100%)', border: '1px solid #2e1f55' }}>
            <QRCodeBox url={paymentUrl} size={160} label="QR Code — Scan to pay" />
          </div>

          <div style={{ textAlign: 'center' }}>
            <button onClick={() => { setPaymentUrl(''); setForm(prev => ({ ...prev, ref: generateRef() })) }}
              className="btn-ghost" style={{ padding: '10px 24px', fontSize: 13 }}>
              + New checkout
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)' }}>How it works:</strong> The customer opens the payment link in their browser or scans the QR code. They connect their wallet and pay USDC directly on Arc. Both parties receive an on-chain Payment Receipt via ArcProof — downloadable as PDF, JSON, and exportable as CSV from the merchant dashboard.
      </div>
    </div>
  )
}
