import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import QRCodeBox from '../components/QRCodeBox.jsx'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { isMerchantRegistryConfigured } from '../config.js'
import { getMerchantByWallet, getMerchantPolicyByWallet } from '../utils/merchant.js'
import { buildPaymentUrl, savePaymentRequest } from '../utils/paymentRequest.js'
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
  { label: '👗 Boutique purchase', prefix: 'BOUTIQUE', desc: '', amount: '' },
  { label: '🛍️ Temporary shop',    prefix: 'TEMPSHOP', desc: '', amount: '' },
  { label: '💎 Private sale',       prefix: 'PRIVATE',  desc: '', amount: '' },
]

function addMinutes(min) { return Math.floor(Date.now() / 1000) + min * 60 }
function toDatetimeLocal(sec) {
  return new Date(sec * 1000).toISOString().slice(0, 16)
}
function fromDatetimeLocal(str) {
  return Math.floor(new Date(str).getTime() / 1000)
}

export default function LuxuryRetailPage({ account }) {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const effectiveAccount = account || address

  const [form, setForm] = useState({
    name: '', amount: '', desc: '', ref: luxuryRef('LUXURY'), note: '',
  })
  const [paymentUrl, setPaymentUrl] = useState('')
  const [copied,     setCopied]     = useState(false)
  const [error,      setError]      = useState('')

  // Payment type toggle — same pattern as travel's allowScheduledTranche
  const [payType, setPayType] = useState('immediate') // immediate | delayed | tranche

  // Delayed fields
  const [dueDate,  setDueDate]  = useState(toDatetimeLocal(addMinutes(30)))
  const [deadline, setDeadline] = useState(toDatetimeLocal(addMinutes(60)))

  // Tranche fields
  const [tranche1Pct,    setTranche1Pct]    = useState(50)
  const [trancheOffset,  setTrancheOffset]  = useState(15)

  // Load merchant name + pre-fill from policy
  useEffect(() => {
    if (!effectiveAccount || !isMerchantRegistryConfigured()) return
    Promise.all([
      getMerchantByWallet(effectiveAccount),
      getMerchantPolicyByWallet(effectiveAccount),
    ]).then(([m, p]) => {
      if (m?.tradingName) setForm(prev => prev.name ? prev : { ...prev, name: m.tradingName })
      if (p) {
        // Pre-fill from policy if available — merchant can still override
        if (p.defaultOnlineTrancheBps)        setTranche1Pct(Math.round(p.defaultOnlineTrancheBps / 100))
        if (p.defaultOnlineTrancheOffsetDays) setTrancheOffset(p.defaultOnlineTrancheOffsetDays)
        if (p.defaultDelayedPaymentDays) {
          setDueDate(toDatetimeLocal(addMinutes(p.defaultDelayedPaymentDays)))
          setDeadline(toDatetimeLocal(addMinutes(p.defaultDelayedPaymentDays * 2)))
        }
      }
    }).catch(() => {})
  }, [effectiveAccount])

  function handleChange(e) { setForm(prev => ({ ...prev, [e.target.name]: e.target.value })) }

  function applyDemo(item) {
    setForm(prev => ({ ...prev, desc: item.desc, ref: luxuryRef(item.prefix), amount: item.amount }))
    setPaymentUrl(''); setError('')
  }

  function handleCreate() {
    setError('')
    if (!effectiveAccount)                            { setError('Connect wallet first'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Amount required'); return }
    if (!form.ref.trim())                             { setError('Reference required'); return }

    const base = {
      id: form.ref, merchant: effectiveAccount, amount: form.amount,
      ref: form.ref.trim(), purpose: 'RETAIL',
      name: form.name.trim(), desc: form.desc.trim(), note: form.note.trim(),
      createdAt: new Date().toISOString(),
    }

    if (payType === 'delayed') {
      if (!dueDate)  { setError('Due date required'); return }
      if (!deadline) { setError('Deadline required'); return }
      const req = { ...base, type: 'delayed',
        dueDate:  new Date(dueDate).getTime(),
        deadline: new Date(deadline).getTime(),
      }
      savePaymentRequest(req)
      setPaymentUrl(buildPaymentUrl(req))
    } else if (payType === 'tranche') {
      const total = parseFloat(form.amount)
      const t1    = parseFloat((total * tranche1Pct / 100).toFixed(6))
      const t2    = parseFloat((total - t1).toFixed(6))
      const now   = Date.now()
      const offsetMs = trancheOffset * 60 * 1000
      const req = { ...base, type: 'tranche',
        tranches: [
          { amount: t1.toString(), dueDate: now,           deadline: now + offsetMs },
          { amount: t2.toString(), dueDate: now + offsetMs, deadline: now + offsetMs * 2 },
        ],
      }
      savePaymentRequest(req)
      setPaymentUrl(buildPaymentUrl(req))
    } else {
      savePaymentRequest(base)
      setPaymentUrl(buildPaymentUrl(base))
    }
  }

  const total = parseFloat(form.amount || 0)
  const t1amt = parseFloat((total * tranche1Pct / 100).toFixed(2))
  const t2amt = parseFloat((total - t1amt).toFixed(2))

  // ── Success state ──────────────────────────────────────────────────────────
  if (paymentUrl) return (
    <div className="fade-up">
      {/* Hero recap */}
      <div className="card" style={{
        background: 'linear-gradient(135deg, #0d0a1a 0%, #1a0f2e 100%)',
        border: '1px solid #6b44ff44', textAlign: 'center', padding: '28px 24px', marginBottom: 16,
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>💎</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 800, color: '#7c3aed', letterSpacing: '-1px', marginBottom: 4 }}>
          {form.amount} USDC
        </div>
        {form.name && <div style={{ fontSize: 15, color: '#a78bfa', marginBottom: 8 }}>{form.name}</div>}
        {payType === 'delayed' && dueDate && (
          <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 6 }}>
            📅 Payment due: {new Date(dueDate).toLocaleString()}
          </div>
        )}
        {payType === 'tranche' && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 8, fontSize: 13 }}>
            <div><span style={{ color: 'var(--text3)' }}>Tranche 1 </span><span style={{ color: 'var(--usdc)', fontWeight: 600 }}>{t1amt} USDC</span></div>
            <div><span style={{ color: 'var(--text3)' }}>Tranche 2 </span><span style={{ color: 'var(--green)', fontWeight: 600 }}>{t2amt} USDC</span></div>
          </div>
        )}
      </div>

      <div className="card" style={{ borderColor: 'var(--green-bdr)', background: 'var(--green-bg)', textAlign: 'center', padding: '28px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--green)', marginBottom: 8 }}>
          Luxury Checkout Ready
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
          Share this link with your customer.
        </p>
        <button onClick={() => { navigator.clipboard.writeText(paymentUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
          style={{ padding: '10px 24px', background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          {copied ? '✓ Copied!' : '🔗 Copy payment link'}
        </button>
      </div>

      {/* MetaMask mobile */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#f6851b', marginBottom: 8, textAlign: 'center' }}>
          🦊 Pay from MetaMask mobile
        </div>
        <div style={{ background: '#f6851b18', border: '1px solid #f6851b66', borderRadius: 8, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          Scan with <strong style={{ color: '#f6851b' }}>MetaMask</strong> — opens directly inside the app, no browser needed.<br/>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>Other wallets not supported in this demo.</span>
        </div>
        <QRCodeBox url={paymentUrl} size={160} label={""} />
      </div>

      <div style={{ textAlign: 'center' }}>
        <button onClick={() => { setPaymentUrl(''); setForm(prev => ({ ...prev, ref: luxuryRef('LUXURY') })) }}
          className="btn-ghost" style={{ padding: '10px 24px', fontSize: 13 }}>
          + New checkout
        </button>
      </div>
    </div>
  )

  // ── Form ───────────────────────────────────────────────────────────────────
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
          Premium USDC checkout for boutiques, luxury retail, and temporary shops.
        </p>
      </div>

      {/* Demo presets */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Demo presets</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DEMO_ITEMS.map(item => (
            <button key={item.prefix} onClick={() => applyDemo(item)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {!isConnected && !account ? (
        <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>💎</div>
          <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to create a luxury checkout link</p>
          <button onClick={() => open()} className="btn-primary btn-full" style={{ maxWidth: 280, margin: '0 auto' }}>
            Connect Wallet
          </button>
        </div>
      ) : (
        <div className="card" style={{ background: 'linear-gradient(135deg, #0f1219 0%, #161b26 100%)', border: '1px solid #2e3a55' }}>
          {effectiveAccount && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Merchant wallet</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(effectiveAccount)}</div>
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
                <input name="ref" value={form.ref} onChange={handleChange} placeholder="LUXURY-2026-001" maxLength={64} />
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

            {/* Payment method — same pattern as travel */}
            <div>
              <label className="label">Payment method</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', opacity: 0.35, cursor: 'not-allowed' }}>
                  <span style={{ fontSize: 18 }}>💳</span>
                  <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>Credit / Debit Card</span>
                </div>
                {/* Immediate */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: payType === 'immediate' ? '#0a1628' : 'var(--surface2)', border: `2px solid ${payType === 'immediate' ? 'var(--usdc)' : 'var(--border)'}`, cursor: 'pointer' }}
                  onClick={() => setPayType('immediate')}>
                  <span style={{ fontSize: 18 }}>⚡</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: payType === 'immediate' ? 'var(--usdc)' : 'var(--text2)' }}>
                      USDC on Arc — Immediate <span style={{ fontSize: 10, background: 'var(--usdc)', color: '#fff', borderRadius: 4, padding: '1px 6px', marginLeft: 6, fontWeight: 700 }}>ArcPay</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Instant payment · On-chain receipt via ArcProof</div>
                  </div>
                  {payType === 'immediate' && <span style={{ color: 'var(--usdc)', fontSize: 16 }}>✓</span>}
                </div>
                {/* Delayed */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: payType === 'delayed' ? '#0a1a0a' : 'var(--surface2)', border: `2px solid ${payType === 'delayed' ? 'var(--green)' : 'var(--border)'}`, cursor: 'pointer' }}
                  onClick={() => setPayType('delayed')}>
                  <span style={{ fontSize: 18 }}>📅</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: payType === 'delayed' ? 'var(--green)' : 'var(--text2)' }}>
                      Delayed Payment <span style={{ fontSize: 10, background: 'var(--green)', color: '#000', borderRadius: 4, padding: '1px 6px', marginLeft: 6, fontWeight: 700 }}>ArcPay</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Customer commits on-chain to pay by a future date — no escrow</div>
                  </div>
                  {payType === 'delayed' && <span style={{ color: 'var(--green)', fontSize: 16 }}>✓</span>}
                </div>
                {/* Tranche */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: payType === 'tranche' ? '#1a1200' : 'var(--surface2)', border: `2px solid ${payType === 'tranche' ? 'var(--yellow)' : 'var(--border)'}`, cursor: 'pointer' }}
                  onClick={() => setPayType('tranche')}>
                  <span style={{ fontSize: 18 }}>📊</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: payType === 'tranche' ? 'var(--yellow)' : 'var(--text2)' }}>
                      Tranche Payment <span style={{ fontSize: 10, background: 'var(--yellow)', color: '#000', borderRadius: 4, padding: '1px 6px', marginLeft: 6, fontWeight: 700 }}>ArcPay</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Split into 2 scheduled payments</div>
                  </div>
                  {payType === 'tranche' && <span style={{ color: 'var(--yellow)', fontSize: 16 }}>✓</span>}
                </div>
              </div>
            </div>

            {/* Delayed fields */}
            {payType === 'delayed' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="label">Payment due date (min — testnet workaround)</label>
                  <input type="datetime-local" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Merchant cancel deadline</label>
                  <input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--yellow)', gridColumn: '1/-1' }}>⚠️ Use minutes for testnet demo</div>
              </div>
            )}

            {/* Tranche fields */}
            {payType === 'tranche' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label className="label">First tranche %</label>
                    <input type="number" min="1" max="99" value={tranche1Pct} onChange={e => setTranche1Pct(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="label">Second tranche offset (min — testnet)</label>
                    <input type="number" min="1" value={trancheOffset} onChange={e => setTrancheOffset(Number(e.target.value))} />
                  </div>
                </div>
                {total > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div style={{ padding: 10, background: '#0a1628', border: '1px solid var(--usdc)', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--usdc)', marginBottom: 4 }}>Tranche 1 — now</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--usdc)' }}>{t1amt} USDC</div>
                    </div>
                    <div style={{ padding: 10, background: 'var(--green-bg)', border: '1px solid var(--green-bdr)', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--green)', marginBottom: 4 }}>Tranche 2 — in {trancheOffset} min</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{t2amt} USDC</div>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: 'var(--yellow)' }}>⚠️ Use minutes for testnet demo</div>
              </div>
            )}

            {error && <div className="error-box">{error}</div>}

            <button onClick={handleCreate} className="btn-primary btn-full" style={{ background: '#1a1530', border: '1px solid #6b44ff', color: '#a78bfa' }}>
              💎 Generate Luxury Checkout Link
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text)' }}>How it works:</strong> The customer opens the payment link and pays USDC directly on Arc. Both parties receive an on-chain receipt via ArcProof.
      </div>
    </div>
  )
}
