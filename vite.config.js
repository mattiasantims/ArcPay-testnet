import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // build v2
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  resolve: {
    alias: {
      // WalletConnect requires these Node.js built-ins
      'util': 'util/',
    },
  },
  optimizeDeps: {
    include: ['@web3modal/wagmi', 'wagmi', '@wagmi/core', '@tanstack/react-query'],
  },
  build: {
    rollupOptions: {
      external: [],
    },
  },
})
