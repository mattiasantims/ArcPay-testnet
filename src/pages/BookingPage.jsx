import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import QRCodeBox from '../components/QRCodeBox.jsx'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { isBookingContractConfigured, isMerchantRegistryConfigured } from '../config.js'
import { getMerchantByWallet, getMerchantPolicyByWallet } from '../utils/merchant.js'
import { encodeBookingRequest, buildBookingUrl, saveBookingRequest } from '../utils/bookingRequest.js'
import { shortAddress } from '../utils/wallet.js'
import BookingPolicyCard from '../components/BookingPolicyCard.jsx'

function generateBookingRef() {
  return `BOOK-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`
}

function addMinutes(mins) {
  return Math.floor(Date.now() / 1000) + mins * 60
}

// FIX: usa ora locale invece di UTC per evitare sfasamento fuso orario
function toDatetimeLocal(unix) {
  const d = new Date(unix * 1000)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function fromDatetimeLocal(str) {
  return Math.floor(new Date(str).getTime() / 1000)
}

export default function BookingPage({ account }) {
  const { open } = useWeb3Modal()
  const configured = isBookingContractConfigured()

  const [form, setForm] = useState({
    merchantName:     '',
    amount:           '',
    nonRefundablePct: '30',
    bookingRef:       generateBookingRef(),
    description:      '',
    note:             '',
    cancellationDeadline: toDatetimeLocal(addMinutes(5)),
    checkInDate:      toDatetimeLocal(addMinutes(10)),
    deadlinePreset:   'custom',
  })
  const [bookingUrl, setBookingUrl] = useState('')
  const [copied,     setCopied]     = useState(false)
  const [error,      setError]      = useState('')

  // Auto-compila il nome dal profilo merchant
  useEffect(() => {
    if (!account || !isMerchantRegistryConfigured()) return
    getMerchantByWallet(account).then(m => {
      if (m && m.tradingName) {
        setForm(prev => prev.merchantName ? prev : { ...prev, merchantName: m.tradingName })
      }
    }).catch(() => {})
  }, [account])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function applyDeadlinePreset(preset) {
    let dl, ci
    if (preset === '2min')   { dl = addMinutes(2);   ci = addMinutes(7)   }
    if (preset === '5min')   { dl = addMinutes(5);   ci = addMinutes(10)  }
    if (preset === '30days') { dl = addMinutes(43200); ci = addMinutes(43800) }
    if (dl) setForm(prev => ({
      ...prev,
      cancellationDeadline: toDatetimeLocal(dl),
      checkInDate: toDatetimeLocal(ci),
      deadlinePreset: preset,
    }))
    else setForm(prev => ({ ...prev, deadlinePreset: 'custom' }))
  }

  function validate() {
    if (!account)                                              return 'Connect your wallet first'
    if (!form.amount || parseFloat(form.amount) <= 0)         return 'Amount must be greater than 0'
    if (!form.bookingRef.trim())                              return 'Booking reference required'
    const dl = fromDatetimeLocal(form.cancellationDeadline)
    const ci = fromDatetimeLocal(form.checkInDate)
    const now = Math.floor(Date.now() / 1000)
    if (dl <= now)   return 'Cancellation deadline must be in the future'
    if (ci <= dl)    return 'Check-in date must be after cancellation deadline'
    return null
  }

  function handleCreate() {
    setError('')
    const err = validate()
    if (err) { setError(err); return }

    const bps = Math.round(parseFloat(form.nonRefundablePct) * 100)
    const dl  = fromDatetimeLocal(form.cancellationDeadline)
    const ci  = fromDatetimeLocal(form.checkInDate)

    const req = {
      merchant:             account,
      merchantName:         form.merchantName.trim(),
      totalAmount:          form.amount,
      nonRefundableBps:     bps,
      bookingRef:           form.bookingRef.trim(),
      cancellationDeadline: dl,
      checkInDate:          ci,
      description:          form.description.trim(),
      note:                 form.note.trim(),
      createdAt:            new Date().toISOString(),
    }

    const url = buildBookingUrl(req)
    saveBookingRequest(req)
    setBookingUrl(url)
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, marginBottom: 8, color: 'var(--yellow)' }}>
        Booking Escrow Contract Not Configured
      </h2>
      <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
        Deploy <code>contracts/ArcBookingEscrow.sol</code> via Remix on Arc Testnet, then update <code>ARCBOOKING_ADDRESS</code> in <code>src/config.js</code>.
      </p>
      <Link to="/"><button className="btn-ghost">← Back to home</button></Link>
    </div>
  )

  if (!account) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>🏨</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to create a booking deposit request</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>
        Connect Wallet
      </button>
    </div>
  )

  const bps    = Math.round(parseFloat(form.nonRefundablePct || 30) * 100)
  const total  = parseFloat(form.amount || 0)
  const nonRef = ((total * bps) / 10000).toFixed(2)
  const ref    = (total - parseFloat(nonRef)).toFixed(2)

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Hotel Booking Deposit</span>
          <span className="badge badge-yellow">ERC-8183-inspired</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Create Booking Deposit Request
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          Generate a booking deposit link with programmable refund rules. The non-refundable portion is released immediately to the hotel.
        </p>
      </div>

      {!bookingUrl ? (
        <div className="card">
          <div style={{
            background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '10px 14px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>Receiving payments to</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(account)}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="label">Hotel / Property name</label>
              <input name="merchantName" value={form.merchantName} onChange={handleChange} placeholder="e.g. Grand Hotel Colosseum Rome" />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Shown to guest. Not stored on-chain.</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Booking deposit amount (USDC) *</label>
                <input name="amount" value={form.amount} onChange={handleChange} type="number" min="0.01" step="0.01" placeholder="e.g. 300.00" />
              </div>
              <div>
                <label className="label">Non-refundable percentage *</label>
                <input name="nonRefundablePct" value={form.nonRefundablePct} onChange={handleChange} type="number" min="0" max="100" step="1" placeholder="30" />
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Default: 30% non-refundable</div>
              </div>
            </div>

            {form.amount && parseFloat(form.amount) > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#1a0808', border: '1px solid #5a1c1c', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: '#f08080', marginBottom: 4 }}>Released immediately</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: '#f04f4f' }}>{nonRef} USDC</div>
                  <div style={{ fontSize: 10, color: '#f08080' }}>Non-refundable ({form.nonRefundablePct}%)</div>
                </div>
                <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-bdr)', borderRadius: 8, padding: 12, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 4 }}>Locked in escrow</div>
                  <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{ref} USDC</div>
                  <div style={{ fontSize: 10, color: 'var(--green)' }}>Refundable ({100 - parseInt(form.nonRefundablePct)}%)</div>
                </div>
              </div>
            )}

            <div>
              <label className="label">Booking reference *</label>
              <input name="bookingRef" value={form.bookingRef} onChange={handleChange} placeholder="BOOK-2026-001" maxLength={64} />
            </div>

            <div>
              <label className="label">Cancellation deadline *</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[
                  { key: '2min',   label: '2 min (demo)' },
                  { key: '5min',   label: '5 min (demo)' },
                  { key: '30days', label: '30 days' },
                  { key: 'custom', label: 'Custom' },
                ].map(p => (
                  <button key={p.key} onClick={() => applyDeadlinePreset(p.key)}
                    className={form.deadlinePreset === p.key ? 'btn-primary' : 'btn-ghost'}
                    style={{ fontSize: 11, padding: '5px 10px' }}>
                    {p.label}
                  </button>
                ))}
              </div>
              <input name="cancellationDeadline" value={form.cancellationDeadline} onChange={handleChange} type="datetime-local" />
              <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4 }}>⚠️ Use short deadlines (2-5 min) for testnet demo</div>
            </div>

            <div>
              <label className="label">Check-in date *</label>
              <input name="checkInDate" value={form.checkInDate} onChange={handleChange} type="datetime-local" />
            </div>

            <div>
              <label className="label">Description</label>
              <textarea name="description" value={form.description} onChange={handleChange} rows={2} placeholder="e.g. Deluxe Room · 2 nights · Jun 20-22 2026" />
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

            <button onClick={handleCreate} className="btn-primary btn-full">
              🏨 Generate Booking Deposit Link
            </button>
          </div>
        </div>
      ) : (
        <div className="fade-up">
          {/* Hero recap */}
          <div className="card" style={{
            background: 'linear-gradient(135deg, #0a1a0a 0%, #0d2210 100%)',
            border: '1px solid #1a4a20', textAlign: 'center', padding: '28px 24px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🏨</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 36, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-1px', marginBottom: 4 }}>
              {parseFloat(form.amount).toFixed(2)} USDC
            </div>
            {form.name && <div style={{ fontSize: 15, color: 'var(--text2)', marginBottom: 8 }}>{form.name}</div>}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 20, fontSize: 13 }}>
              <div><span style={{ color: 'var(--text3)' }}>Non-refundable </span><span style={{ color: '#f08080', fontWeight: 600 }}>{((parseFloat(form.amount) * parseFloat(form.nonRefundablePct)) / 100).toFixed(2)} USDC</span></div>
              <div><span style={{ color: 'var(--text3)' }}>Escrow </span><span style={{ color: 'var(--green)', fontWeight: 600 }}>{(parseFloat(form.amount) - (parseFloat(form.amount) * parseFloat(form.nonRefundablePct)) / 100).toFixed(2)} USDC</span></div>
            </div>
          </div>

          <BookingPolicyCard totalAmount={form.amount} nonRefundableBps={Math.round(parseFloat(form.nonRefundablePct)*100)} />

          <div className="card" style={{ borderColor: 'var(--green-bdr)', background: 'var(--green-bg)', textAlign: 'center', padding: '28px 24px', marginBottom: 16 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--green)', marginBottom: 8 }}>
              Booking Request Created
            </h2>
            <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
              Share this link with your guest. They can pay and the deposit will be split automatically.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => { navigator.clipboard.writeText(bookingUrl); setCopied(true); setTimeout(()=>setCopied(false),2000) }}
                className="btn-green" style={{ padding: '10px 24px' }}>
                {copied ? '✓ Copied!' : '🔗 Copy Booking Link'}
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
            <QRCodeBox url={bookingUrl} size={160} label={""} />
          </div>


          <div style={{ textAlign: 'center', marginTop: 12 }}>
            <button onClick={() => { setBookingUrl(''); setForm(prev => ({ ...prev, bookingRef: generateBookingRef() })) }}
              className="btn-ghost" style={{ padding: '10px 24px', fontSize: 13 }}>
              + Create another booking
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
