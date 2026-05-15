// wallet.js — WalletConnect + wagmi powered wallet utilities
// Drop-in replacement: same API (connectWallet, getPublicClient, getWalletClient)
// Now supports MetaMask browser extension AND WalletConnect mobile QR

import { createPublicClient, createWalletClient, custom, http } from 'viem'
import { getAccount, getWalletClient as wagmiGetWalletClient, reconnect } from '@wagmi/core'
import { wagmiConfig, arcTestnet } from '../walletConfig.js'
import { ARC_TESTNET, CHAIN_ID_HEX } from '../config.js'

// ─── Public client (read-only, no wallet needed) ──────────────────────────────
export function getPublicClient() {
  return createPublicClient({
    chain:     ARC_TESTNET,
    transport: http('https://rpc.testnet.arc.network'),
  })
}

// ─── Wallet client (write, needs connected wallet) ────────────────────────────
export function getWalletClient() {
  // Try wagmi first (WalletConnect or injected)
  const { connector } = getAccount(wagmiConfig)
  if (connector) {
    // Return a wagmi-backed wallet client proxy
    return _wagmiWalletClientProxy()
  }
  // Fallback to window.ethereum (MetaMask extension)
  if (window.ethereum) {
    return createWalletClient({
      chain:     ARC_TESTNET,
      transport: custom(window.ethereum),
    })
  }
  throw new Error('No wallet connected. Please connect via the Connect button.')
}

// Proxy: wraps wagmi writeContract for receipts.js / booking.js
function _wagmiWalletClientProxy() {
  return {
    writeContract: async (request) => {
      const wc = await wagmiGetWalletClient(wagmiConfig)
      if (!wc) throw new Error('Wallet client not available')
      return wc.writeContract(request)
    },
    account: getAccount(wagmiConfig).address,
  }
}

// ─── Connect wallet — opens Web3Modal (MetaMask + WalletConnect) ──────────────
export async function connectWallet() {
  // Open Web3Modal — user picks MetaMask or WalletConnect
  const modal = await import('@web3modal/wagmi')
  const { open } = modal.useWeb3Modal ? modal : { open: null }

  // Web3Modal is opened via the button in Header — here we handle the legacy
  // programmatic connect for pages that call connectWallet() directly
  if (window.ethereum) {
    // Browser has injected wallet — use it directly for speed
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      const chainId  = await window.ethereum.request({ method: 'eth_chainId' })
      if (parseInt(chainId, 16) !== 5042002) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: CHAIN_ID_HEX }],
          })
        } catch (e) {
          if (e.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId:           CHAIN_ID_HEX,
                chainName:         'Arc Testnet',
                nativeCurrency:    { name: 'USDC', symbol: 'USDC', decimals: 18 },
                rpcUrls:           ['https://rpc.testnet.arc.network'],
                blockExplorerUrls: ['https://testnet.arcscan.app'],
              }],
            })
          } else throw e
        }
      }
      return accounts[0]
    } catch (e) {
      throw e
    }
  }

  // No injected wallet — trigger Web3Modal for WalletConnect
  // This is handled by the <w3m-button> in Header
  throw new Error('No browser wallet found. Use the Connect button in the header to connect via WalletConnect.')
}

// ─── Get connected account from wagmi (used by App.jsx) ──────────────────────
export function getConnectedAccount() {
  const { address, isConnected } = getAccount(wagmiConfig)
  return isConnected ? address : null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function shortAddress(addr) {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function isValidAddress(addr) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}
