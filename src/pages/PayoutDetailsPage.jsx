import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAccount } from 'wagmi'
import {
  fetchPayout, fetchPayoutTxHash, fetchCounterparty,
  fmtUsdc, formatTs, PAYOUT_PURPOSE_CODES, payoutPageUrl, arcScanTxUrl,
} from '../utils/payout.js'
import { buildPayoutReceiptObject, downloadPayoutReceiptPDF, downloadPayoutReceiptJSON } from '../utils/payoutPdf.js'
import { isMerchantPayoutsConfigured, isMerchantRegistryConfigured, ARCSCAN_BASE, APP_URL } from '../config.js'
import { getMerchantByWallet } from '../utils/merchant.js'

const PURPOSE_LABEL = Object.fromEntries(PAYOUT_PURPOSE_CODES.map(p => [p.value, p.label]))

export default function PayoutDetailsPage() {
  const { id } = useParams()
  const { address } = useAccount()
  const configured = isMerchantPayoutsConfigured()

  const [payout,          setPayout]          = useState(null)
  const [counterparty,    setCounterparty]    = useState(null)
  const [merchantProfile, setMerchantProfile] = useState(null)
  const [txHash,        setTxHash]        = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')

  useEffect(() => {
    if (!id || !configured) return
    setLoading(true); setError('')
    fetchPayout(id).then(async p => {
      const enriched = { ...p, id }
      setPayout(enriched)
      // Counterparty alias if present
      if (p.counterpartyId && BigInt(p.counterpartyId) > 0n) {
        try {
          const c = await fetchCounterparty(p.counterpartyId.toString())
          setCounterparty(c)
        } catch {}
      }
      // Merchant profile (registered identity)
      if (isMerchantRegistryConfigured()) {
        getMerchantByWallet(p.merchant).then(m => {
          if (m && m.tradingName) setMerchantProfile(m)
        }).catch(() => {})
      }
      // TX hash
      fetchPayoutTxHash(enriched).then(setTxHash).catch(() => {})
    }).catch(e => {
      console.error(e)
      setError('Payout not found.')
    }).finally(() => setLoading(false))
  }, [id, configured])

  if (!configured) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
      <p style={{ color: 'var(--yellow)', fontSize: 14 }}>Merchant Payouts contract not configured.</p>
    </div>
  )

  if (loading) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <span className="spinner" /> Loading payout...
    </div>
  )

  if (error || !payout) return (
    <div className="card fade-up" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
      <p style={{ color: 'var(--text2)', fontSize: 14 }}>{error || 'Payout not found.'}</p>
      <Link to="/payout-dashboard" style={{ textDecoration: 'none' }}>
        <button className="btn-ghost" style={{ marginTop: 14, fontSize: 13 }}>← Back to Dashboard</button>
      </Link>
    </div>
  )

  const isBatch    = payout.batchRefHash && payout.batchRefHash !== '0x' + '0'.repeat(64)
  const aliasName  = counterparty?.aliasName || ''
  const category   = counterparty?.category  || ''
  const receipt    = buildPayoutReceiptObject(payout, txHash, aliasName, category, merchantProfile)
  const isMerchant = address && address.toLowerCase() === payout.merchant.toLowerCase()
  const isRecipient = address && address.toLowerCase() === payout.recipient.toLowerCase()

  return (
    <div className="fade-up">
      <div style={{ marginBottom: 16 }}>
        <Link to={isRecipient ? '/my-payouts' : '/payout-dashboard'} style={{ textDecoration: 'none', fontSize: 13, color: 'var(--text2)' }}>← Back</Link>
      </div>

      <div className="card" style={{ padding: 22, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              {isBatch ? 'Batch Payout Item' : 'Single Payout'}
            </div>
            <h1 style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, letterSpacing: '-0.5px', marginBottom: 4 }}>
              Payout Receipt · {payout.paymentRef}
            </h1>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>{formatTs(payout.createdAt)}</div>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--usdc)', fontFamily: 'var(--display)' }}>
            {fmtUsdc(payout.amount)} USDC
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {aliasName && (
            <Row k="Counterparty" v={<><span className="badge badge-blue" style={{ fontSize: 11 }}>{aliasName}</span> <span style={{ color: 'var(--text3)', fontSize: 11, marginLeft: 4 }}>{category}</span></>} />
          )}
          <Row k="Purpose"      v={PURPOSE_LABEL[payout.purposeCode] || payout.purposeCode} />
          <Row k="Description"  v={payout.description} />
          {merchantProfile?.tradingName && (
            <Row k="Merchant"      v={merchantProfile.tradingName} />
          )}
          {merchantProfile?.legalName && (
            <Row k="Legal name"    v={merchantProfile.legalName} />
          )}
          {merchantProfile?.country && (
            <Row k="Country"       v={merchantProfile.country} />
          )}
          {merchantProfile?.businessAddress && (
            <Row k="Address"       v={merchantProfile.businessAddress} />
          )}
          {merchantProfile?.vatOrCompanyId && (
            <Row k="VAT / Company ID" v={merchantProfile.vatOrCompanyId} />
          )}
          {merchantProfile?.lei && (
            <Row k="LEI"           v={merchantProfile.lei} />
          )}
          <Row k="Merchant wallet" v={<span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{payout.merchant}</span>} />
          <Row k="Recipient"    v={<span style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{payout.recipient}</span>} />
          <Row k="Network"      v="Arc Testnet · Chain ID 5042002" />
          {payout.metadataHash && payout.metadataHash !== '0x' + '0'.repeat(64) && (
            <Row k="Metadata Hash" v={<span style={{ fontFamily: 'var(--mono)', fontSize: 10, wordBreak: 'break-all' }}>{payout.metadataHash}</span>} />
          )}
          {txHash ? (
            <Row k="TX Hash" v={<span style={{ fontFamily: 'var(--mono)', fontSize: 10, wordBreak: 'break-all' }}>{txHash}</span>} />
          ) : (
            <Row k="TX Hash" v={<span style={{ fontStyle: 'italic', color: 'var(--text3)', fontSize: 11 }}>recovering...</span>} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => downloadPayoutReceiptPDF(receipt)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>🖨️ PDF</button>
          <button onClick={() => downloadPayoutReceiptJSON(receipt)} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>📄 JSON</button>
          {txHash && (
            <a href={arcScanTxUrl(txHash)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <button className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>ArcScan ↗</button>
            </a>
          )}
          <button onClick={() => navigator.clipboard.writeText(payoutPageUrl(id))} className="btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>🔗 Copy link</button>
        </div>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text3)', textAlign: 'center', padding: '0 16px', lineHeight: 1.5 }}>
        Testnet demo only. Payout labels, descriptions and references may be publicly visible on-chain. Do not include personal, payroll, tax or confidential information.
      </div>
    </div>
  )
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text2)', minWidth: 110 }}>{k}</span>
      <span style={{ fontSize: 13, color: 'var(--text)', textAlign: 'right', flex: 1, wordBreak: 'break-word' }}>{v}</span>
    </div>
  )
}
