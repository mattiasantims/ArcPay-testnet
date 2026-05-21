import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import QRCodeBox from '../components/QRCodeBox.jsx'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount } from 'wagmi'
import { isMerchantRegistryConfigured } from '../config.js'
import { getMerchantByWallet } from '../utils/merchant.js'
import { buildPaymentUrl, buildCommitmentUrl, savePaymentRequest } from '../utils/paymentRequest.js'
import { getMerchantPolicyByWallet } from '../utils/merchant.js'
import { generateRef } from '../utils/formatting.js'
import { shortAddress } from '../utils/wallet.js'

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
  const [paymentUrl,  setPaymentUrl]  = useState('')
  const [copied,      setCopied]      = useState(false)
  const [error,       setError]       = useState('')
  const [payType,     setPayType]     = useState('immediate') // immediate | delayed | tranche
  const [policy,      setPolicy]      = useState(null)
  // Delayed payment
  const nowMs = Date.now()
  const [dueDate,     setDueDate]     = useState('')
  const [deadline,    setDeadline]    = useState('')
  // Tranche
  const [tranche1Pct, setTranche1Pct] = useState(50)
  const [trancheOffset, setTrancheOffset] = useState(15)

  // Auto-compila nome e policy dal profilo merchant
  useEffect(() => {
    if (!account || !isMerchantRegistryConfigured()) return
    getMerchantByWallet(account).then(m => {
      if (m && m.tradingName) {
        setForm(prev => prev.name ? prev : { ...prev, name: m.tradingName })
      }
    }).catch(() => {})
    getMerchantPolicyByWallet(account).then(pol => {
      if (!pol) return
      setPolicy(pol)
      if (pol.defaultOnlineTrancheBps)      setTranche1Pct(Math.round(pol.defaultOnlineTrancheBps / 100))
      if (pol.defaultOnlineTrancheOffsetDays) setTrancheOffset(pol.defaultOnlineTrancheOffsetDays)
      // Pre-fill delayed date from policy
      if (pol.allowDelayedPayment && pol.defaultDelayedPaymentDays) {
        const due = new Date(nowMs + pol.defaultDelayedPaymentDays * 60 * 1000)
        const ddl = new Date(due.getTime() + pol.defaultDelayedPaymentDays * 60 * 1000)
        setDueDate(due.toISOString().slice(0, 16))
        setDeadline(ddl.toISOString().slice(0, 16))
      }
    }).catch(() => {})
  }, [account])

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

    const base = {
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

    if (payType === 'delayed') {
      if (!dueDate)    { setError('Due date required for delayed payment'); return }
      if (!deadline)   { setError('Deadline required for delayed payment'); return }
      const req = { ...base, type: 'delayed',
        dueDate:  new Date(dueDate).getTime(),
        deadline: new Date(deadline).getTime(),
      }
      savePaymentRequest(req)
      setPaymentUrl(buildPaymentUrl(req))
    } else if (payType === 'tranche') {
      const total   = parseFloat(form.amount)
      const t1      = parseFloat((total * tranche1Pct / 100).toFixed(6))
      const t2      = parseFloat((total - t1).toFixed(6))
      const due1    = Date.now()
      const due2    = due1 + trancheOffset * 60 * 1000
      const ddl1    = due1 + trancheOffset * 60 * 1000
      const ddl2    = due2 + trancheOffset * 60 * 1000
      const req = { ...base, type: 'tranche',
        tranches: [
          { amount: t1.toString(), dueDate: due1, deadline: ddl1 },
          { amount: t2.toString(), dueDate: due2, deadline: ddl2 },
        ],
      }
      savePaymentRequest(req)
      setPaymentUrl(buildPaymentUrl(req))
    } else {
      savePaymentRequest(base)
      setPaymentUrl(buildPaymentUrl(base))
    }
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
              <>
              {/* Payment type selector — only if policy allows */}
              {policy && (policy.allowDelayedPayment || policy.allowOnlineTranche) && (
                <div style={{ marginBottom: 16 }}>
                  <label className="label">Payment type</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { key: 'immediate', label: '⚡ Immediate',      always: true },
                      { key: 'delayed',   label: '📅 Delayed',        show: policy.allowDelayedPayment },
                      { key: 'tranche',   label: '📊 Tranche',        show: policy.allowOnlineTranche },
                    ].filter(o => o.always || o.show).map(o => (
                      <button key={o.key} onClick={() => setPayType(o.key)}
                        className={payType === o.key ? 'btn-primary' : 'btn-ghost'}
                        style={{ fontSize: 12, padding: '6px 14px' }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Delayed payment fields */}
              {payType === 'delayed' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label className="label">Payment due date (min — testnet workaround)</label>
                    <input type="datetime-local" value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
                  </div>
                  <div>
                    <label className="label">Merchant cancel deadline</label>
                    <input type="datetime-local" value={deadline}
                      onChange={e => setDeadline(e.target.value)}
                      style={{ fontFamily: 'var(--mono)', fontSize: 12 }} />
                  </div>
                </div>
              )}

              {/* Tranche fields */}
              {payType === 'tranche' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label className="label">First tranche %</label>
                    <input type="number" min="1" max="99" value={tranche1Pct}
                      onChange={e => setTranche1Pct(Number(e.target.value))} />
                    {form.amount && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                      {(parseFloat(form.amount||0)*tranche1Pct/100).toFixed(2)} USDC now · {(parseFloat(form.amount||0)*(100-tranche1Pct)/100).toFixed(2)} USDC later
                    </div>}
                  </div>
                  <div>
                    <label className="label">Second tranche offset (min — testnet)</label>
                    <input type="number" min="1" value={trancheOffset}
                      onChange={e => setTrancheOffset(Number(e.target.value))} />
                  </div>
                </div>
              )}

              <button onClick={handleCreate} className="btn-primary btn-full" style={{ background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa' }}>
                💎 Generate Luxury Checkout Link
              </button>
              </>
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

            </div>
          </div>

          {/* MetaMask mobile — deep link */}
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f6851b', marginBottom: 8, textAlign: 'center' }}>
              🦊 Pay from MetaMask mobile
            </div>
            <div style={{ background: '#f6851b18', border: '1px solid #f6851b66', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, textAlign: 'left' }}>
              Scan with <strong style={{ color: '#f6851b' }}>MetaMask</strong> — opens directly inside the app, no browser needed.<br/>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Other wallets not supported in this demo.</span>
            </div>
            <QRCodeBox url={paymentUrl} size={160} label={""} />
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

vrev
