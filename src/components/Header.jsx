import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount, useDisconnect } from 'wagmi'
import { shortAddress } from '../utils/wallet.js'

function Dropdown({ label, items, isActive }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="nav-dropdown" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          fontSize: 13, fontWeight: 500, padding: '5px 10px', borderRadius: 7,
          background: isActive ? 'var(--surface2)' : 'transparent',
          border: isActive ? '1px solid var(--border)' : '1px solid transparent',
          color: isActive ? 'var(--text)' : 'var(--text2)',
          display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {label}
        <span style={{ fontSize: 9, opacity: 0.6, marginTop: 1 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="nav-dropdown-menu">
          {items.map((item, i) => item === 'divider'
            ? <div key={i} className="nav-dropdown-divider" />
            : (
              <Link
                key={item.path}
                to={item.path}
                className={`nav-dropdown-item${item.active ? ' active' : ''}`}
                onClick={() => setOpen(false)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  )
}

function WalletMenu({ address, balance, open, disconnect, isCustomerPage }) {
  const [show, setShow] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setShow(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="nav-dropdown" ref={ref} style={{ flexShrink: 0 }}>
      <div
        onClick={() => setShow(s => !s)}
        style={{
          background: 'var(--surface2)', border: '1px solid var(--border)',
          borderRadius: 7, padding: '4px 10px', fontSize: 11,
          fontFamily: 'var(--mono)', color: 'var(--text)',
          display: 'flex', alignItems: 'center', gap: 5,
          cursor: 'pointer',
        }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
        {shortAddress(address)}
        <span style={{ fontSize: 8, opacity: 0.5 }}>▼</span>
      </div>
      {show && (
        <div className="nav-dropdown-menu" style={{ right: 0, left: 'auto', minWidth: 200 }}>
          {!isCustomerPage && (
            <>
              <Link to="/merchant-profile" className="nav-dropdown-item" onClick={() => setShow(false)}>
                <span>🏪</span><span>Merchant Profile</span>
              </Link>
              <div className="nav-dropdown-divider" />
            </>
          )}
          <div
            className="nav-dropdown-item"
            onClick={() => { navigator.clipboard.writeText(address); setShow(false) }}>
            <span>📋</span><span>Copy address</span>
          </div>
          <div
            className="nav-dropdown-item"
            onClick={() => { open(); setShow(false) }}>
            <span>🔗</span><span>Switch wallet</span>
          </div>
          <div
            className="nav-dropdown-item"
            onClick={() => { disconnect(); setShow(false) }}
            style={{ color: '#f08080' }}>
            <span>✕</span><span>Disconnect</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Header({ balance }) {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const { disconnect } = useDisconnect()
  const loc = useLocation()
  const p = loc.pathname

  // Customer routes — pagine dove il wallet è il pagatore
  const customerRoutes = ['/pay', '/booking/pay', '/travel/pay', '/receipt/', '/booking/', '/travel/', '/my-payments', '/my-bookings', '/my-travel', '/payment-success']
  const isCustomerRoute = customerRoutes.some(r => p.startsWith(r))

  const acceptActive  = ['/create', '/luxury', '/booking', '/travel'].some(r => p === r || p.startsWith(r + '/'))
  const reportsActive = ['/dashboard', '/booking-dashboard', '/analytics', '/merchant-profile', '/travel-dashboard', '/my-payments', '/my-bookings', '/my-travel'].some(r => p.startsWith(r))

  const acceptItems = [
    { path: '/create',  icon: '🔗', label: 'Online Payments',        active: p === '/create' },
    { path: '/luxury',  icon: '💎', label: 'Luxury Retail Checkout', active: p === '/luxury' },
    { path: '/booking', icon: '🏨', label: 'Hotel Booking Deposit',  active: p === '/booking' },
    { path: '/travel',  icon: '✈️', label: 'Travel Agency',          active: p === '/travel' },
  ]

  const merchantReportsItems = [
    { path: '/dashboard',         icon: '📊', label: 'Payments Dashboard',  active: p === '/dashboard' },
    { path: '/booking-dashboard', icon: '📋', label: 'Booking Dashboard',   active: p === '/booking-dashboard' },
    { path: '/travel-dashboard',  icon: '✈️', label: 'Travel Dashboard',    active: p === '/travel-dashboard' },
    'divider',
    { path: '/analytics',         icon: '📈', label: 'Analytics',           active: p === '/analytics' },
    { path: '/merchant-profile',  icon: '🏪', label: 'Merchant Profile',    active: p === '/merchant-profile' },
  ]

  const customerReportsItems = [
    { path: '/my-payments', icon: '💳', label: 'My Payments',  active: p === '/my-payments' },
    { path: '/my-bookings', icon: '🏨', label: 'My Bookings',  active: p === '/my-bookings' },
    { path: '/my-travel',   icon: '✈️', label: 'My Travel',    active: p === '/my-travel' },
  ]

  const reportsItems = isCustomerRoute ? customerReportsItems : merchantReportsItems

  return (
    <>
      <div style={{
        background: '#1a0a0a', borderBottom: '1px solid #4a1515',
        padding: '6px 20px', textAlign: 'center',
        fontSize: 12, color: '#e08080',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        <span style={{ color: '#f04f4f' }}>⚠</span>
        <strong>TESTNET ONLY</strong> — Testnet tokens have no real economic value. Not a financial service.
      </div>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px' }}>
        <div style={{
          maxWidth: 'var(--max-width)', margin: '0 auto', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', height: 54,
        }}>
          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, background: 'var(--usdc)',
              borderRadius: 7, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff',
            }}>A</div>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.3px' }}>
              ArcPay
            </div>
          </Link>

          {/* Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {!isCustomerRoute && (
              <Link to="/" style={{
                fontSize: 13, fontWeight: 500, padding: '5px 10px', borderRadius: 7,
                color: p === '/' ? 'var(--text)' : 'var(--text2)',
                background: p === '/' ? 'var(--surface2)' : 'transparent',
                border: p === '/' ? '1px solid var(--border)' : '1px solid transparent',
                textDecoration: 'none', transition: 'all 0.15s',
              }}>Home</Link>
            )}
            {!isCustomerRoute && <Dropdown label="Accept USDC" items={acceptItems} isActive={acceptActive} />}
            <Dropdown label="Reports" items={reportsItems} isActive={reportsActive} />
          </nav>

          {/* Wallet */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {isConnected && balance && (
              <span style={{ fontSize: 11, color: 'var(--usdc)', fontFamily: 'var(--mono)', fontWeight: 500 }}>
                {balance} USDC
              </span>
            )}
            {isConnected ? (
              <WalletMenu address={address} balance={balance} open={open} disconnect={disconnect} isCustomerPage={isCustomerRoute} />
            ) : (
              <button
                onClick={() => open()}
                className="btn-primary"
                style={{ fontSize: 12, padding: '6px 14px', flexShrink: 0 }}
              >
                Connect
              </button>
            )}
          </div>
        </div>
      </header>
    </>
  )
}
