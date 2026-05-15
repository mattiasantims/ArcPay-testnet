import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { isTravelContractConfigured, isMerchantRegistryConfigured } from '../config.js'
import { getMerchantByWallet, getMerchantPolicyByWallet } from '../utils/merchant.js'
import {
  addMinutes, toDatetimeLocal, fromDatetimeLocal,
  computeTravelMetadataHash, buildTravelUrl, saveTravelRequest,
} from '../utils/travel.js'
import { shortAddress } from '../utils/wallet.js'
import { Link } from 'react-router-dom'

function generateTravelRef() {
  return `TRAVEL-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`
}

export default function TravelAgencyPage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isTravelContractConfigured()

  const [form, setForm] = useState({
    agencyName:           '',
    totalPackageAmount:   '',
    initialPaymentAmount: '',
    nonRefundablePct:     '30',
    trancheAmount:        '',
    paymentDueDate:       toDatetimeLocal(addMinutes(5)),
    paymentDeadline:      toDatetimeLocal(addMinutes(10)),
    cancellationDeadline: toDatetimeLocal(addMinutes(15)),
    travelStartDate:      toDatetimeLocal(addMinutes(25)),
    travelRef:            generateTravelRef(),
    description:          '',
    note:                 '',
    preset:               'custom',
  })
  const [travelUrl, setTravelUrl] = useState('')
  const [copied,    setCopied]    = useState(false)
  const [error,     setError]     = useState('')
  const [allowScheduledTranche, setAllowScheduledTranche] = useState(false)

  useEffect(() => {
    if (!address || !isMerchantRegistryConfigured()) return
    Promise.all([
      getMerchantByWallet(address),
      getMerchantPolicyByWallet(address),
    ]).then(([m, p]) => {
      if (m) {
        setForm(prev => ({ ...prev, agencyName: m.tradingName || prev.agencyName }))
      }
      if (p) {
        setAllowScheduledTranche(p.allowScheduledTranche)
        setForm(prev => ({
          ...prev,
          nonRefundablePct: String(Math.round(p.defaultNonRefundableBps / 100)),
        }))
      }
    }).catch(() => {})
  }, [address])

  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function applyPreset(preset) {
    if (preset === 'demo') {
      setForm(prev => ({
        ...prev,
        paymentDueDate:       toDatetimeLocal(addMinutes(5)),
        paymentDeadline:      toDatetimeLocal(addMinutes(10)),
        cancellationDeadline: toDatetimeLocal(addMinutes(15)),
        travelStartDate:      toDatetimeLocal(addMinutes(25)),
        preset: 'demo',
      }))
    } else {
      setForm(prev => ({ ...prev, preset: 'custom' }))
    }
  }

  function validate() {
    if (!isConnected) return 'Connect your wallet first'
    const total   = parseFloat(form.totalPackageAmount)
    const initial = parseFloat(form.initialPaymentAmount)
    const tranche = parseFloat(form.trancheAmount)
    if (!total || total <= 0)           return 'Total package amount required'
    if (!form.travelRef.trim())         return 'Travel reference required'
    const now = Math.floor(Date.now() / 1000)
    const due      = fromDatetimeLocal(form.paymentDueDate)
    const deadline = fromDatetimeLocal(form.paymentDeadline)
    const cancel   = fromDatetimeLocal(form.cancellationDeadline)
    const start    = fromDatetimeLocal(form.travelStartDate)
    if (allowScheduledTranche) {
      if (!initial || initial <= 0)       return 'Initial payment required'
      if (initial > total)                return 'Initial payment exceeds total'
      if (!tranche || tranche <= 0)       return 'Tranche amount required'
      if (initial + tranche > total)      return 'Initial + tranche exceeds total package amount'
      if (due <= now)         return 'Payment due date must be in the future'
      if (deadline <= due)    return 'Payment deadline must be after due date'
      if (cancel <= now)      return 'Cancellation deadline must be in the future'
      if (start <= cancel)    return 'Travel start must be after cancellation deadline'
    } else if (start <= now) {
      return 'Travel start date must be in the future'
    }
    return null
  }

  function handleCreate() {
    setError('')
    const err = validate()
    if (err) { setError(err); return }

    const bps     = Math.round(parseFloat(form.nonRefundablePct) * 100)
    const hash    = computeTravelMetadataHash(form.agencyName, form.description, form.note, form.travelRef)

    const req = {
      merchant:             address,
      agencyName:           form.agencyName.trim(),
      totalPackageAmount:   form.totalPackageAmount,
      initialPaymentAmount: allowScheduledTranche ? form.initialPaymentAmount : '0',
      nonRefundableBps:     bps,
      trancheAmount:        allowScheduledTranche ? form.trancheAmount : '0',
      paymentDueDate:       fromDatetimeLocal(form.paymentDueDate),
      paymentDeadline:      fromDatetimeLocal(form.paymentDeadline),
      cancellationDeadline: fromDatetimeLocal(form.cancellationDeadline),
      travelStartDate:      fromDatetimeLocal(form.travelStartDate),
      travelRef:            form.travelRef.trim(),
      description:          form.description.trim(),
      note:                 form.note.trim(),
      metadataHash:         hash,
      createdAt:            new Date().toISOString(),
      allowScheduledTranche: allowScheduledTranche,
    }

    const url = buildTravelUrl(req)
    saveTravelRequest(req)
    setTravelUrl(url)
  }

  const total   = parseFloat(form.totalPackageAmount || 0)
  const initial = parseFloat(form.initialPaymentAmount || 0)
  const tranche = parseFloat(form.trancheAmount || 0)
  const bps     = Math.round(parseFloat(form.nonRefundablePct || 30) * 100)
  const nonRef  = ((initial * bps) / 10000).toFixed(2)
  const refund  = (initial - parseFloat(nonRef)).toFixed(2)
  const remaining = Math.max(0, total - initial - tranche).toFixed(2)

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, color: 'var(--yellow)', marginBottom: 8 }}>
        Travel Escrow Contract Not Configured
      </h2>
      <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
        Deploy <code>contracts/ArcTravelEscrow.sol</code> via Remix, then update <code>ARCTRAVEL_ESCROW_ADDRESS</code> in <code>src/config.js</code>.
      </p>
      <Link to="/"><button className="btn-ghost">← Back to home</button></Link>
    </div>
  )

  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>✈️</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to create a travel booking request</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  if (travelUrl) return (
    <div className="fade-up">
      <div className="card" style={{ borderColor: 'var(--green-bdr)', background: 'var(--green-bg)', textAlign: 'center', padding: '28px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 20, color: 'var(--green)', marginBottom: 8 }}>
          Travel Booking Request Created
        </h2>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 20 }}>
          Share this link with your customer. They pay the initial amount today and the scheduled tranche later.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => { navigator.clipboard.writeText(travelUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
            className="btn-green" style={{ padding: '10px 24px' }}>
            {copied ? '✓ Copied!' : '🔗 Copy Booking Link'}
          </button>
          <a href={travelUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <button className="btn-ghost" style={{ padding: '10px 20px' }}>Open Checkout →</button>
          </a>
        </div>
      </div>

      {/* Policy summary */}
      <div className="card" style={{ marginBottom: 16, padding: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment schedule</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          <div style={{ padding: 14, background: '#1a0808', border: '1px solid #5a1c1c', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: '#f08080', marginBottom: 4 }}>Non-refundable today</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: '#f04f4f' }}>{nonRef} USDC</div>
          </div>
          <div style={{ padding: 14, background: 'var(--green-bg)', border: '1px solid var(--green-bdr)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--green)', marginBottom: 4 }}>Refundable escrow today</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{refund} USDC</div>
          </div>
          <div style={{ padding: 14, background: '#0a1628', border: '1px solid var(--usdc)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--usdc)', marginBottom: 4 }}>Scheduled tranche</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--usdc)' }}>{tranche.toFixed(2)} USDC</div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          QR Code — Share with customer
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: '#fff', padding: 14, borderRadius: 10 }}>
            <QRCodeSVG value={travelUrl} size={160} />
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button onClick={() => { setTravelUrl(''); setForm(prev => ({ ...prev, travelRef: generateTravelRef() })) }}
          className="btn-ghost" style={{ padding: '10px 24px', fontSize: 13 }}>
          + Create another booking
        </button>
      </div>
    </div>
  )

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Travel Agency</span>
          <span className="badge badge-yellow">Scheduled Payments</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          Create Travel Booking Request
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          Generate a scheduled payment booking link. Customer pays an initial amount today and one future tranche on the scheduled date.
        </p>
      </div>

      <div className="card">
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>Receiving payments to</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(address)}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div>
            <label className="label">Travel Agency / Company Name</label>
            <input name="agencyName" value={form.agencyName} onChange={handleChange} placeholder="e.g. Demo Travel Agency" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Shown to customer on checkout. Not stored on-chain.</div>
          </div>

          {/* Amounts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div>
              <label className="label">Total package (USDC) *</label>
              <input name="totalPackageAmount" value={form.totalPackageAmount} onChange={handleChange} type="number" min="0.01" step="0.01" placeholder="10000.00" />
            </div>
            <div>
              <label className="label">Initial payment today (USDC) *</label>
              <input name="initialPaymentAmount" value={form.initialPaymentAmount} onChange={handleChange} type="number" min="0.01" step="0.01" placeholder="1000.00" />
            </div>
            <div>
              <label className="label">Scheduled tranche (USDC) *</label>
              <input name="trancheAmount" value={form.trancheAmount} onChange={handleChange} type="number" min="0.01" step="0.01" placeholder="3000.00" />
            </div>
          </div>

          {/* Package breakdown */}
          {total > 0 && initial > 0 && tranche > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { label: 'Non-refundable', value: `${nonRef} USDC`, color: '#f04f4f', bg: '#1a0808', border: '#5a1c1c' },
                { label: 'Refundable escrow', value: `${refund} USDC`, color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--green-bdr)' },
                { label: 'Scheduled tranche', value: `${tranche.toFixed(2)} USDC`, color: 'var(--usdc)', bg: '#0a1628', border: 'var(--usdc)' },
                { label: 'Remaining off-chain', value: `${remaining} USDC`, color: 'var(--text3)', bg: 'var(--surface2)', border: 'var(--border)' },
              ].map(s => (
                <div key={s.label} style={{ padding: 10, background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: s.color, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="label">Non-refundable percentage *</label>
            <input name="nonRefundablePct" value={form.nonRefundablePct} onChange={handleChange} type="number" min="0" max="100" step="1" placeholder="30" />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Applied to initial payment only. Default: 30%</div>
          </div>

          <div>
            <label className="label">Travel reference *</label>
            <input name="travelRef" value={form.travelRef} onChange={handleChange} placeholder="TRAVEL-2026-001" maxLength={64} />
          </div>

          {/* Date presets */}
          <div>
            <label className="label">Payment schedule</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button onClick={() => applyPreset('demo')} className={form.preset === 'demo' ? 'btn-primary' : 'btn-ghost'} style={{ fontSize: 11, padding: '5px 12px' }}>
                Demo (2/5/10 min)
              </button>
              <button onClick={() => applyPreset('custom')} className={form.preset === 'custom' ? 'btn-primary' : 'btn-ghost'} style={{ fontSize: 11, padding: '5px 12px' }}>
                Custom
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Tranche due date *</label>
                <input name="paymentDueDate" value={form.paymentDueDate} onChange={handleChange} type="datetime-local" />
              </div>
              <div>
                <label className="label">Tranche payment deadline *</label>
                <input name="paymentDeadline" value={form.paymentDeadline} onChange={handleChange} type="datetime-local" />
              </div>
              <div>
                <label className="label">Cancellation deadline *</label>
                <input name="cancellationDeadline" value={form.cancellationDeadline} onChange={handleChange} type="datetime-local" />
              </div>
              <div>
                <label className="label">Travel start date *</label>
                <input name="travelStartDate" value={form.travelStartDate} onChange={handleChange} type="datetime-local" />
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 6 }}>⚠️ Use Demo preset for testnet demo — all dates in minutes</div>
          </div>

          {/* Scheduled tranche toggle */}
          <div>
            <label className="label">Allow scheduled tranche payment for this booking</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: allowScheduledTranche ? 'var(--green)' : 'var(--text2)' }}>
                  {allowScheduledTranche ? '✓ Scheduled tranche enabled for this booking' : 'Disabled — customer pays full amount only'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>
                  If enabled, the customer checkout will offer both "Pay full now" and "Pay initial + tranche" options.
                </div>
              </div>
              <button
                onClick={() => setAllowScheduledTranche(s => !s)}
                style={{
                  padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                  background: allowScheduledTranche ? 'var(--green)' : 'var(--surface3)',
                  color: allowScheduledTranche ? '#000' : 'var(--text3)',
                }}>
                {allowScheduledTranche ? 'On' : 'Off'}
              </button>
            </div>
          </div>

          {/* Payment method display */}
          <div>
            <label className="label">Payment method</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', opacity: 0.35, cursor: 'not-allowed' }}>
                <span style={{ fontSize: 18 }}>💳</span>
                <span style={{ fontSize: 13, color: 'var(--text3)', fontWeight: 500 }}>Credit / Debit Card</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: '#0a1628', border: '2px solid var(--usdc)' }}>
                <span style={{ fontSize: 18 }}>◆</span>
                <span style={{ fontSize: 13, color: 'var(--usdc)', fontWeight: 600 }}>USDC on Arc Network</span>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Description</label>
            <textarea name="description" value={form.description} onChange={handleChange} rows={2} placeholder="e.g. Maldives 7 nights · Deluxe Villa · All inclusive · Jun 20-27 2026" />
          </div>

          {error && <div className="error-box">{error}</div>}

          <button onClick={handleCreate} className="btn-primary btn-full">
            ✈️ Generate Travel Booking Link
          </button>
        </div>
      </div>
    </div>
  )
}
