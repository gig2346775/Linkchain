// ==========================================================
// WALLET CONFIG — edit this file to customize the app
// ==========================================================

const CONFIG = {
  appName: "Linkchain",
  appTagline: "One key. Every chain.",

  // WalletConnect Cloud project ID (get one free at cloud.walletconnect.com)
  // Leave blank to disable the WalletConnect button (MetaMask still works)
  walletConnectProjectId: "",

  // Firebase project credentials (Project Settings > General > Your apps > SDK config)
  // Backend powers: saved contacts, cross-device transaction history,
  // and the multi-chain portfolio dashboard.
  firebaseConfig: {
    apiKey: "AIzaSyBttgrYiImmwDh0TmGyxF8Wh3-bKDOYjzk",
    authDomain: "linkchain-97130.firebaseapp.com",
    projectId: "linkchain-97130",
    storageBucket: "linkchain-97130.firebasestorage.app",
    messagingSenderId: "188751666889",
    appId: "1:188751666889:web:f68196e8a941d03b0ef718"
  },

  // Chains available in the network switcher.
  // chainIdHex must be the hex chain id (e.g. Ethereum = 0x1)
  chains: [
    {
      name: "Ethereum",
      symbol: "ETH",
      chainIdHex: "0x1",
      rpcUrl: "https://cloudflare-eth.com",
      explorer: "https://etherscan.io",
      color: "#627EEA"
    },
    {
      name: "Polygon",
      symbol: "MATIC",
      chainIdHex: "0x89",
      rpcUrl: "https://polygon-rpc.com",
      explorer: "https://polygonscan.com",
      color: "#8247E5"
    },
    {
      name: "BNB Chain",
      symbol: "BNB",
      chainIdHex: "0x38",
      rpcUrl: "https://bsc-dataseed.binance.org",
      explorer: "https://bscscan.com",
      color: "#F0B90B"
    },
    {
      name: "Arbitrum",
      symbol: "ETH",
      chainIdHex: "0xa4b1",
      rpcUrl: "https://arb1.arbitrum.io/rpc",
      explorer: "https://arbiscan.io",
      color: "#28A0F0"
    },
    {
      name: "Optimism",
      symbol: "ETH",
      chainIdHex: "0xa",
      rpcUrl: "https://mainnet.optimism.io",
      explorer: "https://optimistic.etherscan.io",
      color: "#FF0420"
    }
  ]
};