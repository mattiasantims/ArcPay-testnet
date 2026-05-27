import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import {
  fetchTravelBooking, fromUsdc,
  TRAVEL_STATUS_LABEL, TRAVEL_STATUS_COLOR,
  executeRequestTranche, executePayTranche,
  executeCancelBeforeDeadline, executeCancelForMissedPayment,
  executeReleaseAfterDeadline,
  getCachedTravelTxHash, fetchTravelTxHashes,
} from '../utils/travel.js'
import {
  buildTravelReceiptObject, downloadTravelReceiptPDF, downloadTravelReceiptJSON,
  buildTrancheReceiptObject, downloadTrancheReceiptPDF, downloadTrancheReceiptJSON,
  downloadTravelCancelPDF, downloadTravelReleasePDF, downloadTrancheRequestPDF, downloadFullTravelPDF,
} from '../utils/travelPdf.js'
import { getMerchantByWallet } from '../utils/merchant.js'
import { shortAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, isTravelContractConfigured, isMerchantRegistryConfigured, APP_URL } from '../config.js'

export default function TravelDetailsPage() {
  const { id }     = useParams()
  const [params]   = useSearchParams()
  const { address, isConnected } = useAccount()
  const { open }   = useWeb3Modal()

  const [travel,          setTravel]          = useState(null)
  const [merchantProfile, setMerchantProfile] = useState(null)
  const [txHashes,  setTxHashes]  = useState({ createHash: null, cancelHash: null, releaseHash: null, trancheReqHash: null, tranchePaidHash: null })
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')
  const [acting,   setActing]   = useState(null)
  const [now,      setNow]      = useState(Math.floor(Date.now() / 1000))
  const configured = isTravelContractConfigured()

  const agencyName = params.get('name') || ''
  const description = params.get('desc') || ''

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (configured) load() }, [id, configured])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const t = await fetchTravelBooking(id)
      if (!t) {
        setTravel(null)
        setError(`Travel booking #${id} not found. It may have been created on a previous contract version.`)
        return
      }
      setTravel(t)
      fetchTravelTxHashes(t).then(setTxHashes).catch(() => {})
      if (isMerchantRegistryConfigured()) {
        getMerchantByWallet(t.merchant).then(m => {
          if (m && m.active) setMerchantProfile(m)
        }).catch(() => {})
      }
    } catch (e) {
      setError(`Failed to load booking: ${e?.message || 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  async function act(fn, label) {
    setActing(label); setError('')
    try { await fn(); await load() }
    catch (e) { setError(e.message || `${label} failed.`) }
    finally { setActing(null) }
  }

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)' }}>Travel escrow contract not configured.</p>
    </div>
  )

  if (loading) return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
    </div>
  )

  if (!travel) return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48 }}>
      <p style={{ color: 'var(--text2)' }}>{error || 'Travel booking not found.'}</p>
    </div>
  )

  const isCustomer = address?.toLowerCase() === travel.customer?.toLowerCase()
  const isMerchant = address?.toLowerCase() === travel.merchant?.toLowerCase()
  const status     = travel.status
  const isActive   = status === 0
  const isTranchePaid = status === 1
  const isClosed   = status >= 2

  const beforeCancelDl   = now < travel.cancellationDeadline
  const afterCancelDl    = now >= travel.cancellationDeadline
  const afterDueDate     = now >= travel.paymentDueDate
  const beforeDeadline   = now <= travel.paymentDeadline
  const afterDeadline    = now > travel.paymentDeadline

  const countdown = (ts) => {
    const diff = ts - now
    if (diff <= 0) return 'Passed'
    const m = Math.floor(diff / 60)
    const s = diff % 60
    if (m > 60) return `${Math.floor(m/60)}h ${m%60}m`
    return `${m}m ${s}s`
  }

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Travel Agency</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: `${TRAVEL_STATUS_COLOR[status]}22`, border: `1px solid ${TRAVEL_STATUS_COLOR[status]}44`, color: TRAVEL_STATUS_COLOR[status], fontFamily: 'var(--mono)' }}>
            {TRAVEL_STATUS_LABEL[status]}
          </span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>
          Travel Booking · {travel.travelRef || `#${travel.travelId}`}
        </h1>
        {agencyName && <div style={{ fontSize: 14, color: 'var(--text2)' }}>{agencyName}</div>}
        {(travel?.description || description) && <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 2 }}>{travel?.description || description}</div>}
      </div>

      {/* Financial summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Package',       value: `${fromUsdc(travel.totalPackageAmount).toFixed(2)} USDC`,   color: 'var(--text)' },
          { label: 'Initial Paid',        value: `${fromUsdc(travel.initialPaymentAmount).toFixed(2)} USDC`, color: 'var(--usdc)' },
          { label: 'Non-refundable',      value: `${fromUsdc(travel.nonRefundableAmount).toFixed(2)} USDC`,  color: '#f04f4f' },
          { label: 'Refundable Escrow',   value: `${fromUsdc(travel.refundableEscrowAmount).toFixed(2)} USDC`, color: 'var(--green)' },
          { label: 'Scheduled Tranche',   value: `${fromUsdc(travel.trancheAmount).toFixed(2)} USDC`,        color: 'var(--usdc)' },
          { label: 'Tranche Status',      value: travel.tranchePaid ? 'Paid ✓' : travel.trancheRequested ? 'Requested' : 'Pending', color: travel.tranchePaid ? 'var(--green)' : 'var(--text2)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: 14, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Payment timeline</div>
        {[
          { label: 'Tranche due', ts: travel.paymentDueDate, done: afterDueDate },
          { label: 'Tranche deadline', ts: travel.paymentDeadline, done: afterDeadline },
          { label: 'Cancellation deadline', ts: travel.cancellationDeadline, done: afterCancelDl },
          { label: 'Travel start', ts: travel.travelStartDate, done: now >= travel.travelStartDate },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, color: item.done ? 'var(--text3)' : 'var(--text)' }}>{item.label}</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{new Date(item.ts * 1000).toLocaleString()}</div>
              {!item.done && <div style={{ fontSize: 11, color: 'var(--green)' }}>⏱ {countdown(item.ts)}</div>}
              {item.done && <div style={{ fontSize: 11, color: 'var(--text3)' }}>Passed</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      {!isConnected && (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
          <button onClick={() => open()} className="btn-primary" style={{ padding: '10px 24px' }}>Connect Wallet for Actions</button>
        </div>
      )}

      {isConnected && (
        <div className="card" style={{ marginBottom: 20, padding: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Available actions</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

            {/* Merchant: request tranche */}
            {isMerchant && isActive && afterDueDate && beforeDeadline && !travel.trancheRequested && (
              <button onClick={() => act(() => executeRequestTranche(address, travel.travelId), 'request')}
                disabled={acting === 'request'} className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
                {acting === 'request' ? <><span className="spinner" />Requesting...</> : '📨 Request tranche payment'}
              </button>
            )}

            {/* Customer: pay tranche */}
            {isCustomer && isActive && beforeDeadline && !travel.tranchePaid && (
              <button onClick={() => act(() => executePayTranche(address, travel.travelId, fromUsdc(travel.trancheAmount)), 'tranche')}
                disabled={acting === 'tranche'} className="btn-primary" style={{ fontSize: 12, padding: '8px 16px' }}>
                {acting === 'tranche' ? <><span className="spinner" />Paying...</> : `💳 Pay tranche (${fromUsdc(travel.trancheAmount).toFixed(2)} USDC)`}
              </button>
            )}

            {/* Customer or merchant: cancel before deadline */}
            {(isCustomer || isMerchant) && (isActive || isTranchePaid) && beforeCancelDl && (
              <button onClick={() => act(() => executeCancelBeforeDeadline(address, travel.travelId), 'cancel')}
                disabled={acting === 'cancel'}
                style={{ fontSize: 12, padding: '8px 16px', background: '#1a0808', border: '1px solid #f0c040', color: '#f0c040', borderRadius: 8, cursor: 'pointer' }}>
                {acting === 'cancel' ? '⏳ Cancelling...' : '✕ Cancel booking (refund escrow)'}
              </button>
            )}

            {/* Merchant: cancel for missed payment */}
            {isMerchant && isActive && !travel.tranchePaid && afterDeadline && (
              <button onClick={() => act(() => executeCancelForMissedPayment(address, travel.travelId), 'missed')}
                disabled={acting === 'missed'}
                style={{ fontSize: 12, padding: '8px 16px', background: '#1a0808', border: '1px solid #f04f4f', color: '#f08080', borderRadius: 8, cursor: 'pointer' }}>
                {acting === 'missed' ? '⏳ Cancelling...' : '⚠️ Cancel — missed payment'}
              </button>
            )}

            {/* Merchant only: release escrow after cancellation deadline — solo se tranche pagata o booking attivo senza tranche mancata */}
            {isMerchant && afterCancelDl && (isActive || isTranchePaid) && (travel.tranchePaid || !afterDeadline) && (
              <button onClick={() => act(() => executeReleaseAfterDeadline(address, travel.travelId), 'release')}
                disabled={acting === 'release'} className="btn-green" style={{ fontSize: 12, padding: '8px 16px' }}>
                {acting === 'release' ? <><span className="spinner" />Releasing...</> : '✈️ Release escrow to agency'}
              </button>
            )}

            {isClosed && (
              <div style={{ fontSize: 13, color: 'var(--text3)', padding: '8px 0' }}>
                This booking is closed — no further actions available.
              </div>
            )}
          </div>
          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
        </div>
      )}

      {/* Receipts & Events */}
      {travel && (() => {
        const { createHash, cancelHash, releaseHash, trancheReqHash, tranchePaidHash } = txHashes
        const ARCSCAN = 'https://testnet.arcscan.app'
        const ts = (unix) => unix && Number(unix) > 0 ? new Date(Number(unix) * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : null
        const fmt = raw => fromUsdc(raw).toFixed(2)
        const receipt = buildTravelReceiptObject({ travel, txHash: createHash || getCachedTravelTxHash(travel.travelId), travelId: travel.travelId, agencyName, description, merchantProfile })

        const events = []
        events.push({
          label:     'Travel Booking Created',
          txHash:    createHash || getCachedTravelTxHash(travel.travelId),
          timestamp: ts(travel.createdAt),
          detail:    `${fmt(travel.initialPaymentAmount)} USDC initial payment · ${travel.travelRef}`,
          pdf:       () => downloadTravelReceiptPDF(receipt),
        })
        if (travel.trancheRequested) {
          events.push({
            label:     'Tranche Payment Requested',
            txHash:    trancheReqHash,
            timestamp: null,
            detail:    `${fmt(travel.trancheAmount)} USDC tranche requested by merchant`,
            pdf:       () => downloadTrancheRequestPDF(receipt, trancheReqHash),
          })
        }
        if (travel.tranchePaid) {
          const trancheReceipt = buildTrancheReceiptObject({ travel, txHash: tranchePaidHash, travelId: travel.travelId, agencyName, merchantProfile })
          events.push({
            label:     'Tranche Payment Paid',
            txHash:    tranchePaidHash,
            timestamp: ts(travel.tranchePaidAt),
            detail:    `${fmt(travel.trancheAmount)} USDC tranche paid`,
            pdf:       () => downloadTrancheReceiptPDF(trancheReceipt),
          })
        }
        if (travel.status === 2) {
          events.push({
            label:     'Travel Cancelled Before Deadline',
            txHash:    cancelHash,
            timestamp: ts(travel.closedAt),
            detail:    `${fmt(travel.refundableEscrowAmount)} USDC refunded to customer`,
            pdf:       () => downloadTravelCancelPDF(receipt, cancelHash, false),
          })
        }
        if (travel.status === 3) {
          events.push({
            label:     'Travel Cancelled for Missed Payment',
            txHash:    cancelHash,
            timestamp: ts(travel.closedAt),
            detail:    `${fmt(travel.refundableEscrowAmount)} USDC released to merchant`,
            pdf:       () => downloadTravelCancelPDF(receipt, cancelHash, true),
          })
        }
        if (travel.status === 4) {
          events.push({
            label:     'Escrow Released to Merchant',
            txHash:    releaseHash,
            timestamp: ts(travel.closedAt),
            detail:    `${fmt(travel.refundableEscrowAmount)} USDC released to merchant`,
            pdf:       () => downloadTravelReleasePDF(receipt, releaseHash),
          })
        }

        return (
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Receipts & Events
            </div>
            <div style={{ marginBottom: 14 }}>
              {events.map((ev, i) => (
                <div key={i} style={{
                  padding: '11px 0',
                  borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                  gap: 8, flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{ev.label}</div>
                    {ev.detail    && <div style={{ fontSize: 11, color: 'var(--text2)' }}>{ev.detail}</div>}
                    {ev.timestamp && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{ev.timestamp}</div>}
                    {ev.txHash    && (
                      <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)', marginTop: 3, wordBreak: 'break-all' }}>
                        TX: {ev.txHash}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {ev.pdf && (
                      <button onClick={ev.pdf} className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>🖨️ PDF</button>
                    )}
                    {ev.txHash ? (
                      <a href={`${ARCSCAN}/tx/${ev.txHash}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                        <button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>ArcScan ↗</button>
                      </a>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--text3)', padding: '3px 0', fontStyle: 'italic' }}>recovering...</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => downloadFullTravelPDF(receipt, events)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                🖨️ Full PDF (all events)
              </button>
              <button onClick={() => downloadTravelReceiptJSON(receipt)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>📄 JSON</button>
              <button onClick={() => navigator.clipboard.writeText(`${APP_URL}/travel/${travel.travelId}`)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                🔗 Copy link
              </button>
            </div>
          </div>
        )
      })()}

      {/* Details */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Booking details</div>
        {[
          { k: 'Travel Ref',     v: travel.travelRef },
          { k: 'Customer',       v: travel.customer },
          { k: 'Agency',         v: travel.merchant },
          { k: 'Created',        v: new Date(travel.createdAt * 1000).toLocaleString() },
          { k: 'Closed',         v: travel.closedAt ? new Date(travel.closedAt * 1000).toLocaleString() : '—' },
          { k: 'Block',          v: travel.createdBlock.toString() },
          { k: 'Metadata hash',  v: travel.metadataHash },
        ].map(row => (
          <div key={row.k} className="field-row">
            <span className="field-key">{row.k}</span>
            <span className="field-val" style={{ fontSize: 11 }}>{row.v}</span>
          </div>
        ))}
        {/* ArcScan + Copy Link */}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {getCachedTravelTxHash && getCachedTravelTxHash(travel.travelId) && (
            <a href={`${ARCSCAN_BASE}/tx/${getCachedTravelTxHash(travel.travelId)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>🔍 ArcScan ↗</button>
            </a>
          )}
          <button className="btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => navigator.clipboard.writeText(window.location.href)}>
            🔗 Copy link
          </button>
        </div>
      </div>

      {/* QR — share receipt */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Share this receipt
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: '#fff', padding: 14, borderRadius: 12 }}>
            <QRCodeSVG value={`${APP_URL}/travel/${id}`} size={160} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
            {`${APP_URL}/travel/${id}`}
          </p>
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
        <strong style={{ color: 'var(--text2)' }}>Note:</strong> Only the refundable escrow from the initial payment is managed by this contract. If a tranche was already paid directly to the agency, tranche refund treatment is outside this contract scope. TESTNET ONLY.
      </div>
    </div>
  )
}
