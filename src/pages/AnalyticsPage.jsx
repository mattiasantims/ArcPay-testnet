import { useState, useEffect, useCallback } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { fetchReceivedProofIds, fetchProof } from '../utils/receipts.js'
import { fetchMerchantBookingIds, fetchBooking } from '../utils/booking.js'
import { fetchMerchantTravelIds, fetchTravelBooking, fromUsdc, getCachedTravelTxHash } from '../utils/travel.js'
import { getCachedTxHash } from '../utils/paymentRequest.js'
import { getCachedBookingTxHash } from '../utils/bookingRequest.js'
import { isValidAddress, shortAddress } from '../utils/wallet.js'
import { ARCSCAN_BASE, isBookingContractConfigured, isTravelContractConfigured } from '../config.js'
import {
  computeAnalytics, generateAiAnswer, TIME_FILTER_LABELS,
} from '../utils/analytics.js'
import { fetchMerchantCommitmentIds, fetchCommitment } from '../utils/commitment.js'
import { fetchMerchantRefundIds, fetchRefundRequest } from '../utils/refund.js'
import { isRefundContractConfigured, isCommitmentContractConfigured } from '../config.js'
import { Link } from 'react-router-dom'

const TABS = ['Overview', 'Luxury Retail', 'Online Payments', 'Hotel Booking', 'Travel Agency', 'Ask ArcPay AI', 'Coming Soon']
const TIME_FILTERS = Object.keys(TIME_FILTER_LABELS)
const COLORS = ['#2775ca', '#a78bfa', '#22d47e', '#f0c040', '#f04f4f', '#60a5fa']

function MetricCard({ label, value, sub, color = 'var(--text)', small }) {
  return (
    <div className="card" style={{ padding: '16px 18px', minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--display)', fontSize: small ? 18 : 22, fontWeight: 700, color, letterSpacing: '-0.5px', wordBreak: 'break-word' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function ChartCard({ title, children, height = 200 }) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
      <div style={{ height }}>{children}</div>
    </div>
  )
}

function EmptyState({ msg = 'No data for this period' }) {
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
      {msg}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text)' }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(2) : p.value}</div>
      ))}
    </div>
  )
}

function ReceiptRow({ r, idx }) {
  const txHash = r.txHash || getCachedTxHash(r.id)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.proof?.paymentRef || `#${r.id}`}
      </div>
      <div style={{ color: 'var(--usdc)', fontWeight: 600 }}>{r.amount.toFixed(2)} USDC</div>
      <div style={{ color: 'var(--text2)' }}>{r.proof?.purposeCode || '—'}</div>
      <div style={{ color: 'var(--text3)', fontSize: 11 }}>{r.ts ? r.ts.toISOString().slice(0, 10) : '—'}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Link to={`/receipt/${r.id}`} style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>Receipt</Link>
        {txHash && <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--text3)' }}>ArcScan</a>}
      </div>
    </div>
  )
}

