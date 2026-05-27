import { useState, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import Header from './components/Header.jsx'
import { isMerchantRegistryConfigured } from './config.js'
import { getMerchantIdByWallet } from './utils/merchant.js'
import Footer from './components/Footer.jsx'
import HomePage              from './pages/HomePage.jsx'
import LandingPage           from './pages/LandingPage.jsx'
import MerchantHomePage      from './pages/MerchantHomePage.jsx'
import CustomerHomePage      from './pages/CustomerHomePage.jsx'
import CreatePaymentPage     from './pages/CreatePaymentPage.jsx'
import CheckoutPage          from './pages/CheckoutPage.jsx'
import ReceiptPage           from './pages/ReceiptPage.jsx'
import DashboardPage         from './pages/DashboardPage.jsx'
import QRPage                from './pages/QRPage.jsx'
import MerchantDemoPage      from './pages/MerchantDemoPage.jsx'
import LuxuryRetailPage      from './pages/LuxuryRetailPage.jsx'
import BookingPage           from './pages/BookingPage.jsx'
import BookingCheckoutPage   from './pages/BookingCheckoutPage.jsx'
import BookingDetailsPage    from './pages/BookingDetailsPage.jsx'
import BookingDashboardPage  from './pages/BookingDashboardPage.jsx'
import AnalyticsPage         from './pages/AnalyticsPage.jsx'
import MerchantProfilePage   from './pages/MerchantProfilePage.jsx'
import MyPaymentsPage        from './pages/MyPaymentsPage.jsx'
import MyBookingsPage        from './pages/MyBookingsPage.jsx'
import MyTravelPage          from './pages/MyTravelPage.jsx'
import MerchantPayoutPage    from './pages/MerchantPayoutPage.jsx'
import PayoutDashboardPage   from './pages/PayoutDashboardPage.jsx'
import PayoutDetailsPage     from './pages/PayoutDetailsPage.jsx'
import MyPayoutsPage         from './pages/MyPayoutsPage.jsx'
import TravelAgencyPage      from './pages/TravelAgencyPage.jsx'
import TravelCheckoutPage    from './pages/TravelCheckoutPage.jsx'
import TravelDetailsPage     from './pages/TravelDetailsPage.jsx'
import TravelDashboardPage      from './pages/TravelDashboardPage.jsx'
import CommitmentDashboardPage from './pages/CommitmentDashboardPage.jsx'
import CommitmentDetailsPage   from './pages/CommitmentDetailsPage.jsx'
import MyCommitmentsPage       from './pages/MyCommitmentsPage.jsx'
import PaymentSuccessPage       from './pages/PaymentSuccessPage.jsx'
import { getUsdcBalance } from './utils/receipts.js'

export default function App() {
  const { address, isConnected } = useAccount()
  const { open } = useWeb3Modal()
  const [balance,    setBalance]    = useState(null)
  const [connecting, setConnecting] = useState(false)
  const [showProfilePrompt, setShowProfilePrompt] = useState(false)
  const location = useLocation()
  const isQRPage = location.pathname === '/qr'
  const searchParams = new URLSearchParams(location.search)
  const isMerchantMode = searchParams.get('mode') === 'merchant'
  const customerPaths = ['/pay', '/booking/pay', '/travel/pay', '/receipt/', '/booking/', '/travel/', '/commitment/', '/my-payments', '/my-bookings', '/my-travel', '/my-commitments', '/my-payouts', '/payment-success']
  const isCustomerPage = customerPaths.some(p => p.endsWith('/') ? location.pathname.startsWith(p) : (location.pathname === p || location.pathname.startsWith(p + '/'))) && !isMerchantMode

  // Load balance when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      getUsdcBalance(address).then(setBalance).catch(() => {})
    } else {
      setBalance(null)
    }
  }, [address, isConnected])

  // Mostra popup se wallet connesso e non registrato nel registry
  useEffect(() => {
    if (!isConnected || !address || !isMerchantRegistryConfigured()) return
    getMerchantIdByWallet(address).then(id => {
      if (!id || id === 0n || id.toString() === '0') {
        setShowProfilePrompt(true)
      } else {
        setShowProfilePrompt(false)
      }
    }).catch(() => {})
  }, [address, isConnected])


  // For legacy pages that call connectWallet() directly,
  // we still support window.ethereum. WalletConnect is handled
  // via the <w3m-button> in Header.
  async function handleConnect() {
    setConnecting(true)
    try {
      if (window.ethereum) {
        await window.ethereum.request({ method: 'eth_requestAccounts' })
        const chainId  = await window.ethereum.request({ method: 'eth_chainId' })
        if (parseInt(chainId, 16) !== 5042002) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0x4cef52' }],
            })
          } catch (e) {
            if (e.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x4cef52',
                  chainName: 'Arc Testnet',
                  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
                  rpcUrls: ['https://rpc.testnet.arc.network'],
                  blockExplorerUrls: ['https://testnet.arcscan.app'],
                }],
              })
            } else throw e
          }
        }
        return
      }
      // If no injected wallet exists, open WalletConnect/Web3Modal so mobile
      // users can connect from merchant creation/dashboard pages too.
      await open()
    } catch (e) {
      alert(e.message)
    } finally {
      setConnecting(false)
    }
  }

  const account = isConnected ? address : null
  const shared = { account, balance, onConnect: handleConnect, connecting }

  if (isQRPage) return (
    <Routes><Route path="/qr" element={<QRPage />} /></Routes>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Header {...shared} />
      <main style={{ flex: 1, maxWidth: 'var(--max-width)', margin: '0 auto', width: '100%', padding: '28px 24px 48px' }}>
        <Routes>
          <Route path="/"                   element={<LandingPage />} />
          <Route path="/home"                element={<HomePage             {...shared} />} />
          <Route path="/create"             element={<CreatePaymentPage    {...shared} />} />
          <Route path="/pay"                element={<CheckoutPage />} />
          <Route path="/receipt/:id"        element={<ReceiptPage />} />
          <Route path="/dashboard"          element={<DashboardPage        {...shared} />} />
          <Route path="/demo"               element={<MerchantDemoPage account={account} />} />
          <Route path="/luxury"             element={<LuxuryRetailPage     {...shared} />} />
          <Route path="/booking"            element={<BookingPage          {...shared} />} />
          <Route path="/booking/pay"        element={<BookingCheckoutPage />} />
          <Route path="/booking/:id"        element={<BookingDetailsPage />} />
          <Route path="/booking-dashboard"  element={<BookingDashboardPage {...shared} />} />
          <Route path="/analytics"          element={<AnalyticsPage        {...shared} />} />
          <Route path="/merchant"          element={<MerchantHomePage />} />
          <Route path="/customer"           element={<CustomerHomePage />} />
          <Route path="/merchant-profile"   element={<MerchantProfilePage />} />
          <Route path="/my-payments"       element={<MyPaymentsPage />} />
          <Route path="/my-bookings"       element={<MyBookingsPage />} />
          <Route path="/my-travel"         element={<MyTravelPage />} />
          <Route path="/travel"             element={<TravelAgencyPage     {...shared} />} />
          <Route path="/travel/pay"         element={<TravelCheckoutPage />} />
          <Route path="/travel/:id"         element={<TravelDetailsPage />} />
          <Route path="/travel-dashboard"      element={<TravelDashboardPage      {...shared} />} />
          <Route path="/payouts"              element={<MerchantPayoutPage   {...shared} />} />
          <Route path="/payout-dashboard"     element={<PayoutDashboardPage  {...shared} />} />
          <Route path="/payout/:id"           element={<PayoutDetailsPage />} />
          <Route path="/my-payouts"           element={<MyPayoutsPage />} />
          <Route path="/commitment-dashboard"  element={<CommitmentDashboardPage {...shared} />} />
          <Route path="/commitment/:id"         element={<CommitmentDetailsPage />} />
          <Route path="/my-commitments"         element={<MyCommitmentsPage />} />
          <Route path="/payment-success"        element={<PaymentSuccessPage />} />
          <Route path="/qr"                 element={<QRPage />} />
        </Routes>
      </main>
      <Footer />
      {/* Popup profilo merchant per nuovi wallet */}
      {showProfilePrompt && !isCustomerPage && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: 'var(--surface)', border: '1px solid var(--usdc)',
          borderRadius: 12, padding: '16px 20px', maxWidth: 300,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>🏪 Set up your merchant profile</div>
            <button onClick={() => setShowProfilePrompt(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1, marginLeft: 8 }}>✕</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 }}>
            Register your merchant profile to start accepting USDC payments on Arc.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/merchant-profile" style={{ flex: 1, textDecoration: 'none' }} onClick={() => setShowProfilePrompt(false)}>
              <button className="btn-primary" style={{ width: '100%', padding: '8px', fontSize: 12 }}>
                Set up profile
              </button>
            </a>
            <button onClick={() => setShowProfilePrompt(false)} className="btn-ghost" style={{ padding: '8px 14px', fontSize: 12 }}>
              Later
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
