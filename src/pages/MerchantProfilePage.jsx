import { useState, useEffect } from 'react'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { shortAddress } from '../utils/wallet.js'
import { isMerchantRegistryConfigured, ARCMERCHANT_REGISTRY_ADDRESS, ARCSCAN_BASE } from '../config.js'
import {
  getMerchantByWallet, getMerchantWallets, getMerchantPolicyByWallet,
  registerMerchant, updateMerchantProfile, updateMerchantPolicy,
  addWallet, removeWallet, deactivateMerchant,
  defaultPolicy, BUSINESS_CATEGORIES,
} from '../utils/merchant.js'
import { Link } from 'react-router-dom'

const EMPTY_FORM = {
  tradingName: '', legalName: '', businessCategory: '',
  website: '', country: '', businessAddress: '',
  businessEmail: '', lei: '', vatOrCompanyId: '', otherPublicIdentifier: '',
}

const pct = bps => (bps / 100).toFixed(0)
const bps = pct => Math.round(parseFloat(pct || 0) * 100)

function Field({ label, name, value, onChange, placeholder, hint, required }) {
  return (
    <div>
      <label className="label">{label}{required && <span style={{ color: 'var(--red)', marginLeft: 3 }}>*</span>}</label>
      <input name={name} value={value} onChange={onChange} placeholder={placeholder} />
      {hint && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}

export default function MerchantProfilePage() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const configured = isMerchantRegistryConfigured()

  const [merchant,   setMerchant]   = useState(null)
  const [policy,     setPolicy]     = useState(defaultPolicy())
  const [wallets,    setWallets]    = useState([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [success,    setSuccess]    = useState('')
  const [saving,     setSaving]     = useState(false)
  const [savingPol,  setSavingPol]  = useState(false)
  const [deact,      setDeact]      = useState(false)
  const [addingW,    setAddingW]    = useState(false)
  const [removingW,  setRemovingW]  = useState(null)
  const [mode,       setMode]       = useState('view') // view | editProfile | editPolicy | register
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [policyForm, setPolicyForm] = useState(defaultPolicy())
  const [newWallet,  setNewWallet]  = useState('')
  // Lookup
  const [lookupInput,   setLookupInput]   = useState('')
  const [lookupResult,  setLookupResult]  = useState(null)
  const [lookupError,   setLookupError]   = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)

  useEffect(() => {
    if (isConnected && address && configured) load()
  }, [address, isConnected, configured])

  async function load() {
    setLoading(true); setError('')
    try {
      const m = await getMerchantByWallet(address)
      setMerchant(m)
      if (m) {
        setForm({ tradingName: m.tradingName, legalName: m.legalName, businessCategory: m.businessCategory, website: m.website, country: m.country, businessAddress: m.businessAddress, businessEmail: m.businessEmail, lei: m.lei, vatOrCompanyId: m.vatOrCompanyId, otherPublicIdentifier: m.otherPublicIdentifier })
        const p = await getMerchantPolicyByWallet(address)
        if (p) { setPolicy(p); setPolicyForm(p) }
        const ws = await getMerchantWallets(m.merchantId)
        setWallets(ws)
      } else {
        setMode('register')
      }
    } catch { setError('Failed to load merchant profile.') }
    finally { setLoading(false) }
  }

  function handleFormChange(e) { setForm(p => ({ ...p, [e.target.name]: e.target.value })) }
  function handlePolicyChange(e) { setPolicyForm(p => ({ ...p, [e.target.name]: e.target.value })) }
  function toggleScheduledTranche() { setPolicyForm(p => ({ ...p, allowScheduledTranche: !p.allowScheduledTranche })) }

  async function handleRegister() {
    if (!form.tradingName.trim()) { setError('Trading name required'); return }
    if (!form.businessCategory.trim()) { setError('Business category required'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      await registerMerchant(address, form)
      setSuccess('Merchant profile registered on-chain.')
      await load(); setMode('view')
    } catch (e) { setError(e.message || 'Registration failed.') }
    finally { setSaving(false) }
  }

  async function handleUpdateProfile() {
    if (!form.tradingName.trim()) { setError('Trading name required'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      await updateMerchantProfile(address, form)
      setSuccess('Profile updated on-chain.')
      await load(); setMode('view')
    } catch (e) { setError(e.message || 'Update failed.') }
    finally { setSaving(false) }
  }

  async function handleUpdatePolicy() {
    setSavingPol(true); setError(''); setSuccess('')
    try {
      await updateMerchantPolicy(address, {
        allowScheduledTranche:     policyForm.allowScheduledTranche,
        defaultNonRefundableBps:   bps(policyForm.defaultNonRefundableBps > 100 ? pct(policyForm.defaultNonRefundableBps) : policyForm.defaultNonRefundableBps),
        defaultInitialPaymentBps:  bps(policyForm.defaultInitialPaymentBps > 100 ? pct(policyForm.defaultInitialPaymentBps) : policyForm.defaultInitialPaymentBps),
        defaultTrancheBps:         bps(policyForm.defaultTrancheBps > 100 ? pct(policyForm.defaultTrancheBps) : policyForm.defaultTrancheBps),
        paymentDueOffsetDays:      parseInt(policyForm.paymentDueOffsetDays || 90),
        paymentDeadlineOffsetDays: parseInt(policyForm.paymentDeadlineOffsetDays || 75),
        cancellationCutoffDays:    parseInt(policyForm.cancellationCutoffDays || 30),
        refundBpsBeforeCutoff:     bps(policyForm.refundBpsBeforeCutoff > 100 ? pct(policyForm.refundBpsBeforeCutoff) : policyForm.refundBpsBeforeCutoff),
        refundBpsAfterCutoff:      bps(policyForm.refundBpsAfterCutoff > 100 ? pct(policyForm.refundBpsAfterCutoff) : policyForm.refundBpsAfterCutoff),
      })
      setSuccess('Policy updated on-chain.')
      await load(); setMode('view')
    } catch (e) { setError(e.message || 'Policy update failed.') }
    finally { setSavingPol(false) }
  }

  async function handleAddWallet() {
    if (!/^0x[0-9a-fA-F]{40}$/.test(newWallet.trim())) { setError('Enter a valid wallet address'); return }
    setAddingW(true); setError(''); setSuccess('')
    try {
      await addWallet(address, newWallet.trim())
      setSuccess('Wallet linked on-chain.'); setNewWallet('')
      const ws = await getMerchantWallets(merchant.merchantId); setWallets(ws)
    } catch (e) { setError(e.message || 'Add wallet failed.') }
    finally { setAddingW(false) }
  }

  async function handleRemoveWallet(w) {
    setRemovingW(w); setError(''); setSuccess('')
    try {
      await removeWallet(address, w)
      setSuccess('Wallet removed.')
      const ws = await getMerchantWallets(merchant.merchantId); setWallets(ws)
    } catch (e) { setError(e.message || 'Remove wallet failed.') }
    finally { setRemovingW(null) }
  }

  async function handleDeactivate() {
    if (!window.confirm('Deactivate your merchant profile? This cannot be undone.')) return
    setDeact(true); setError(''); setSuccess('')
    try { await deactivateMerchant(address); setSuccess('Profile deactivated.'); await load() }
    catch (e) { setError(e.message || 'Deactivation failed.') }
    finally { setDeact(false) }
  }

  async function handleLookup() {
    setLookupLoading(true); setLookupError(''); setLookupResult(null)
    try {
      const input = lookupInput.trim()
      let m = null
      if (/^0x[0-9a-fA-F]{40}$/.test(input)) {
        m = await getMerchantByWallet(input)
      } else if (/^\d+$/.test(input)) {
        const { getMerchant } = await import('../utils/merchant.js')
        m = await getMerchant(parseInt(input))
      }
      if (m) {
        const p = await getMerchantPolicyByWallet(m.ownerWallet)
        setLookupResult({ ...m, policy: p })
      } else setLookupError('No merchant found.')
    } catch { setLookupError('Lookup failed.') }
    finally { setLookupLoading(false) }
  }

  const isOwner = merchant && address?.toLowerCase() === merchant.ownerWallet?.toLowerCase()
  const isLinked = merchant && !isOwner

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 18, color: 'var(--yellow)', marginBottom: 8 }}>Merchant Registry Not Configured</h2>
      <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7 }}>
        Deploy <code>contracts/ArcMerchantRegistry.sol</code> via Remix on Arc Testnet,
        then update <code>ARCMERCHANT_REGISTRY_ADDRESS</code> in <code>src/config.js</code>.
      </p>
    </div>
  )

  if (!isConnected) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🏪</div>
      <p style={{ color: 'var(--text2)', marginBottom: 20 }}>Connect your wallet to access your merchant profile.</p>
      <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 28px' }}>Connect Wallet</button>
    </div>
  )

  if (loading) return <div style={{ textAlign: 'center', padding: '80px 20px' }}><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Merchant Registry</span>
          <span className="badge badge-gray">Self-declared · Arc Testnet</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>Merchant Profile</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          Register a self-declared public merchant profile, link wallets, and publish default payment/refund policies. Merchant-defined policies. Customer-visible terms. On-chain.
        </p>
      </div>

      {/* ── Status card ── */}
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>Connected wallet</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{address}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {merchant ? (
              <>
                <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: merchant.active ? '#071a0f' : '#1a0808', border: `1px solid ${merchant.active ? 'var(--green-bdr)' : '#5a1c1c'}`, color: merchant.active ? 'var(--green)' : '#f08080' }}>
                  {merchant.active ? '● Active' : '○ Inactive'}
                </span>
                <span className="badge badge-blue">Merchant #{merchant.merchantId}</span>
                {isOwner && <span className="badge badge-green">Owner</span>}
                {isLinked && <span className="badge badge-gray">Linked wallet</span>}
              </>
            ) : <span className="badge badge-gray">Not registered</span>}
          </div>
        </div>
        {merchant && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 16 }}>
            {[
              { label: 'Merchant ID',    value: `#${merchant.merchantId}` },
              { label: 'Profile v',      value: `v${merchant.profileVersion}` },
              { label: 'Policy v',       value: `v${policy.policyVersion}` },
              { label: 'Linked wallets', value: wallets.length },
              { label: 'Registered',     value: new Date(merchant.createdAt * 1000).toLocaleDateString() },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}
        {merchant && (
          <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
            Profile hash: {merchant.profileHash}
          </div>
        )}
      </div>

      {/* ── Linked wallet hint ── */}
      {isLinked && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 10, padding: 16, marginBottom: 20, fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
          ℹ️ Linked merchant wallet. Only the owner wallet (<code style={{ fontSize: 11 }}>{shortAddress(merchant.ownerWallet)}</code>) can update profile, policy, or manage linked wallets.
        </div>
      )}

      {/* ── Register form ── */}
      {(mode === 'register') && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Create Merchant Profile</h2>
          <div style={{ background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--yellow)', lineHeight: 1.6 }}>
            ⚠️ Your merchant profile will be published on-chain. Public and permanent. Only publish information that is already public or intended to be public.
          </div>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
            ArcMerchantRegistry records self-declared merchant information. It does not verify identity, business authorisation, or legal ownership.
          </div>
          {profileFormFields(form, handleFormChange)}
          {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
          {success && <div className="success-box" style={{ marginTop: 16 }}>{success}</div>}
          <button onClick={handleRegister} disabled={saving} className="btn-primary" style={{ marginTop: 20, padding: '10px 24px' }}>
            {saving ? <><span className="spinner" />Registering...</> : '🏪 Register on-chain'}
          </button>
        </div>
      )}

      {/* ── View mode ── */}
      {mode === 'view' && merchant && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16 }}>{merchant.tradingName}</h2>
            {isOwner && <button onClick={() => setMode('editProfile')} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>✏️ Edit profile</button>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { k: 'Trading name',   v: merchant.tradingName },
              { k: 'Legal name',     v: merchant.legalName || '—' },
              { k: 'Category',       v: merchant.businessCategory },
              { k: 'Country',        v: merchant.country || '—' },
              { k: 'Website',        v: merchant.website || '—' },
              { k: 'Email',          v: merchant.businessEmail || '—' },
              { k: 'Address',        v: merchant.businessAddress || '—' },
              { k: 'VAT / Company',  v: merchant.vatOrCompanyId || '—' },
              { k: 'LEI',            v: merchant.lei || '—' },
              { k: 'Other ID',       v: merchant.otherPublicIdentifier || '—' },
            ].map(row => (
              <div key={row.k} className="field-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="field-key" style={{ color: 'var(--text3)', fontSize: 13, minWidth: 140 }}>{row.k}</span>
                <span className="field-val normal" style={{ color: 'var(--text)', fontSize: 13, textAlign: 'right', wordBreak: 'break-all' }}>{row.v}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Edit profile form ── */}
      {mode === 'editProfile' && isOwner && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Update Profile</h2>
          {profileFormFields(form, handleFormChange)}
          {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
          {success && <div className="success-box" style={{ marginTop: 16 }}>{success}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={handleUpdateProfile} disabled={saving} className="btn-primary" style={{ padding: '10px 24px' }}>
              {saving ? <><span className="spinner" />Updating...</> : '💾 Update on-chain'}
            </button>
            <button onClick={() => { setMode('view'); setError('') }} className="btn-ghost" style={{ padding: '10px 20px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Default Policy — view ── */}
      {mode === 'view' && merchant && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Default Payment & Refund Policy</h2>
              <p style={{ fontSize: 12, color: 'var(--text3)' }}>These defaults pre-fill new Hotel and Travel payment request forms. Final terms are saved in each individual booking contract.</p>
            </div>
            {isOwner && <button onClick={() => setMode('editPolicy')} className="btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>✏️ Edit policy</button>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            {[
              { label: 'Scheduled tranche',    value: policy.allowScheduledTranche ? '✓ Enabled' : '✗ Disabled', color: policy.allowScheduledTranche ? 'var(--green)' : 'var(--text3)' },
              { label: 'Non-refundable',        value: `${pct(policy.defaultNonRefundableBps)}%` },
              { label: 'Initial payment',       value: `${pct(policy.defaultInitialPaymentBps)}%` },
              { label: 'Tranche payment',       value: `${pct(policy.defaultTrancheBps)}%` },
              { label: 'Payment due offset',    value: `${policy.paymentDueOffsetDays} min` },
              { label: 'Payment deadline',      value: `${policy.paymentDeadlineOffsetDays} min` },
              { label: 'Cancel cutoff',         value: `${policy.cancellationCutoffDays} min` },
              { label: 'Refund before cutoff',  value: `${pct(policy.refundBpsBeforeCutoff)}%` },
              { label: 'Refund after cutoff',   value: `${pct(policy.refundBpsAfterCutoff)}%` },
            ].map(s => (
              <div key={s.label} style={{ padding: '10px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{s.label}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: s.color || 'var(--text)' }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
            Changing merchant defaults does not modify existing bookings or payment requests.
          </div>
        </div>
      )}

      {/* ── Edit policy form ── */}
      {mode === 'editPolicy' && isOwner && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Update Default Policy</h2>
          <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.6 }}>
            These defaults pre-fill new Hotel and Travel payment request forms. They do not modify existing bookings.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Scheduled tranche toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Allow scheduled tranche by default</div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 3 }}>Travel Agency forms will default to scheduled tranche mode when enabled</div>
              </div>
              <button onClick={toggleScheduledTranche} style={{ padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: policyForm.allowScheduledTranche ? 'var(--green)' : 'var(--surface3)', color: policyForm.allowScheduledTranche ? '#000' : 'var(--text3)' }}>
                {policyForm.allowScheduledTranche ? 'Enabled' : 'Disabled'}
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'Non-refundable %',  name: 'defaultNonRefundableBps',  hint: 'Applied to initial payment' },
                { label: 'Initial payment %', name: 'defaultInitialPaymentBps', hint: 'Of total package (Travel)' },
                { label: 'Tranche %',         name: 'defaultTrancheBps',        hint: 'Of total package (Travel)' },
              ].map(f => (
                <div key={f.name}>
                  <label className="label">{f.label}</label>
                  <input type="number" min="0" max="100" step="1" name={f.name}
                    value={policyForm[f.name] > 100 ? pct(policyForm[f.name]) : policyForm[f.name]}
                    onChange={e => setPolicyForm(p => ({ ...p, [e.target.name]: parseFloat(e.target.value || 0) }))} />
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{f.hint}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {[
                { label: 'Payment due offset (minutes — testnet workaround)', name: 'paymentDueOffsetDays' },
                { label: 'Payment deadline offset (minutes — testnet workaround)', name: 'paymentDeadlineOffsetDays' },
                { label: 'Cancellation cutoff (minutes — testnet workaround)', name: 'cancellationCutoffDays' },
              ].map(f => (
                <div key={f.name}>
                  <label className="label">{f.label}</label>
                  <input type="number" min="0" max="3650" step="1" name={f.name}
                    value={policyForm[f.name] ?? ''}
                    onChange={e => setPolicyForm(p => ({ ...p, [e.target.name]: parseInt(e.target.value || 0) }))} />
                </div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Refund % before cutoff', name: 'refundBpsBeforeCutoff' },
                { label: 'Refund % after cutoff',  name: 'refundBpsAfterCutoff' },
              ].map(f => (
                <div key={f.name}>
                  <label className="label">{f.label}</label>
                  <input type="number" min="0" max="100" step="1" name={f.name}
                    value={policyForm[f.name] > 100 ? pct(policyForm[f.name]) : policyForm[f.name]}
                    onChange={e => setPolicyForm(p => ({ ...p, [e.target.name]: parseFloat(e.target.value || 0) }))} />
                </div>
              ))}
            </div>
            {(parseFloat(policyForm.defaultInitialPaymentBps > 100 ? pct(policyForm.defaultInitialPaymentBps) : policyForm.defaultInitialPaymentBps) +
              parseFloat(policyForm.defaultTrancheBps > 100 ? pct(policyForm.defaultTrancheBps) : policyForm.defaultTrancheBps)) > 100 && (
              <div style={{ fontSize: 12, color: 'var(--yellow)', padding: '8px 12px', background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 8 }}>
                ⚠️ Initial % + Tranche % exceeds 100%. Allowed but consider the remaining balance.
              </div>
            )}
          </div>
          {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
          {success && <div className="success-box" style={{ marginTop: 16 }}>{success}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={handleUpdatePolicy} disabled={savingPol} className="btn-primary" style={{ padding: '10px 24px' }}>
              {savingPol ? <><span className="spinner" />Saving...</> : '💾 Save policy on-chain'}
            </button>
            <button onClick={() => { setMode('view'); setError('') }} className="btn-ghost" style={{ padding: '10px 20px' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Linked wallets ── */}
      {merchant && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 16 }}>Linked Wallets ({wallets.length})</h2>
          {wallets.map(w => (
            <div key={w} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{w}</span>
                {w.toLowerCase() === merchant.ownerWallet.toLowerCase() && <span className="badge badge-green" style={{ fontSize: 10 }}>Owner</span>}
                {w.toLowerCase() === address?.toLowerCase() && <span className="badge badge-blue" style={{ fontSize: 10 }}>You</span>}
              </div>
              {isOwner && w.toLowerCase() !== merchant.ownerWallet.toLowerCase() && (
                <button onClick={() => handleRemoveWallet(w)} disabled={removingW === w} className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', borderColor: '#5a1c1c', color: '#f08080' }}>
                  {removingW === w ? 'Removing...' : 'Remove'}
                </button>
              )}
            </div>
          ))}
          {isOwner && (
            <div style={{ marginTop: 16 }}>
              <label className="label">Add linked wallet</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <input value={newWallet} onChange={e => setNewWallet(e.target.value)} placeholder="0x..." style={{ flex: 1 }} />
                <button onClick={handleAddWallet} disabled={addingW} className="btn-primary" style={{ padding: '10px 18px', flexShrink: 0 }}>
                  {addingW ? <><span className="spinner" />Adding...</> : '+ Add wallet'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, lineHeight: 1.5 }}>
                Linked wallets can use this merchant profile for pre-filled ArcPay checkout flows. Only the owner wallet can update profile, policy, or manage wallets.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Errors / success ── */}
      {error && mode === 'view' && <div className="error-box" style={{ marginBottom: 16 }}>{error}</div>}
      {success && mode === 'view' && <div className="success-box" style={{ marginBottom: 16 }}>{success}</div>}

      {/* ── Deactivate ── */}
      {isOwner && merchant?.active && (
        <div style={{ marginBottom: 20 }}>
          <button onClick={handleDeactivate} disabled={deact} className="btn-ghost" style={{ fontSize: 12, padding: '8px 16px', borderColor: '#5a1c1c', color: '#f08080' }}>
            {deact ? 'Deactivating...' : 'Deactivate profile'}
          </button>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Deactivation is permanent. Profile stays on-chain but marked inactive.</div>
        </div>
      )}

      {/* ── Merchant lookup ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Look up merchant</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <input value={lookupInput} onChange={e => setLookupInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLookup()} placeholder="Wallet address (0x...) or merchant ID" style={{ flex: 1 }} />
          <button onClick={handleLookup} disabled={lookupLoading} className="btn-primary" style={{ padding: '10px 18px', flexShrink: 0 }}>
            {lookupLoading ? <><span className="spinner" />...</> : '🔍 Look up'}
          </button>
        </div>
        {lookupError && <div className="error-box">{lookupError}</div>}
        {lookupResult && (
          <div style={{ padding: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{lookupResult.tradingName}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{lookupResult.businessCategory}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="badge badge-blue">Merchant #{lookupResult.merchantId}</span>
                <div style={{ fontSize: 11, color: lookupResult.active ? 'var(--green)' : '#f08080', marginTop: 4 }}>
                  {lookupResult.active ? '● Active' : '○ Inactive'}
                </div>
              </div>
            </div>
            {lookupResult.policy && (
              <div style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 10 }}>
                <div>Tranche: {lookupResult.policy.allowScheduledTranche ? '✓ Enabled' : '✗ Disabled'}</div>
                <div>Non-refundable: {pct(lookupResult.policy.defaultNonRefundableBps)}%</div>
                <div>Refund before cutoff: {pct(lookupResult.policy.refundBpsBeforeCutoff)}%</div>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Profile v{lookupResult.profileVersion} · Registered {new Date(lookupResult.createdAt * 1000).toLocaleDateString()} · Self-declared public data
            </div>
          </div>
        )}
      </div>

      {/* Disclaimer */}
      <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text2)' }}>Self-declared public merchant profiles and policies.</strong> ArcMerchantRegistry records merchant-declared public business information and default policy settings on Arc Testnet. It does not verify merchant identity, business authorisation, or legal ownership. Profile and policy data is public and permanently stored on-chain.
      </div>
    </div>
  )
}

function profileFormFields(form, onChange) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Trading Name" name="tradingName" value={form.tradingName} onChange={onChange} placeholder="Demo Luxury Boutique" required hint="Public business name shown on receipts" />
        <div>
          <label className="label">Business Category <span style={{ color: 'var(--red)' }}>*</span></label>
          <select name="businessCategory" value={form.businessCategory} onChange={onChange}>
            <option value="">Select category...</option>
            {['Hotel / Hospitality','Luxury Retail','Boutique','Travel Agency','Online Merchant','Freelancer / Consultant','B2B Services','Charity / Non-profit','E-commerce','Real Estate','Other'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Legal Name" name="legalName" value={form.legalName} onChange={onChange} placeholder="Demo Boutique S.r.l." hint="Optional" />
        <Field label="Country" name="country" value={form.country} onChange={onChange} placeholder="Italy" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Website" name="website" value={form.website} onChange={onChange} placeholder="https://example.com" />
        <Field label="Business Email" name="businessEmail" value={form.businessEmail} onChange={onChange} placeholder="info@example.com" hint="Public contact email only" />
      </div>
      <Field label="Business Address" name="businessAddress" value={form.businessAddress} onChange={onChange} placeholder="Via Roma 1, 00100 Rome, Italy" hint="Public address only" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="VAT / Company ID" name="vatOrCompanyId" value={form.vatOrCompanyId} onChange={onChange} placeholder="IT12345678901" />
        <Field label="LEI" name="lei" value={form.lei} onChange={onChange} placeholder="Optional" hint="Legal Entity Identifier" />
        <Field label="Other Public ID" name="otherPublicIdentifier" value={form.otherPublicIdentifier} onChange={onChange} placeholder="Optional" />
      </div>
    </div>
  )
}
