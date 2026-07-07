// ==========================================================
// WALLET CONFIG — edit this file to customize the app
// ==========================================================

const CONFIG = {
  appName: "Linkchain",
  appTagline: "Your Solana wallet, in orbit.",

  solana: {
    cluster: "mainnet-beta",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    explorer: "https://explorer.solana.com"
  },

  // Firebase project credentials (Project Settings > General > Your apps > SDK config)
  // Backend powers: saved contacts, cross-device transaction history,
  // and the portfolio dashboard.
  // If reusing the same Firebase project as another site, that's fine —
  // this app stores its data under the "solUsers" collection so it never
  // collides with data from other apps in the same project.
  firebaseConfig: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  }
};
