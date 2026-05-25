import { useState, useEffect } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useParams, useSearchParams } from 'react-router-dom'
import {
  fetchBooking, formatUsdc, formatTs, formatDeadlineCountdown,
  buildBookingReceiptObject, executeCancelBeforeDeadline,
  executeReleaseAfterDeadline, BOOKING_STATUS_LABEL,
} from '../utils/booking.js'
import { getCachedBookingTxHash } from '../utils/bookingRequest.js'
import { fetchBookingTxHashes, getCachedCancelBookingTxHash, getCachedReleaseBookingTxHash } from '../utils/booking.js'
import { shortAddress } from '../utils/wallet.js'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount } from 'wagmi'
import { isMerchantRegistryConfigured, APP_URL } from '../config.js'
import { getMerchantByWallet, getMerchantPolicyByWallet } from '../utils/merchant.js'
import { downloadBookingPDF, downloadCancelBookingPDF, downloadReleaseBookingPDF, downloadFullBookingPDF } from '../utils/bookingPdf.js'
import { ARCSCAN_BASE, isBookingContractConfigured } from '../config.js'
import BookingStatusBadge from '../components/BookingStatusBadge.jsx'
import BookingActions from '../components/BookingActions.jsx'

export default function BookingDetailsPage() {
  const { id }     = useParams()
  const [params]   = useSearchParams()
  const merchantName = params.get('name') ? decodeURIComponent(params.get('name')) : null
  const description  = params.get('desc') ? decodeURIComponent(params.get('desc')) : null

  const [booking,  setBooking]  = useState(null)
  const [status,   setStatus]   = useState('loading')
  const [txHash,   setTxHash]   = useState(null)
  const [txHashes, setTxHashes] = useState({ createHash: null, cancelHash: null, releaseHash: null })
  const { address: connectedAddress } = useAccount()
  const { open } = useWeb3Modal()
  const account = connectedAddress || null
  const [loading,  setLoading]  = useState(false)
  const [merchantProfile, setMerchantProfile] = useState(null)
  const [allowRefund, setAllowRefund] = useState(true)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState('')
  const [now,      setNow]      = useState(Math.floor(Date.now()/1000))
  const configured = isBookingContractConfigured()

  useEffect(() => { if (configured) load() }, [id, configured])

  // Carica profilo merchant dal registry
  useEffect(() => {
    if (!booking?.merchant || !isMerchantRegistryConfigured()) return
    getMerchantByWallet(booking.merchant).then(m => {
      if (m?.merchantId) getMerchantPolicyByWallet(booking.merchant).then(p => setAllowRefund(p?.allowRefund ?? true)).catch(() => {})
      if (m && m.active) setMerchantProfile(m)
    }).catch(() => {})
  }, [booking?.merchant])
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now()/1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Load TX hashes from on-chain logs
  useEffect(() => {
    if (!booking) return
    fetchBookingTxHashes(booking).then(hashes => setTxHashes(hashes)).catch(() => {})
  }, [booking?.bookingId, booking?.status])

  async function load() {
    setStatus('loading')
    try {
      const data = await fetchBooking(id)
      if (!data) { setStatus('notfound'); return }
      setBooking(data)
      const cached = getCachedBookingTxHash(id)
      if (cached) setTxHash(cached)
      setStatus('found')
    } catch (e) { console.error(e); setStatus('error') }
  }

  async function handleConnect() {
    try {
      open()
      // account is set via useAccount hook
    } catch (e) { setError(e.message) }
  }

  async function handleAction(fn) {
    if (!account) { setError('Connect wallet first'); return }
    setLoading(true); setError(''); setSuccess('')
    try {
      await fn(account, id)
      setSuccess('Transaction confirmed!')
      await load()
    } catch (e) { setError(e.message || 'Transaction failed') }
    finally { setLoading(false) }
  }

  const receipt = booking ? {
    ...buildBookingReceiptObject({ booking, txHash: txHash || txHashes.createHash, bookingId: id, merchantName: merchantProfile?.tradingName || merchantName, description, merchantProfile }),
    create_tx_hash:  txHashes.createHash,
    cancel_tx_hash:  txHashes.cancelHash,
    release_tx_hash: txHashes.releaseHash,
  } : null

  function downloadJSON() {
    if (!receipt) return
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `arcpay_booking_${id}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }


  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)', fontSize: 14 }}>
        Booking escrow contract not configured. Deploy <code>ArcBookingEscrow.sol</code> and update <code>src/config.js</code>.
      </p>
    </div>
  )

  if (status === 'loading') return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <span className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
      <p style={{ color: 'var(--text2)', marginTop: 16 }}>Loading booking #{id}...</p>
    </div>
  )

  if (status === 'notfound') return (
    <div className="card fade-up" style={{ textAlign: 'center', padding: 48 }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>🔍</div>
      <p style={{ color: 'var(--text2)' }}>Booking #{id} not found on Arc Testnet.</p>
    </div>
  )

  if (status === 'error') return (
    <div className="error-box fade-up" style={{ padding: 24 }}>Failed to load booking.</div>
  )

  const beforeDL = now < Number(booking.cancellationDeadline)
  const afterDL  = now >= Number(booking.cancellationDeadline)
  const isActive = booking.status === 0

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <BookingStatusBadge status={booking.status} />
          <span className="badge badge-blue">Arc Testnet</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 26, letterSpacing: '-0.5px' }}>
          Booking Receipt · {booking?.bookingRef || `#${id}`}
        </h1>
        {merchantName && <p style={{ color: 'var(--text2)', fontSize: 14, marginTop: 4 }}>{merchantName}</p>}
      </div>

      {/* Amount split */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#1a0808', border: '1px solid #5a1c1c', borderRadius: 10, padding: 18, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: '#f08080', marginBottom: 6 }}>Released to hotel</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: '#f04f4f', letterSpacing: '-1px', lineHeight: 1 }}>
            {formatUsdc(booking.nonRefundableAmount)}
          </div>
          <div style={{ fontSize: 11, color: '#f08080', marginTop: 4 }}>USDC · Non-refundable</div>
        </div>
        <div style={{
          background: isActive && beforeDL ? 'var(--green-bg)' : 'var(--surface)',
          border: `1px solid ${isActive && beforeDL ? 'var(--green-bdr)' : 'var(--border)'}`,
          borderRadius: 10, padding: 18, textAlign: 'center',
        }}>
          <div style={{ fontSize: 11, color: isActive && beforeDL ? 'var(--green)' : 'var(--text2)', marginBottom: 6 }}>
            {isActive && beforeDL ? 'Locked in escrow' : isActive && afterDL ? 'Ready to release' : 'Escrow closed'}
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 28, fontWeight: 800, color: isActive && beforeDL ? 'var(--green)' : 'var(--text2)', letterSpacing: '-1px', lineHeight: 1 }}>
            {formatUsdc(booking.refundableAmount)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>USDC · Refundable portion</div>
        </div>
      </div>

      {/* Total */}
      <div className="card" style={{ textAlign: 'center', padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Total deposit paid</div>
        <div style={{ fontFamily: 'var(--display)', fontSize: 42, fontWeight: 800, color: 'var(--usdc)', letterSpacing: '-2px', lineHeight: 1 }}>
          {formatUsdc(booking.totalAmount)}
        </div>
        <div style={{ fontSize: 16, color: 'var(--text2)', marginTop: 4 }}>USDC</div>
        {isActive && <div style={{ marginTop: 10, fontSize: 13, color: beforeDL ? 'var(--green)' : 'var(--yellow)' }}>
          {beforeDL ? formatDeadlineCountdown(booking.cancellationDeadline) : '⚠️ Cancellation deadline passed'}
        </div>}
      </div>

      {/* Details */}
      <div className="card" style={{ marginBottom: 16 }}>
        {[
          { k: 'Booking Ref',   v: booking.bookingRef, mono: true },
          { k: 'Description',   v: booking?.description || description || '—' },
          { k: 'Hotel wallet',  v: booking.merchant, mono: true, full: true },
          { k: 'Trading name',    v: merchantProfile?.tradingName || merchantName || '—' },
          { k: 'Legal name',      v: merchantProfile?.legalName || '—' },
          { k: 'Country',         v: merchantProfile?.country || '—' },
          { k: 'Registered office', v: merchantProfile?.businessAddress || '—' },
          { k: 'VAT / Company ID',  v: merchantProfile?.vatOrCompanyId || '—' },
          { k: 'LEI',             v: merchantProfile?.lei || '—' },
          { k: 'Guest wallet',  v: booking.guest, mono: true, full: true },
          { k: 'Non-refundable', v: `${formatUsdc(booking.nonRefundableAmount)} USDC (${Number(booking.nonRefundableBps)/100}%)` },
          { k: 'Refundable',    v: `${formatUsdc(booking.refundableAmount)} USDC` },
          { k: 'Cancel deadline', v: formatTs(booking.cancellationDeadline) },
          { k: 'Check-in date', v: formatTs(booking.checkInDate) },
          { k: 'Created',       v: formatTs(booking.createdAt) },
          { k: 'Closed',        v: booking.closedAt && booking.closedAt > 0n ? formatTs(booking.closedAt) : '—' },
          { k: 'Block',         v: booking.createdBlock?.toString(), mono: true },
          { k: 'Network',       v: 'Arc Testnet · Chain ID 5042002' },
          { k: 'Metadata hash', v: booking.metadataHash, mono: true, full: true },
        ].map((row, i, arr) => (
          <div key={row.k} className="field-row" style={{ borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
            <span className="field-key">{row.k}</span>
            <span className={`field-val${row.mono ? '' : ' normal'}`} style={{ fontSize: row.full ? 11 : undefined }}>
              {row.v}
            </span>
          </div>
        ))}
        {txHash && (
          <div className="field-row" style={{ borderBottom: 'none' }}>
            <span className="field-key">TX Hash</span>
            <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
              style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)', textAlign: 'right', wordBreak: 'break-all' }}>
              {txHash}
            </a>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Actions</div>
        {!account ? (
          <div>
            <button onClick={handleConnect} className="btn-ghost btn-full" style={{ marginBottom: 10 }}>
              Connect wallet to see available actions
            </button>
          </div>
        ) : (
          <BookingActions
            allowRefund={allowRefund}
            booking={booking} account={account} now={now} loading={loading}
            onGuestCancel={() => handleAction(executeCancelBeforeDeadline)}
            onMerchantCancel={() => handleAction(executeCancelBeforeDeadline)}
            onRelease={() => handleAction(executeReleaseAfterDeadline)}
          />
        )}
        {error   && <div className="error-box"   style={{ marginTop: 10 }}>{error}</div>}
        {success && <div className="success-box" style={{ marginTop: 10 }}>✓ {success}</div>}
      </div>

      {/* ── Receipts & Events ── */}
      {receipt && (() => {
        const { createHash, cancelHash, releaseHash } = txHashes
        const ARCSCAN = 'https://testnet.arcscan.app'
        const ts = (unix) => unix && Number(unix) > 0 ? new Date(Number(unix) * 1000).toISOString().replace('T',' ').slice(0,19) + ' UTC' : null

        const events = []
        // 1. Booking created
        events.push({
          label:    'Booking Created',
          txHash:   createHash,
          timestamp: ts(booking.createdAt),
          detail:   `${formatUsdc(booking.totalAmount)} USDC · ${booking.bookingRef}`,
          pdf:      () => downloadBookingPDF(receipt, txHashes.createHash),
        })
        // 2. Cancelled
        if (booking.status === 1) {
          events.push({
            label:    'Booking Cancelled',
            txHash:   cancelHash,
            timestamp: ts(booking.closedAt),
            detail:   `${formatUsdc(booking.refundableAmount)} USDC refunded to guest`,
            pdf:      () => downloadCancelBookingPDF(receipt, cancelHash),
          })
        }
        // 3. Released
        if (booking.status === 2) {
          events.push({
            label:    'Escrow Released to Hotel',
            txHash:   releaseHash,
            timestamp: ts(booking.closedAt),
            detail:   `${formatUsdc(booking.refundableAmount)} USDC released to hotel`,
            pdf:      () => downloadReleaseBookingPDF(receipt, releaseHash),
          })
        }

        return (
          <div className="card" style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Receipts & Events
            </div>

            {/* Event rows */}
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

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => downloadFullBookingPDF(receipt, events)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                🖨️ Full PDF (all events)
              </button>
              <button onClick={downloadJSON} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>📄 JSON</button>
              <button onClick={() => navigator.clipboard.writeText(`${APP_URL}/booking/${id}`)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>
                🔗 Copy link
              </button>
            </div>
          </div>
        )
      })()}

      {/* QR — share receipt */}
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Share this receipt
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'inline-block', background: '#fff', padding: 14, borderRadius: 12 }}>
            <QRCodeSVG value={`${APP_URL}/booking/${id}`} size={160} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>
            {`${APP_URL}/booking/${id}`}
          </p>
        </div>
      </div>

      <div style={{ padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        <strong style={{ color: 'var(--text2)' }}>TESTNET ONLY.</strong> Not a regulated escrow service. Testnet tokens have no real economic value.
        Smart contracts do not execute automatically at deadlines — release must be triggered by a transaction.
      </div>
    </div>
  )
}
