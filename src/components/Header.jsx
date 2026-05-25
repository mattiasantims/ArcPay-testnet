import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount, useDisconnect } from 'wagmi'
import { shortAddress } from '../utils/wallet.js'

// ── Dropdown (desktop) ────────────────────────────────────────────────────────
function Dropdown({ label, items, isActive }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="nav-dropdown" ref={ref}>
      <button onClick={() => setOpen(o => !o)} style={{
        fontSize: 13, fontWeight: 500, padding: '5px 10px', borderRadius: 7,
        background: isActive ? 'var(--surface2)' : 'transparent',
        border: isActive ? '1px solid var(--border)' : '1px solid transparent',
        color: isActive ? 'var(--text)' : 'var(--text2)',
        display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
      }}>
        {label}
        <span style={{ fontSize: 9, opacity: 0.6, marginTop: 1 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="nav-dropdown-menu">
          {items.map((item, i) => item === 'divider'
            ? <div key={i} className="nav-dropdown-divider" />
            : (
              <Link key={item.path} to={item.path}
                className={`nav-dropdown-item${item.active ? ' active' : ''}`}
                onClick={() => setOpen(false)}>
                <span>{item.icon}</span><span>{item.label}</span>
              </Link>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── Wallet menu ───────────────────────────────────────────────────────────────
function WalletMenu({ address, open, disconnect, isCustomerPage, onClose }) {
  const [show, setShow] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="nav-dropdown" ref={ref} style={{ flexShrink: 0 }}>
      <div onClick={() => setShow(s => !s)} style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 7, padding: '4px 10px', fontSize: 11,
        fontFamily: 'var(--mono)', color: 'var(--text)',
        display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)' }} />
        {shortAddress(address)}
        <span style={{ fontSize: 8, opacity: 0.5 }}>▼</span>
      </div>
      {show && (
        <div className="nav-dropdown-menu" style={{ right: 0, left: 'auto', minWidth: 200 }}>
          {!isCustomerPage && (
            <>
              <Link to="/merchant-profile" className="nav-dropdown-item"
                onClick={() => { setShow(false); onClose?.() }}>
                <span>🏪</span><span>Merchant Profile</span>
              </Link>
              <div className="nav-dropdown-divider" />
            </>
          )}
          <div className="nav-dropdown-item"
            onClick={() => { navigator.clipboard.writeText(address); setShow(false) }}>
            <span>📋</span><span>Copy address</span>
          </div>
          <div className="nav-dropdown-item"
            onClick={() => { disconnect(); setShow(false); onClose?.() }}
            style={{ color: '#f08080' }}>
            <span>✕</span><span>Disconnect</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Header ───────────────────────────────────────────────────────────────
export default function Header({ balance }) {
  const { address, isConnected } = useAccount()
  const { open }       = useWeb3Modal()
  const { disconnect } = useDisconnect()
  const loc = useLocation()
  const p   = loc.pathname

  const [menuOpen, setMenuOpen] = useState(false)

  // Close mobile menu on route change
  useEffect(() => { setMenuOpen(false) }, [p])

  const searchParams   = new URLSearchParams(location.search)
  const isMerchantMode = searchParams.get('mode') === 'merchant'
  const isLandingPage  = p === '/'
  const customerRoutes = ['/pay', '/booking/pay', '/travel/pay', '/receipt/', '/booking/', '/travel/', '/my-payments', '/my-bookings', '/my-travel', '/payment-success', '/customer']
  const isCustomerRoute = (customerRoutes.some(r => p.startsWith(r)) && !isMerchantMode) || isLandingPage

  const acceptActive  = ['/create', '/luxury', '/booking', '/travel'].some(r => p === r || p.startsWith(r + '/'))
  const reportsActive = ['/dashboard', '/booking-dashboard', '/analytics', '/merchant-profile', '/travel-dashboard', '/my-payments', '/my-bookings', '/my-travel'].some(r => p.startsWith(r))

  const acceptItems = [
    { path: '/create',  icon: '🔗', label: 'Online Payments',        active: p === '/create' },
    { path: '/luxury',  icon: '💎', label: 'Luxury Retail Checkout', active: p === '/luxury' },
    { path: '/booking', icon: '🏨', label: 'Hotel Booking Deposit',  active: p === '/booking' },
    { path: '/travel',  icon: '✈️', label: 'Travel Agency',          active: p === '/travel' },
  ]
  const merchantReportsItems = [
    { path: '/dashboard',         icon: '📊', label: 'Payments Dashboard', active: p === '/dashboard' },
    { path: '/booking-dashboard', icon: '📋', label: 'Booking Dashboard',  active: p === '/booking-dashboard' },
    { path: '/travel-dashboard',  icon: '✈️', label: 'Travel Dashboard',   active: p === '/travel-dashboard' },
    'divider',
    { path: '/analytics',         icon: '📈', label: 'Analytics',          active: p === '/analytics' },
    { path: '/merchant-profile',  icon: '🏪', label: 'Merchant Profile',   active: p === '/merchant-profile' },
  ]
  const customerReportsItems = [
    { path: '/my-payments', icon: '💳', label: 'My Payments', active: p === '/my-payments' },
    { path: '/my-bookings', icon: '🏨', label: 'My Bookings', active: p === '/my-bookings' },
    { path: '/my-travel',   icon: '✈️', label: 'My Travel',   active: p === '/my-travel' },
  ]
  const reportsItems = isCustomerRoute ? customerReportsItems : merchantReportsItems

  // All nav links flat (for mobile drawer)
  const allNavItems = [
    { path: '/', icon: '🏠', label: 'Home' },
    ...(!isCustomerRoute ? acceptItems : []),
    ...reportsItems,
  ]

  return (
    <>
      {/* Testnet banner */}
      <div style={{
        background: '#1a0a0a', borderBottom: '1px solid #4a1515',
        padding: '5px 16px', textAlign: 'center',
        fontSize: 11, color: '#e08080',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      }}>
        <span style={{ color: '#f04f4f' }}>⚠</span>
        <strong>TESTNET ONLY</strong> — Testnet tokens have no real economic value. Not a financial service.
      </div>

      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 16px' }}>
        <div style={{
          maxWidth: 'var(--max-width)', margin: '0 auto',
          display: 'flex', alignItems: 'center', height: 52, gap: 8,
        }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <div style={{
              width: 26, height: 26, background: 'var(--usdc)', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>A</div>
            <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, color: 'var(--text)', letterSpacing: '-0.3px' }}>
              ArcPay
            </span>
          </Link>

          {/* ── Desktop nav (hidden on mobile) ── */}
          {!isLandingPage && (
            <nav style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}
              className="desktop-nav">
              <Link to="/" style={{
                fontSize: 13, fontWeight: 500, padding: '5px 10px', borderRadius: 7,
                color: p === '/' ? 'var(--text)' : 'var(--text2)', textDecoration: 'none',
                background: p === '/' ? 'var(--surface2)' : 'transparent',
                border: p === '/' ? '1px solid var(--border)' : '1px solid transparent',
              }}>Home</Link>
              {!isCustomerRoute && <Dropdown label="Accept USDC" items={acceptItems} isActive={acceptActive} />}
              <Dropdown label="Reports" items={reportsItems} isActive={reportsActive} />
            </nav>
          )}

          {/* ── Merchant / Customer switcher — desktop centre ── */}
          {!isLandingPage && (
            <div style={{ display: 'flex', gap: 5, margin: '0 auto' }} className="desktop-switcher">
              <Link to="/merchant" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid var(--border)',
                  background: p.startsWith('/merchant') ? 'var(--surface2)' : 'transparent',
                  color: p.startsWith('/merchant') ? 'var(--text)' : 'var(--text3)',
                }}>🏪 Merchant</button>
              </Link>
              <Link to="/customer" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', border: '1px solid var(--border)',
                  background: p.startsWith('/customer') ? 'var(--surface2)' : 'transparent',
                  color: p.startsWith('/customer') ? 'var(--text)' : 'var(--text3)',
                }}>💳 Customer</button>
              </Link>
            </div>
          )}

          {/* ── Wallet area ── */}
          {!isLandingPage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: isLandingPage ? 'auto' : undefined }}>
              {isConnected && balance && (
                <span style={{ fontSize: 11, color: 'var(--usdc)', fontFamily: 'var(--mono)', fontWeight: 500 }}
                  className="desktop-balance">
                  {balance} USDC
                </span>
              )}
              {isConnected ? (
                <WalletMenu address={address} open={open} disconnect={disconnect}
                  isCustomerPage={isCustomerRoute} onClose={() => setMenuOpen(false)} />
              ) : (
                <button onClick={() => open()} className="btn-primary"
                  style={{ fontSize: 12, padding: '5px 12px', flexShrink: 0 }}>
                  Connect
                </button>
              )}
            </div>
          )}

          {/* ── Hamburger (mobile only) ── */}
          {!isLandingPage && (
            <button
              onClick={() => setMenuOpen(o => !o)}
              className="hamburger-btn"
              aria-label="Menu"
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 7, padding: '5px 8px', cursor: 'pointer',
                color: 'var(--text)', fontSize: 16, flexShrink: 0,
                display: 'none', // shown via CSS on mobile
              }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          )}
        </div>
      </header>

      {/* ── Mobile drawer ── */}
      {menuOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 999, background: 'rgba(0,0,0,0.5)',
        }} onClick={() => setMenuOpen(false)}>
          <div style={{
            position: 'absolute', top: 0, right: 0, width: 280, height: '100%',
            background: 'var(--surface)', borderLeft: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            {/* Drawer header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 15 }}>ArcPay</span>
              <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Merchant / Customer switcher */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
              <Link to="/merchant" style={{ flex: 1, textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
                <button style={{ width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: p.startsWith('/merchant') ? 'var(--surface2)' : 'transparent', color: p.startsWith('/merchant') ? 'var(--text)' : 'var(--text3)' }}>
                  🏪 Merchant
                </button>
              </Link>
              <Link to="/customer" style={{ flex: 1, textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>
                <button style={{ width: '100%', padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--border)', background: p.startsWith('/customer') ? 'var(--surface2)' : 'transparent', color: p.startsWith('/customer') ? 'var(--text)' : 'var(--text3)' }}>
                  💳 Customer
                </button>
              </Link>
            </div>

            {/* Nav links */}
            <div style={{ padding: '8px 0', flex: 1 }}>
              {allNavItems.map((item, i) => (
                <Link key={item.path + i} to={item.path}
                  onClick={() => setMenuOpen(false)}
                  style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 20px', fontSize: 14,
                    background: p === item.path ? 'var(--surface2)' : 'transparent',
                    color: p === item.path ? 'var(--text)' : 'var(--text2)',
                    borderLeft: p === item.path ? '3px solid var(--usdc)' : '3px solid transparent',
                  }}>
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Balance in drawer */}
            {isConnected && balance && (
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--usdc)', fontFamily: 'var(--mono)', fontWeight: 500 }}>
                {balance} USDC
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Responsive CSS ── */}
      <style>{`
        @media (max-width: 640px) {
          .desktop-nav      { display: none !important; }
          .desktop-switcher { display: none !important; }
          .desktop-balance  { display: none !important; }
          .hamburger-btn    { display: flex !important; }
        }
        @media (min-width: 641px) {
          .hamburger-btn { display: none !important; }
        }
      `}</style>
    </>
  )
}
