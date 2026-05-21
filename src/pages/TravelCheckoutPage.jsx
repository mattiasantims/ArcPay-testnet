import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { decodeTravelRequest, approveTravelUsdc, executeCreateTravelBooking, cacheTravelTxHash } from '../utils/travel.js'
import { approveUsdc, executePayment, computeMetadataHash, getUsdcBalance } from '../utils/receipts.js'
import { shortAddress } from '../utils/wallet.js'
import { isTravelContractConfigured, ARCPROOF_ADDRESS } from '../config.js'

export default function TravelCheckoutPage() {
  const [params]   = useSearchParams()
  const navigate   = useNavigate()
  const { address, isConnected } = useAccount()
  const { open }   = useWeb3Modal()

  const [req,       setReq]       = useState(null)
  const [balance,   setBalance]   = useState(null)
  const [step,      setStep]      = useState('idle')
  const [error,     setError]     = useState('')
  const [payMethod, setPayMethod] = useState('usdc')   // always usdc
  const [payMode,   setPayMode]   = useState(null)   // null | 'full' | 'tranche'
  const configured = isTravelContractConfigured()

  useEffect(() => {
    const r = params.get('r')
    if (r) {
      const decoded = decodeTravelRequest(r)
      if (decoded) setReq(decoded)
      else setError('Invalid travel booking request. The link may be corrupted.')
    } else setError('Missing booking request parameters.')
  }, [params])

  useEffect(() => {
    if (isConnected && address) {
      getUsdcBalance(address).then(setBalance).catch(() => {})
    }
  }, [address, isConnected])

  // Pay full amount via ArcProof
  async function handlePayFull() {
    if (!address || !req) return
    setError('')
    const metadataHash = computeMetadataHash(
      req.description || '',
      req.note || '',
      req.agencyName || ''
    )
    try {
      setStep('approving')
      await approveUsdc(address, req.totalPackageAmount)
      setStep('paying')
      const { proofId } = await executePayment({
        account:     address,
        payee:       req.merchant,
        amountHuman: req.totalPackageAmount,
        paymentRef:  req.travelRef,
        purposeCode: 'SERVICE',
        description: req.description || '',
        metadataHash,
      })
      navigate(`/receipt/${proofId}?name=${encodeURIComponent(req.agencyName || '')}&desc=${encodeURIComponent(req.description || '')}`)
    } catch (e) {
      setError(e.message || 'Full payment failed.')
      setStep('idle')
    }
  }

  // Pay initial + schedule tranche via ArcTravelEscrow
  async function handlePayTranche() {
    if (!address || !req) return
    setError('')
    try {
      setStep('approving')
      await approveTravelUsdc(address, req.initialPaymentAmount)
      setStep('paying')
      const { travelId, hash } = await executeCreateTravelBooking({
        account:              address,
        merchant:             req.merchant,
        totalPackageAmount:   req.totalPackageAmount,
        initialPaymentAmount: req.initialPaymentAmount,
        nonRefundableBps:     req.nonRefundableBps,
        trancheAmount:        req.trancheAmount,
        paymentDueDate:       req.paymentDueDate,
        paymentDeadline:      req.paymentDeadline,
        cancellationDeadline: req.cancellationDeadline,
        travelStartDate:      req.travelStartDate,
        travelRef:            req.travelRef,
        metadataHash:         req.metadataHash,
      })
      if (travelId) cacheTravelTxHash(travelId, hash)
      navigate(`/travel/${travelId || 1}?name=${encodeURIComponent(req.agencyName || '')}&desc=${encodeURIComponent(req.description || '')}`)
    } catch (e) {
      setError(e.message || 'Transaction failed.')
      setStep('idle')
    }
  }

  if (req?.allowScheduledTranche === true && !configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)' }}>Travel escrow contract not configured. Full payment uses ArcProof, but scheduled tranche requires ArcTravelEscrow.</p>
    </div>
  )
  if (error && !req) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48, maxWidth: 520, margin: '0 auto' }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
      <p style={{ color: 'var(--text2)' }}>{error}</p>
    </div>
  )
  if (!req) return <div style={{ textAlign: 'center', padding: '80px 20px' }}><span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} /></div>

  const isLoading = step === 'approving' || step === 'paying'
  const bps     = parseInt(req.nonRefundableBps || 3000)
  const initial = parseFloat(req.initialPaymentAmount || 0)
  const nonRef  = ((initial * bps) / 10000).toFixed(2)
  const refund  = (initial - parseFloat(nonRef)).toFixed(2)
  const tranche = parseFloat(req.trancheAmount || 0)
  const total   = parseFloat(req.totalPackageAmount || 0)
  const pct     = Math.round(bps / 100)
  const dueDate   = new Date(req.paymentDueDate * 1000).toLocaleString()
  const deadline  = new Date(req.paymentDeadline * 1000).toLocaleString()
  const cancelDl  = new Date(req.cancellationDeadline * 1000).toLocaleString()
  const startDate = new Date(req.travelStartDate * 1000).toLocaleString()

  const allowTranche = req.allowScheduledTranche === true

  return (
    <div className="fade-up" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Travel Booking</div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px' }}>
          {req.agencyName || shortAddress(req.merchant)}
        </h1>
        {req.description && <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 6 }}>{req.description}</p>}
      </div>

      {/* Booking summary */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Travel Package</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{req.travelRef}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Total package</div>
            <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-1px', lineHeight: 1 }}>{total.toFixed(2)}</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>USDC</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <div><span style={{ color: 'var(--text3)' }}>Travel start:</span> {startDate}</div>
          <div><span style={{ color: 'var(--text3)' }}>Cancel by:</span> {cancelDl}</div>
        </div>
      </div>

      {/* Payment method: card vs USDC */}
      {!payMethod && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Select payment method
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', opacity: 0.35, cursor: 'not-allowed' }}>
              <div style={{ fontSize: 22 }}>💳</div>
              <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text3)' }}>Credit / Debit Card</div>
            </div>
            <div onClick={() => setPayMethod('usdc')} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, background: '#0a1628', border: '2px solid var(--usdc)', cursor: 'pointer' }}>
              <div style={{ fontSize: 22 }}>◆</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--usdc)' }}>Pay with USDC on Arc</div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>On-chain · Instant receipt · WalletConnect supported</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* USDC selected: choose full or tranche */}
      {payMethod === 'usdc' && !payMode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Payment options offered by this agency
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Pay full now */}
            <div onClick={() => setPayMode('full')} style={{ padding: '16px', borderRadius: 10, background: '#0a1628', border: '2px solid var(--usdc)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--usdc)', marginBottom: 4 }}>Pay full amount now</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>One payment · Instant receipt via ArcProof · No escrow</div>
                </div>
                <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 800, color: 'var(--usdc)' }}>{total.toFixed(2)} USDC</div>
              </div>
            </div>

            {/* Pay initial + tranche */}
            {allowTranche && (
              <div onClick={() => setPayMode('tranche')} style={{ padding: '16px', borderRadius: 10, background: 'var(--green-bg)', border: '2px solid var(--green-bdr)', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--green)', marginBottom: 4 }}>Pay initial + scheduled tranche</div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>Initial today · Future tranche on scheduled date · Escrow protected</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      <div style={{ fontSize: 11, color: '#f08080' }}>Non-refundable: {nonRef} USDC</div>
                      <div style={{ fontSize: 11, color: 'var(--green)' }}>Escrow: {refund} USDC</div>
                      <div style={{ fontSize: 11, color: 'var(--usdc)' }}>Tranche: {tranche.toFixed(2)} USDC ({dueDate})</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                    <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{initial.toFixed(2)} USDC today</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>+ {tranche.toFixed(2)} on {dueDate}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Full payment flow */}
      {payMethod === 'usdc' && payMode === 'full' && (
        <div>
          <div className="card" style={{ marginBottom: 16, padding: 14, background: '#0a1628', border: '1px solid var(--usdc)' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--usdc)', marginBottom: 4 }}>Pay full amount now</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>One payment of <strong>{total.toFixed(2)} USDC</strong> · Powered by ArcProof · Instant receipt</div>
          </div>
          {isLoading && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="spinner" />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {step === 'approving' ? 'Step 1/2 — Approving USDC...' : 'Step 2/2 — Sending payment...'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Confirm in MetaMask</div>
                </div>
              </div>
            </div>
          )}
          {!isConnected ? (
            <button onClick={() => open()} className="btn-primary btn-full" style={{ marginBottom: 12 }}>
              🔗 Connect Wallet to Pay
            </button>
          ) : (
            <div>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>Paying from</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(address)}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--usdc)', fontWeight: 600 }}>{balance} USDC</div>
              </div>
              <button onClick={handlePayFull} disabled={isLoading} className="btn-primary btn-full" style={{ marginBottom: 8 }}>
                {step === 'idle'      && `✈️ Pay ${total.toFixed(2)} USDC — Full Payment`}
                {step === 'approving' && <><span className="spinner" />Approving USDC...</>}
                {step === 'paying'    && <><span className="spinner" />Processing payment...</>}
              </button>
            </div>
          )}
          <button onClick={() => setPayMode(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
            ← Change payment option
          </button>
        </div>
      )}

      {/* Tranche payment flow */}
      {payMethod === 'usdc' && payMode === 'tranche' && (
        <div>
          <div className="card" style={{ marginBottom: 16, padding: 14, background: 'var(--green-bg)', border: '1px solid var(--green-bdr)' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--green)', marginBottom: 4 }}>Pay initial + scheduled tranche</div>
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              Pay <strong>{initial.toFixed(2)} USDC today</strong> ({nonRef} USDC non-refundable + {refund} USDC in escrow).
              Next tranche of <strong>{tranche.toFixed(2)} USDC</strong> due on {dueDate}.
            </div>
          </div>
          {isLoading && (
            <div className="card" style={{ marginBottom: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="spinner" />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>
                    {step === 'approving' ? 'Step 1/2 — Approving USDC...' : 'Step 2/2 — Creating travel booking...'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>Confirm in MetaMask</div>
                </div>
              </div>
            </div>
          )}
          {!isConnected ? (
            <button onClick={() => open()} className="btn-primary btn-full" style={{ marginBottom: 12 }}>
              🔗 Connect Wallet to Pay
            </button>
          ) : (
            <div>
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)' }}>Paying from</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{shortAddress(address)}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--usdc)', fontWeight: 600 }}>{balance} USDC</div>
              </div>
              <button onClick={handlePayTranche} disabled={isLoading} className="btn-primary btn-full" style={{ marginBottom: 8 }}>
                {step === 'idle'      && `✈️ Pay ${initial.toFixed(2)} USDC — Initial Travel Payment`}
                {step === 'approving' && <><span className="spinner" />Approving USDC...</>}
                {step === 'paying'    && <><span className="spinner" />Creating travel booking...</>}
              </button>
              <p style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginBottom: 12 }}>
                2 MetaMask confirmations · {nonRef} USDC to agency now · {refund} USDC held in escrow
              </p>
            </div>
          )}
          <button onClick={() => setPayMode(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 12, cursor: 'pointer', marginBottom: 12, padding: 0 }}>
            ← Change payment option
          </button>
        </div>
      )}

      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text2)' }}>TESTNET ONLY.</strong> Not a lending, financing, or credit product. ArcPay does not advance funds. Full payment uses ArcProof. Scheduled tranche uses ArcTravelEscrow.
      </div>
    </div>
  )
}