function BookingRow({ b }) {
  const statusLabel = ['Active', 'Cancelled', 'Released'][b.status] || '?'
  const statusColor = ['var(--green)', 'var(--yellow)', 'var(--text3)'][b.status] || 'var(--text3)'
  const txHash = getCachedBookingTxHash(b.id)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 11 }}>#{b.id} {b.booking?.bookingRef || ''}</div>
      <div style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
      <div style={{ color: 'var(--usdc)', fontWeight: 600 }}>{b.total.toFixed(2)} USDC</div>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>NR: {b.nonRef.toFixed(2)} / R: {b.refundable.toFixed(2)}</div>
      <div style={{ fontSize: 11, color: 'var(--text3)' }}>{b.booking?.bookingRef || '—'}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <Link to={`/booking/${b.id}`} style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>View</Link>
        {txHash && <a href={`${ARCSCAN_BASE}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: 'var(--text3)' }}>ArcScan</a>}
      </div>
    </div>
  )
}

// ─── AI Panel ────────────────────────────────────────────────────────────────

const AI_QUESTIONS = {
  Overview: [
    'Summarize my ArcPay performance',
    'Which channel performs best?',
    'How much USDC did I receive?',
    'What is my average payment amount?',
    'How many unique customers paid me?',
  ],
  'Luxury Retail': [
    'How is Luxury Retail performing?',
    'What is my average luxury ticket?',
    'What was my largest luxury sale?',
    'How much did luxury checkout generate?',
    'How are delayed payments performing?',
    'How are tranche payments performing?',
    'How many refunds were requested?',
  ],
  'Online Payments': [
    'How are Online Payments performing?',
    'Which purpose code is most common?',
    'How much did payment links generate?',
    'How many online customers paid me?',
  ],
  'Hotel Booking': [
    'How many hotel bookings are active?',
    'How much escrow is currently locked?',
    'How much is ready to release?',
    'How much was refunded to guests?',
    'Which bookings need action today?',
  ],
  'Travel Agency': [
    'How are Travel Agency scheduled payments performing?',
    'Which travel payments are due soon?',
    'How much tranche amount is ready to request?',
    'Which travel bookings are overdue?',
    'How much refundable travel escrow is locked?',
    'How much tranche amount has been paid?',
    'Summarize travel agency performance.',
  ],
}

function AiPanel({ metrics, timeFilter }) {
  const [question, setQuestion] = useState('')
  const [answer,   setAnswer]   = useState('')
  const [tab,      setAiTab]    = useState('Overview')

  function ask(q) {
    setQuestion(q)
    setAnswer(generateAiAnswer(q, metrics, timeFilter))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.keys(AI_QUESTIONS).map(t => (
          <button key={t} onClick={() => setAiTab(t)}
            className={tab === t ? 'btn-primary' : 'btn-ghost'}
            style={{ fontSize: 12, padding: '6px 14px' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {AI_QUESTIONS[tab].map(q => (
          <button key={q} onClick={() => ask(q)}
            className="btn-ghost"
            style={{ fontSize: 12, padding: '7px 14px', textAlign: 'left' }}>
            {q}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && ask(question)}
          placeholder="Ask a question about your payments..."
          style={{ flex: 1 }}
        />
        <button onClick={() => ask(question)} className="btn-primary" style={{ padding: '10px 20px', flexShrink: 0 }}>
          Ask →
        </button>
      </div>

      {answer && (
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 10, padding: '16px 18px', fontSize: 14, lineHeight: 1.7, color: 'var(--text)' }}>
          <div style={{ fontSize: 11, color: 'var(--usdc)', marginBottom: 8, fontFamily: 'var(--mono)' }}>◆ ArcPay AI — local dynamic assistant</div>
          {answer}
        </div>
      )}

      <div style={{ marginTop: 20, padding: 16, background: '#0a1020', border: '1px solid var(--border)', borderRadius: 10, opacity: 0.6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>🔮 Connect GPT / Claude — Coming Soon</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
          In a future version, ArcPay may connect to GPT or Claude through a secure backend/serverless function.
          API keys are never exposed in the browser. Merchants can opt in to share anonymised payment data for AI-generated insights.
        </div>
      </div>

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        Ask ArcPay AI is a local dynamic assistant. Answers are computed from on-chain data loaded from Arc Testnet.
        No external AI API. No backend. No API keys. Answers update when you refresh on-chain data.
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function AnalyticsPage({ account, onConnect, connecting }) {
  const [tab,         setTab]         = useState('Overview')
  const [addrInput,   setAddrInput]   = useState('')
  const [addr,        setAddr]        = useState('')
  const [timeFilter,  setTimeFilter]  = useState('30d')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [rawReceipts,       setRawReceipts]       = useState([])
  const [rawBookings,       setRawBookings]       = useState([])
  const [rawTravelBookings, setRawTravelBookings] = useState([])
  const [rawCommitments,    setRawCommitments]    = useState([])
  const [rawRefunds,        setRawRefunds]        = useState([])
  const [metrics,           setMetrics]           = useState(null)

  const bookingConfigured = isBookingContractConfigured()
  const travelConfigured = isTravelContractConfigured()

  useEffect(() => {
    if (account && !addr) { setAddr(account); setAddrInput(account) }
  }, [account])

  useEffect(() => { if (addr) loadData(addr) }, [addr])

  useEffect(() => {
    // Always compute metrics, including the empty-data state.
    // This keeps /analytics usable for a new merchant wallet with no payments yet.
    setMetrics(computeAnalytics({ receipts: rawReceipts, bookings: rawBookings, travelBookings: rawTravelBookings, commitments: rawCommitments, refunds: rawRefunds, timeFilter }))
  }, [rawReceipts, rawBookings, rawTravelBookings, timeFilter])

  const loadData = useCallback(async (a) => {
    if (!isValidAddress(a)) { setError('Invalid wallet address'); return }
    setLoading(true); setError('')
    try {
      // Load receipts
      const proofIds = await fetchReceivedProofIds(a)
      const receipts = []
      for (const id of [...proofIds].reverse()) {
        try {
          const proof = await fetchProof(id.toString())
          if (proof) receipts.push({ id: id.toString(), proof, txHash: getCachedTxHash(id.toString()) })
        } catch {}
      }
      setRawReceipts(receipts)

      // Load bookings
      const bookings = []
      if (bookingConfigured) {
        const bookingIds = await fetchMerchantBookingIds(a)
        for (const id of [...bookingIds].reverse()) {
          try {
            const booking = await fetchBooking(id.toString())
            if (booking) bookings.push({ id: id.toString(), booking })
          } catch {}
        }
      }
      setRawBookings(bookings)

      // Load travel scheduled bookings
      const travelBookings = []
      if (travelConfigured) {
        const travelIds = await fetchMerchantTravelIds(a)
        for (const id of [...travelIds].reverse()) {
          try {
            const travel = await fetchTravelBooking(id.toString())
            if (travel) travelBookings.push({ id: id.toString(), travel })
          } catch {}
        }
      }
      setRawTravelBookings(travelBookings)
      // Load luxury commitments
      if (isCommitmentContractConfigured()) {
        try {
          const cIds = await fetchMerchantCommitmentIds(a)
          const cList = []
          for (const id of [...cIds].reverse()) {
            const cm = await fetchCommitment(id.toString())
            if (cm) cList.push(cm)
          }
          setRawCommitments(cList)
        } catch {}
      }

      // Load refunds
      if (isRefundContractConfigured()) {
        try {
          const rIds = await fetchMerchantRefundIds(a)
          const rList = []
          for (const id of [...rIds].reverse()) {
            const r = await fetchRefundRequest(id.toString())
            if (r) rList.push(r)
          }
          setRawRefunds(rList)
        } catch {}
      }

      setLastUpdated(new Date())
    } catch (e) {
      setError('Failed to load data. Check your wallet is on Arc Testnet.')
    } finally { setLoading(false) }
  }, [bookingConfigured, travelConfigured])

  const m = metrics

  return (
    <div className="fade-up">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span className="badge badge-blue">Merchant Intelligence</span>
          <span className="badge badge-gray">Testnet Demo</span>
        </div>
        <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 24, letterSpacing: '-0.5px', marginBottom: 6 }}>
          ArcPay Analytics
        </h1>
        <p style={{ color: 'var(--text2)', fontSize: 14 }}>
          USDC payment analytics across Luxury Retail, Online Payments and Hotel Booking Deposits.
        </p>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <label className="label">Merchant wallet</label>
            <input value={addrInput} onChange={e => setAddrInput(e.target.value)} placeholder="0x..." />
          </div>
          <button onClick={() => { const a = addrInput.trim(); setAddr(a); loadData(a) }} disabled={loading} className="btn-primary" style={{ padding: '10px 18px', height: 42 }}>
            {loading ? <><span className="spinner" />Loading...</> : '🔄 Refresh on-chain data'}
          </button>
          {!account && (
            <button onClick={onConnect} disabled={connecting} className="btn-ghost" style={{ padding: '10px 14px', height: 42 }}>
              {connecting ? <><span className="spinner" /></> : 'Connect'}
            </button>
          )}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TIME_FILTERS.map(f => (
              <button key={f} onClick={() => setTimeFilter(f)}
                className={timeFilter === f ? 'btn-primary' : 'btn-ghost'}
                style={{ fontSize: 11, padding: '5px 10px' }}>
                {TIME_FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        </div>
        {lastUpdated && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
            Last updated: {lastUpdated.toLocaleTimeString()}
            {addr && ` · ${shortAddress(addr)}`}
          </div>
        )}
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, overflowX: 'auto', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            fontSize: 13, fontWeight: 500, padding: '8px 16px',
            background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid var(--usdc)' : '2px solid transparent',
            color: tab === t ? 'var(--text)' : 'var(--text2)',
            cursor: 'pointer', whiteSpace: 'nowrap', borderRadius: 0,
            transition: 'all 0.15s',
          }}>{t}</button>
        ))}
      </div>

      {/* No data state */}
      {!addr && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>📊</div>
          <p>Connect your wallet or enter a merchant address to load analytics.</p>
        </div>
      )}

      {addr && m && (
        <>
          {/* ── OVERVIEW TAB ── */}
          {tab === 'Overview' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Total USDC Volume"   value={`${parseFloat(m.totalVolume).toFixed(2)} USDC`} color="var(--usdc)" />
                <MetricCard label="Total Transactions"  value={m.totalCount} />
                <MetricCard label="Unique Payers"       value={m.uniquePayers} />
                <MetricCard label="Average Amount"      value={`${parseFloat(m.avgAmount).toFixed(2)} USDC`} color="var(--text)" />
                <MetricCard label="Largest Payment"     value={`${parseFloat(m.maxAmount).toFixed(2)} USDC`} />
                <MetricCard label="Active Escrow"       value={`${parseFloat(m.escrowLocked).toFixed(2)} USDC`} color="var(--green)" />
                <MetricCard label="Platform Fees"       value="0 USDC" sub="ArcPay fee: 0%" color="var(--text3)" />
                <MetricCard label="Refunded to Guests"  value={`${parseFloat(m.refundedToGuests).toFixed(2)} USDC`} color="var(--yellow)" />
              </div>

              {/* Mode breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <ChartCard title="Volume by channel" height={220}>
                  {m.totalVolume === 0 ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[
                          { name: 'Luxury Retail', value: m.luxuryVolume },
                          { name: 'Online Payments', value: m.onlineVolume },
                          { name: 'Hotel Booking', value: m.bookingVolume },
                          { name: 'Travel Agency', value: m.travelVolume },
                        ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value.toFixed(0)}`} labelLine={false}>
                          {COLORS.slice(0, 3).map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip formatter={v => [`${parseFloat(v).toFixed(2)} USDC`]} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                <ChartCard title={`Volume over time (${TIME_FILTER_LABELS[timeFilter]})`} height={220}>
                  {!m.overviewTimeSeries.length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={m.overviewTimeSeries}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="volume" name="USDC" stroke="#2775ca" fill="#2775ca22" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              {/* Channel breakdown table */}
              <div className="card" style={{ padding: 20, marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Channel breakdown</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                  {[
                    { label: '🔗 Online Payments', vol: m.onlineVolume, count: m.onlineCount, color: 'var(--usdc)' },
                    { label: '💎 Luxury Retail',   vol: m.luxuryVolume, count: m.luxuryCount, color: '#a78bfa' },
                    { label: '🏨 Hotel Booking',   vol: m.bookingVolume, count: m.bookingCount, color: 'var(--green)' },
                  ].map(ch => (
                    <div key={ch.label} style={{ padding: 16, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{ch.label}</div>
                      <div style={{ fontFamily: 'var(--display)', fontSize: 20, fontWeight: 700, color: ch.color }}>{parseFloat(ch.vol).toFixed(2)} USDC</div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>{ch.count} transaction{ch.count !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fees section */}
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Merchant reconciliation</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  <MetricCard label="Gross received"   value={`${parseFloat(m.totalVolume).toFixed(2)} USDC`} color="var(--usdc)" small />
                  <MetricCard label="Platform fee rate" value="0%" sub="Not enabled in MVP" color="var(--text3)" small />
                  <MetricCard label="Platform fees"    value="0 USDC" color="var(--text3)" small />
                  <MetricCard label="Net received"     value={`${parseFloat(m.totalVolume).toFixed(2)} USDC`} color="var(--green)" small />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, lineHeight: 1.6 }}>
                  Platform fees are not enabled in this testnet MVP. This section demonstrates future merchant reconciliation.
                </div>
              </div>
            </div>
          )}

          {/* ── LUXURY TAB ── */}
          {tab === 'Luxury Retail' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Instant Volume"   value={`${parseFloat(m.luxuryVolume).toFixed(2)} USDC`} color="#a78bfa" sub={`${m.luxuryCount} payments`} />
                <MetricCard label="Average Ticket"   value={`${parseFloat(m.luxuryAvg).toFixed(2)} USDC`} />
                <MetricCard label="Largest Sale"     value={`${parseFloat(m.luxuryMax).toFixed(2)} USDC`} />
                <MetricCard label="Unique Buyers"    value={m.luxuryPayers} />
                <MetricCard label="High Value (≥500 USDC)" value={m.luxuryHighVal} color="var(--yellow)" />
                <MetricCard label="Delayed active"   value={m.luxuryDelayedActive.length} color="var(--usdc)" sub={`${m.luxuryDelayedFulfilled.length} fulfilled`} />
                <MetricCard label="Tranche active"   value={m.luxuryTrancheActive.length} color="var(--usdc)" sub={`${m.luxuryTrancheFulfilled.length} fulfilled`} />
                <MetricCard label="Refunds pending"  value={m.luxuryRefundRequested.length} color={m.luxuryRefundRequested.length > 0 ? 'var(--yellow)' : 'var(--text3)'} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <ChartCard title="Luxury volume over time" height={200}>
                  {!m.luxuryTimeSeries.length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={m.luxuryTimeSeries}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="volume" name="USDC" stroke="#a78bfa" fill="#a78bfa22" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                <ChartCard title="Payment count over time" height={200}>
                  {!m.luxuryTimeSeries.length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={m.luxuryTimeSeries}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="count" name="Payments" fill="#a78bfa" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              {/* ── Summary by type ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 20 }}>
                <MetricCard label="Total Luxury Volume" value={`${parseFloat(m.luxuryTotalVolume).toFixed(2)} USDC`} color="#a78bfa" />
                <MetricCard label="Instant Paid"        value={`${parseFloat(m.luxuryVolume).toFixed(2)} USDC`} sub={`${m.luxuryCount} payments`} />
                <MetricCard label="Delayed Paid"        value={`${parseFloat(m.luxuryDelayedVolume).toFixed(2)} USDC`} sub={`${m.luxuryDelayedFulfilled.length} fulfilled · ${m.luxuryDelayedActive.length} active`} />
                <MetricCard label="Tranche Paid"        value={`${parseFloat(m.luxuryTranchePaid).toFixed(2)} USDC`} sub={`${m.luxuryTrancheProgress}/${m.luxuryTrancheTotal} tranches`} />
                <MetricCard label="Pending (delayed)"   value={`${parseFloat(m.luxuryDelayedPending).toFixed(2)} USDC`} color="var(--yellow)" sub={`${m.luxuryDelayedActive.length} active`} />
                <MetricCard label="Pending (tranche)"   value={`${parseFloat(m.luxuryTranchePending).toFixed(2)} USDC`} color="var(--yellow)" sub={`${m.luxuryTrancheActive.length} active`} />
                <MetricCard label="Refunded"            value={`${parseFloat(m.luxuryRefundedVolume).toFixed(2)} USDC`} color="#f08080" sub={`${m.luxuryRefundApproved.length} approved · ${m.luxuryRefundRequested.length} pending`} />
                <MetricCard label="Overdue"             value={`${m.luxuryDelayedOverdue.length + m.luxuryTrancheOverdue.length}`} color={m.luxuryDelayedOverdue.length + m.luxuryTrancheOverdue.length > 0 ? '#f08080' : 'var(--text3)'} sub="delayed + tranche" />
              </div>

              {/* Overdue alerts */}
              {(m.luxuryDelayedOverdue.length > 0 || m.luxuryTrancheOverdue.length > 0) && (
                <div style={{ background: '#1a0808', border: '1px solid #f04f4f44', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#f08080', marginBottom: 8 }}>
                    ⚠️ {m.luxuryDelayedOverdue.length + m.luxuryTrancheOverdue.length} overdue commitment{m.luxuryDelayedOverdue.length + m.luxuryTrancheOverdue.length !== 1 ? 's' : ''}
                  </div>
                  {[...m.luxuryDelayedOverdue, ...m.luxuryTrancheOverdue].slice(0, 5).map(c => (
                    <div key={c.commitmentId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{c.ref}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#f08080' }}>{c.totalAmount} USDC</span>
                        <Link to={`/commitment/${c.commitmentId}`}><button className="btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}>View →</button></Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Refund requests pending */}
              {m.luxuryRefundRequested.length > 0 && (
                <div style={{ background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)', marginBottom: 8 }}>
                    💸 {m.luxuryRefundRequested.length} refund request{m.luxuryRefundRequested.length !== 1 ? 's' : ''} pending — {parseFloat(m.luxuryRefundPendingVol).toFixed(2)} USDC
                  </div>
                  {m.luxuryRefundRequested.slice(0, 3).map((r, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 2 }}>
                      {r.proofRef} · {r.amount} USDC · "{r.reason}"
                    </div>
                  ))}
                  <Link to="/dashboard"><button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px', marginTop: 6 }}>Go to Dashboard →</button></Link>
                </div>
              )}

              {/* ── Instant payments table ── */}
              <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚡ Instant payments</div>
                {!m.luxuryReceipts.length ? (
                  <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 20 }}>No instant luxury payments in this period.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <div>Reference</div><div>Amount</div><div>Purpose</div><div>Date</div><div>Links</div>
                    </div>
                    {m.luxuryReceipts.slice(0, 20).map((r, i) => <ReceiptRow key={r.id} r={r} idx={i} />)}
                  </>
                )}
              </div>

              {/* ── Delayed payments table ── */}
              {m.luxuryDelayed.length > 0 && (
                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📅 Delayed payments ({m.luxuryDelayed.length})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div>Reference</div><div>Amount</div><div>Status</div><div>Due date</div><div>Link</div>
                  </div>
                  {m.luxuryDelayed.slice(0, 20).map(c => {
                    const isOverdue = c.status === 0 && Math.floor(Date.now()/1000) >= (c.deadline || 0)
                    const statusLabel = c.status === 1 ? 'Fulfilled' : c.status === 2 || c.status === 3 ? 'Cancelled' : isOverdue ? 'Overdue' : 'Active'
                    const statusColor = c.status === 1 ? 'var(--green)' : c.status === 2 ? 'var(--text3)' : isOverdue ? '#f08080' : 'var(--usdc)'
                    return (
                      <div key={c.commitmentId} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ref}</div>
                        <div style={{ color: 'var(--usdc)', fontWeight: 600 }}>{c.totalAmount} USDC</div>
                        <div style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
                        <div style={{ color: 'var(--text3)', fontSize: 11 }}>{c.dueDate ? new Date(c.dueDate * 1000).toISOString().slice(0,10) : '—'}</div>
                        <Link to={`/commitment/${c.commitmentId}`} style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>View</Link>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Tranche payments table ── */}
              {m.luxuryTranche.length > 0 && (
                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>📊 Tranche payments ({m.luxuryTranche.length})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div>Reference</div><div>Total</div><div>Progress</div><div>Status</div><div>Link</div>
                  </div>
                  {m.luxuryTranche.slice(0, 20).map(c => {
                    const isOverdue = c.status === 0 && Math.floor(Date.now()/1000) >= (c.trancheDeadlines?.[c.tranchesPaidCount] || 0)
                    const statusLabel = c.status === 1 ? 'Fulfilled' : c.status === 2 || c.status === 3 ? 'Cancelled' : isOverdue ? 'Overdue' : 'Active'
                    const statusColor = c.status === 1 ? 'var(--green)' : c.status === 2 ? 'var(--text3)' : isOverdue ? '#f08080' : 'var(--usdc)'
                    return (
                      <div key={c.commitmentId} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.ref}</div>
                        <div style={{ color: 'var(--usdc)', fontWeight: 600 }}>{c.totalAmount} USDC</div>
                        <div style={{ color: 'var(--text2)' }}>{c.tranchesPaidCount}/{c.trancheAmounts?.length} paid</div>
                        <div style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
                        <Link to={`/commitment/${c.commitmentId}`} style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>View</Link>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Refunds table ── */}
              {m.luxuryRefunds.length > 0 && (
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>💸 Refunds ({m.luxuryRefunds.length})</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <div>Reference</div><div>Amount</div><div>Status</div><div>Date</div>
                  </div>
                  {m.luxuryRefunds.slice(0, 20).map((r, i) => {
                    const statusLabel = ['Requested','Approved','Denied','Direct'][r.status] || '?'
                    const statusColor = r.status === 1 || r.status === 3 ? 'var(--green)' : r.status === 2 ? '#f08080' : 'var(--yellow)'
                    const ts = (r.processedAt || r.requestedAt) ? new Date((r.processedAt || r.requestedAt) * 1000).toISOString().slice(0,10) : '—'
                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 11 }}>{r.proofRef || '—'}</div>
                        <div style={{ color: 'var(--usdc)', fontWeight: 600 }}>{r.amount} USDC</div>
                        <div style={{ color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
                        <div style={{ color: 'var(--text3)', fontSize: 11 }}>{ts}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── ONLINE PAYMENTS TAB ── */}
          {tab === 'Online Payments' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Online Volume"   value={`${parseFloat(m.onlineVolume).toFixed(2)} USDC`} color="var(--usdc)" />
                <MetricCard label="Payments"        value={m.onlineCount} />
                <MetricCard label="Average Payment" value={`${parseFloat(m.onlineAvg).toFixed(2)} USDC`} />
                <MetricCard label="Largest"         value={`${parseFloat(m.onlineMax).toFixed(2)} USDC`} />
                <MetricCard label="Unique Payers"   value={m.onlinePayers} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <ChartCard title="Online volume over time" height={200}>
                  {!m.onlineTimeSeries.length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={m.onlineTimeSeries}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="volume" name="USDC" stroke="#2775ca" fill="#2775ca22" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                <ChartCard title="Purpose code breakdown" height={200}>
                  {!Object.keys(m.purposeCodes).length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={Object.entries(m.purposeCodes).map(([name, value]) => ({ name, value }))}
                          cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {Object.keys(m.purposeCodes).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              <div className="card" style={{ padding: 16, marginBottom: 16, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
                ℹ️ Conversion analytics (abandoned checkout, page views, geo, device) require off-chain session tracking and are not available in the no-backend MVP.
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Recent online payments</div>
                {!m.onlineReceipts.length ? (
                  <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 24 }}>No online payments in this period.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <div>Reference</div><div>Amount</div><div>Purpose</div><div>Date</div><div>Links</div>
                    </div>
                    {m.onlineReceipts.slice(0, 20).map((r, i) => <ReceiptRow key={r.id} r={r} idx={i} />)}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── HOTEL BOOKING TAB ── */}
          {tab === 'Hotel Booking' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Booking Volume"    value={`${parseFloat(m.bookingVolume).toFixed(2)} USDC`} color="var(--green)" />
                <MetricCard label="Total Bookings"    value={m.bookingCount} />
                <MetricCard label="Active"            value={m.activeBookings.length} color="var(--green)" />
                <MetricCard label="Cancelled"         value={m.cancelledBookings.length} color="var(--yellow)" />
                <MetricCard label="Released"          value={m.releasedBookings.length} color="var(--text3)" />
                <MetricCard label="Cancellation Rate" value={`${m.cancellationRate}%`} />
                <MetricCard label="Non-Ref Retained"  value={`${parseFloat(m.nonRefRetained).toFixed(2)} USDC`} color="var(--usdc)" />
                <MetricCard label="Escrow Locked"     value={`${parseFloat(m.escrowLocked).toFixed(2)} USDC`} color="var(--green)" />
                <MetricCard label="Refunded to Guests" value={`${parseFloat(m.refundedToGuests).toFixed(2)} USDC`} color="var(--yellow)" />
                <MetricCard label="Released to Hotel" value={`${parseFloat(m.releasedToHotel).toFixed(2)} USDC`} color="var(--usdc)" />
                <MetricCard label="Total Hotel Received" value={`${parseFloat(m.totalHotelReceived).toFixed(2)} USDC`} color="var(--green)" />
              </div>

              {/* Operational widgets */}
              {m.releasableBookings.length > 0 && (
                <div style={{ background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)', marginBottom: 10 }}>
                    🔔 {m.releasableBookings.length} booking{m.releasableBookings.length !== 1 ? 's' : ''} ready to release
                  </div>
                  {m.releasableBookings.map(b => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>#{b.id} {b.booking?.bookingRef}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--yellow)' }}>{b.refundable.toFixed(2)} USDC</span>
                        <Link to={`/booking/${b.id}`}><button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Release →</button></Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {m.upcomingBookings.length > 0 && (
                <div style={{ background: 'var(--green-bg)', border: '1px solid var(--green-bdr)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)', marginBottom: 10 }}>
                    ⏱ {m.upcomingBookings.length} booking{m.upcomingBookings.length !== 1 ? 's' : ''} before deadline
                  </div>
                  {m.upcomingBookings.map(b => (
                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>#{b.id} {b.booking?.bookingRef}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--green)' }}>{b.refundable.toFixed(2)} USDC escrowed</span>
                        <Link to={`/booking/${b.id}`}><button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button></Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <ChartCard title="Booking volume over time" height={200}>
                  {!m.bookingTimeSeries.length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={m.bookingTimeSeries}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="volume" name="USDC" stroke="#22d47e" fill="#22d47e22" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                <ChartCard title="Bookings by status" height={200}>
                  {!m.bookingCount ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[
                          { name: 'Active', value: m.activeBookings.length },
                          { name: 'Cancelled', value: m.cancelledBookings.length },
                          { name: 'Released', value: m.releasedBookings.length },
                        ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {['#22d47e', '#f0c040', '#7b88a8'].map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>All bookings</div>
                {!m.enrichedBookings.length ? (
                  <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 24 }}>No bookings in this period.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <div>ID / Ref</div><div>Status</div><div>Total</div><div>NR / Refundable</div><div>Booking Ref</div><div>Links</div>
                    </div>
                    {m.enrichedBookings.slice(0, 30).map(b => <BookingRow key={b.id} b={b} />)}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── TRAVEL AGENCY TAB ── */}
          {tab === 'Travel Agency' && (
            <div>
              {!travelConfigured && (
                <div className="card" style={{ padding: 18, marginBottom: 16, borderColor: 'var(--yellow)' }}>
                  <div style={{ color: 'var(--yellow)', fontWeight: 600, marginBottom: 6 }}>Travel escrow contract not configured</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>Deploy ArcTravelEscrow.sol and update ARCTRAVEL_ESCROW_ADDRESS in src/config.js to activate scheduled travel analytics.</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
                <MetricCard label="Travel Volume" value={`${parseFloat(m.travelVolume).toFixed(2)} USDC`} color="#60a5fa" />
                <MetricCard label="Package Value" value={`${parseFloat(m.travelPackageValue).toFixed(2)} USDC`} />
                <MetricCard label="Travel Items" value={m.travelCount} />
                <MetricCard label="Initial Collected" value={`${parseFloat(m.travelInitialCollected).toFixed(2)} USDC`} color="var(--usdc)" />
                <MetricCard label="Escrow Locked" value={`${parseFloat(m.travelEscrowLocked).toFixed(2)} USDC`} color="var(--green)" />
                <MetricCard label="Tranche Paid" value={`${parseFloat(m.travelTranchePaidAmount).toFixed(2)} USDC`} color="var(--usdc)" />
                <MetricCard label="Ready to Request" value={m.travelReadyToRequest.length} color="var(--yellow)" />
                <MetricCard label="Overdue" value={m.travelOverdue.length} color="var(--red)" />
              </div>

              {m.travelReadyToRequest.length > 0 && (
                <div style={{ background: '#1a1200', border: '1px solid #f0c04044', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)', marginBottom: 10 }}>📨 {m.travelReadyToRequest.length} tranche payment{m.travelReadyToRequest.length !== 1 ? 's' : ''} ready to request</div>
                  {m.travelReadyToRequest.slice(0, 8).map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>#{t.id} {t.travel?.travelRef}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--yellow)' }}>{t.tranche.toFixed(2)} USDC</span>
                        <Link to={`/travel/${t.id}`}><button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Request →</button></Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {m.travelOverdue.length > 0 && (
                <div style={{ background: '#1a0808', border: '1px solid #5a1c1c', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 10 }}>⚠️ {m.travelOverdue.length} overdue travel tranche{m.travelOverdue.length !== 1 ? 's' : ''}</div>
                  {m.travelOverdue.slice(0, 8).map(t => (
                    <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>#{t.id} {t.travel?.travelRef}</span>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: 'var(--red)' }}>{t.tranche.toFixed(2)} USDC overdue</span>
                        <Link to={`/travel/${t.id}`}><button className="btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>View →</button></Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <ChartCard title="Travel volume over time" height={200}>
                  {!m.travelTimeSeries.length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={m.travelTimeSeries}>
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#454f68' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Area type="monotone" dataKey="volume" name="USDC" stroke="#60a5fa" fill="#60a5fa22" strokeWidth={2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
                <ChartCard title="Travel bookings by status" height={200}>
                  {!m.enrichedTravelBookings.length ? <EmptyState /> : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[
                          { name: 'Active', value: m.travelActiveBookings.length },
                          { name: 'Tranche paid', value: m.travelTranchePaidBookings.length },
                          { name: 'Cancelled', value: m.travelCancelledBookings.length },
                          { name: 'Missed payment', value: m.travelMissedPaymentBookings.length },
                          { name: 'Released', value: m.travelReleasedBookings.length },
                        ].filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`} labelLine={false}>
                          {['#22d47e', '#2775ca', '#f0c040', '#f04f4f', '#7b88a8'].map((c, i) => <Cell key={i} fill={c} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>
              </div>

              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Travel scheduled bookings</div>
                {!m.enrichedTravelBookings.length ? (
                  <div style={{ color: 'var(--text3)', fontSize: 13, textAlign: 'center', padding: 24 }}>No scheduled travel bookings in this period. Full travel payments appear as ArcProof receipts.</div>
                ) : (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      <div>ID / Ref</div><div>Status</div><div>Initial</div><div>Tranche</div><div>Deadline</div><div>Links</div>
                    </div>
                    {m.enrichedTravelBookings.slice(0, 30).map(t => (
                      <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr auto', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 12, alignItems: 'center' }}>
                        <div style={{ fontFamily: 'var(--mono)', color: 'var(--text2)', fontSize: 11 }}>#{t.id} {t.travel?.travelRef}</div>
                        <div style={{ color: t.overdue ? 'var(--red)' : t.isTranchePaid ? 'var(--usdc)' : 'var(--green)', fontWeight: 600 }}>{t.overdue ? 'Overdue' : t.isTranchePaid ? 'Tranche paid' : t.isActive ? 'Active' : 'Closed'}</div>
                        <div style={{ color: 'var(--usdc)', fontWeight: 600 }}>{t.initial.toFixed(2)} USDC</div>
                        <div style={{ color: 'var(--text2)' }}>{t.tranche.toFixed(2)} USDC</div>
                        <div style={{ color: 'var(--text3)', fontSize: 11 }}>{t.travel?.paymentDeadline ? new Date(t.travel.paymentDeadline * 1000).toISOString().slice(0,10) : '—'}</div>
                        <div><Link to={`/travel/${t.id}`} style={{ fontSize: 10, color: 'var(--accent)', textDecoration: 'none' }}>View</Link></div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── ASK AI TAB ── */}
          {tab === 'Ask ArcPay AI' && (
            <AiPanel metrics={m} timeFilter={timeFilter} />
          )}
        </>
      )}

      {/* ── COMING SOON TAB ── */}
      {tab === 'Coming Soon' && (
        <div>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 20 }}>
            These features are on the ArcPay roadmap and not yet implemented.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {[
              { icon: '🔧', title: 'Freelance Service Escrow', desc: 'Analytics for ERC-8183-based freelance and service escrow payments.' },
              { icon: '📦', title: 'Marketplace Delivery Escrow', desc: 'Delivery-confirmed payment analytics for marketplace transactions.' },
              { icon: '🎯', title: 'Donations / Milestone Funding', desc: 'Donation campaigns and milestone-based funding analytics.' },
              { icon: '💶', title: 'EURC / Multi-stablecoin', desc: 'Analytics across USDC and EURC with currency breakdown.' },
              { icon: '🤖', title: 'x402 / API Payments', desc: 'Machine-to-machine and API payment analytics.' },
              { icon: '🏢', title: 'PMS / POS / ERP Integration', desc: 'Connect to hotel PMS, retail POS or accounting systems.' },
              { icon: '🧠', title: 'GPT / Claude Merchant Copilot', desc: 'Secure backend AI with natural-language merchant analytics, weekly reports and recommendations.' },
              { icon: '✈️', title: 'Multi-tranche Travel Payments', desc: 'Travel Agency currently supports one scheduled tranche; multiple milestones are a future extension.' },
              { icon: '📬', title: 'Automated Travel Notifications', desc: 'Backend email/WhatsApp reminders for due and overdue scheduled payments.' },
            ].map(item => (
              <div key={item.title} className="card" style={{ padding: 20, opacity: 0.55 }}>
                <div style={{ fontSize: 24, marginBottom: 10 }}>{item.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{item.desc}</div>
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', display: 'inline-block' }}>Coming soon</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Limitations footer */}
      <div style={{ marginTop: 32, padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11, color: 'var(--text3)', lineHeight: 1.7 }}>
        <strong style={{ color: 'var(--text2)' }}>Analytics limitations:</strong> No backend. No database. No session/page analytics. No conversion tracking. No tax or accounting compliance. No production claims. Channel classification (Luxury vs Online) uses payment reference prefixes and purpose codes from localStorage — may show as "standard" for older payments. ArcScan links require a transaction hash stored in localStorage.
      </div>
    </div>
  )
}
