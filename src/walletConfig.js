// WalletConnect + wagmi configuration for ArcPay
import { createConfig, http } from 'wagmi'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { createWeb3Modal } from '@web3modal/wagmi/react'
import { defineChain } from 'viem'
import { QueryClient } from '@tanstack/react-query'

// WalletConnect project IDs are public identifiers, but production deployments
// should use their own ID via VITE_WALLETCONNECT_PROJECT_ID.
export const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '4f9c0612d410e857d5e4ef1003812ade'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})

const metadata = {
  name: 'ArcPay',
  description: 'USDC merchant payments, receipts and booking deposits on Arc Testnet',
  url: typeof window !== 'undefined' ? window.location.origin : 'https://arcpay.vercel.app',
  icons: [],
}

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected({ shimDisconnect: true }),
    walletConnect({ projectId: WC_PROJECT_ID, metadata, showQrModal: false }),
    coinbaseWallet({ appName: 'ArcPay' }),
  ],
  transports: {
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
  },
})

export const queryClient = new QueryClient()

createWeb3Modal({
  wagmiConfig,
  projectId: WC_PROJECT_ID,
  defaultChain: arcTestnet,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#2775ca',
    '--w3m-border-radius-master': '8px',
  },
  allowUnsupportedChain: false,
})
