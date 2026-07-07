// ==========================================================
// Linkchain wallet — connects to MetaMask, reads balances,
// switches EVM networks, and sends native-token transactions.
// No private keys are ever handled by this site.
// ==========================================================

let provider = null;
let signer = null;
let userAddress = null;
let activeChain = CONFIG.chains[0];
let auth = null;
let db = null;
let dbUser = null;

const connectBtn = document.getElementById('connectBtn');
const networkSelect = document.getElementById('networkSelect');
const accountPill = document.getElementById('accountPill');
const accountAddress = document.getElementById('accountAddress');
const balanceValue = document.getElementById('balanceValue');
const balanceSymbol = document.getElementById('balanceSymbol');
const balanceFiat = document.getElementById('balanceFiat');
const sendOpenBtn = document.getElementById('sendOpenBtn');
const receiveOpenBtn = document.getElementById('receiveOpenBtn');
const refreshBtn = document.getElementById('refreshBtn');
const sendPanel = document.getElementById('sendPanel');
const receivePanel = document.getElementById('receivePanel');
const sendForm = document.getElementById('sendForm');
const amountSymbol = document.getElementById('amountSymbol');
const sendStatus = document.getElementById('sendStatus');
const receiveAddress = document.getElementById('receiveAddress');
const copyAddressBtn = document.getElementById('copyAddressBtn');
const historyList = document.getElementById('historyList');
const toast = document.getElementById('toast');
const walletCard = document.getElementById('walletCard');
const contactsOpenBtn = document.getElementById('contactsOpenBtn');
const contactsPanel = document.getElementById('contactsPanel');
const contactsList = document.getElementById('contactsList');
const contactForm = document.getElementById('contactForm');
const portfolioSection = document.getElementById('portfolioSection');
const portfolioGrid = document.getElementById('portfolioGrid');

init();

function init() {
  renderChainPills();
  bindUI();
  tiltCard();
  initFirebase();

  if (window.ethereum) {
    window.ethereum.on?.('accountsChanged', handleAccountsChanged);
    window.ethereum.on?.('chainChanged', () => window.location.reload());
  }
}

function initFirebase() {
  if (!CONFIG.firebaseConfig || CONFIG.firebaseConfig.apiKey.startsWith('YOUR_')) return;
  firebase.initializeApp(CONFIG.firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
}

function renderChainPills() {
  networkSelect.innerHTML = '';
  CONFIG.chains.forEach((chain) => {
    const pill = document.createElement('button');
    pill.className = 'chain-pill' + (chain.chainIdHex === activeChain.chainIdHex ? ' active' : '');
    pill.innerHTML = `<span class="chain-dot" style="background:${chain.color}"></span>${chain.name}`;
    pill.addEventListener('click', () => switchChain(chain));
    networkSelect.appendChild(pill);
  });
}

function bindUI() {
  connectBtn.addEventListener('click', connectWallet);
  sendOpenBtn.addEventListener('click', () => openPanel(sendPanel));
  receiveOpenBtn.addEventListener('click', () => {
    receiveAddress.textContent = userAddress || '—';
    openPanel(receivePanel);
  });
  refreshBtn.addEventListener('click', () => {
    updateBalance();
    if (db && dbUser) loadPortfolio();
  });
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById(btn.dataset.close).hidden = true;
    });
  });
  sendForm.addEventListener('submit', handleSend);
  copyAddressBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(userAddress || '');
    showToast('Address copied');
  });
  contactsOpenBtn.addEventListener('click', () => openPanel(contactsPanel));
  contactForm.addEventListener('submit', handleAddContact);
}

function openPanel(panel) {
  [sendPanel, receivePanel, contactsPanel].forEach((p) => (p.hidden = true));
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Connection ----------

async function connectWallet() {
  if (!window.ethereum) {
    showToast('No wallet found — install MetaMask to continue');
    window.open('https://metamask.io/download', '_blank');
    return;
  }
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
    userAddress = accounts[0];

    await ensureChain(activeChain);
    onConnected();
  } catch (err) {
    console.error(err);
    showToast('Connection was cancelled or failed');
  }
}

async function onConnected() {
  connectBtn.textContent = 'Connected';
  connectBtn.classList.add('connected');
  accountPill.hidden = false;
  accountAddress.textContent = shortAddress(userAddress);
  sendOpenBtn.disabled = false;
  receiveOpenBtn.disabled = false;
  refreshBtn.disabled = false;
  updateBalance();

  if (auth) {
    try {
      await signInWithWallet();
      contactsOpenBtn.disabled = false;
      portfolioSection.hidden = false;
      await Promise.all([loadContacts(), loadPortfolio()]);
    } catch (err) {
      console.error('Backend sign-in failed:', err);
      showToast('Wallet connected — backend features unavailable');
    }
  }
}

// ---------- Backend auth (Firebase) ----------
// The wallet signs a fixed message to prove address ownership. The signature
// is hashed into a password so Firebase Auth can issue a normal session.
// This signature never touches or authorizes any on-chain transaction.

async function signInWithWallet() {
  const message = 'Sign in to Linkchain\n\nThis signature only proves wallet ownership for backend sign-in. It does not move any funds.';
  const signature = await signer.signMessage(message);
  const password = ethers.keccak256(ethers.toUtf8Bytes(signature)).slice(2, 34);
  const email = `${userAddress.toLowerCase()}@linkchain.local`;

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      await auth.createUserWithEmailAndPassword(email, password);
    } else {
      throw err;
    }
  }

  dbUser = auth.currentUser;

  await db.collection('users').doc(dbUser.uid).set({
    walletAddress: userAddress.toLowerCase()
  }, { merge: true });
}

function handleAccountsChanged(accounts) {
  if (!accounts.length) {
    userAddress = null;
    connectBtn.textContent = 'Connect wallet';
    connectBtn.classList.remove('connected');
    accountPill.hidden = true;
    sendOpenBtn.disabled = true;
    receiveOpenBtn.disabled = true;
    refreshBtn.disabled = true;
    balanceValue.textContent = '—';
    balanceFiat.textContent = 'Connect a wallet to view your balance';
  } else {
    userAddress = accounts[0];
    accountAddress.textContent = shortAddress(userAddress);
    updateBalance();
  }
}

// ---------- Network switching ----------

async function switchChain(chain) {
  activeChain = chain;
  renderChainPills();
  balanceSymbol.textContent = chain.symbol;
  amountSymbol.textContent = chain.symbol;
  if (userAddress) {
    await ensureChain(chain);
    updateBalance();
  }
}

async function ensureChain(chain) {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: chain.chainIdHex }]
    });
  } catch (switchError) {
    // Chain not added to wallet yet — add it
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: chain.chainIdHex,
            chainName: chain.name,
            nativeCurrency: { name: chain.symbol, symbol: chain.symbol, decimals: 18 },
            rpcUrls: [chain.rpcUrl],
            blockExplorerUrls: [chain.explorer]
          }]
        });
      } catch (addError) {
        console.error(addError);
        showToast('Could not switch network');
      }
    }
  }
}

// ---------- Balance ----------

async function updateBalance() {
  if (!provider || !userAddress) return;
  try {
    const raw = await provider.getBalance(userAddress);
    const formatted = parseFloat(ethers.formatEther(raw)).toFixed(5);
    balanceValue.textContent = formatted;
    balanceSymbol.textContent = activeChain.symbol;
    balanceFiat.textContent = `On ${activeChain.name}`;
  } catch (err) {
    console.error(err);
    balanceFiat.textContent = 'Could not load balance';
  }
}

// ---------- Send ----------

async function handleSend(e) {
  e.preventDefault();
  const to = document.getElementById('recipientInput').value.trim();
  const amount = document.getElementById('amountInput').value;

  if (!ethers.isAddress(to)) {
    sendStatus.textContent = 'Enter a valid address for this network.';
    return;
  }

  const submitBtn = document.getElementById('sendSubmitBtn');
  submitBtn.disabled = true;
  sendStatus.textContent = 'Confirm the transaction in your wallet…';

  try {
    const tx = await signer.sendTransaction({
      to,
      value: ethers.parseEther(amount)
    });

    addHistoryItem({ to, amount, symbol: activeChain.symbol, hash: tx.hash, status: 'pending' });
    sendStatus.textContent = 'Transaction submitted. Waiting for confirmation…';
    sendForm.reset();

    tx.wait().then(() => {
      updateHistoryStatus(tx.hash, 'confirmed');
      updateBalance();
      showToast('Transaction confirmed');
    }).catch(() => {
      updateHistoryStatus(tx.hash, 'failed');
    });

    sendPanel.hidden = true;
  } catch (err) {
    console.error(err);
    sendStatus.textContent = err.shortMessage || 'Transaction was rejected or failed.';
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------- History (session list, backed by Firestore when connected) ----------

const historyRecords = [];

function addHistoryItem({ to, amount, symbol, hash, status }) {
  historyRecords.unshift({ to, amount, symbol, hash, status });
  renderHistory();

  if (db && dbUser) {
    db.collection('users').doc(dbUser.uid).collection('transactions').doc(hash).set({
      chain: activeChain.name,
      txHash: hash,
      toAddress: to,
      amount: String(amount),
      symbol,
      status,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch((err) => console.error(err));
  }
}

function updateHistoryStatus(hash, status) {
  const record = historyRecords.find((r) => r.hash === hash);
  if (record) record.status = status;
  renderHistory();

  if (db && dbUser) {
    db.collection('users').doc(dbUser.uid).collection('transactions').doc(hash)
      .update({ status })
      .catch((err) => console.error(err));
  }
}

// ---------- Contacts (Firestore) ----------

async function handleAddContact(e) {
  e.preventDefault();
  if (!db || !dbUser) {
    showToast('Connect your wallet to save contacts');
    return;
  }
  const label = document.getElementById('contactLabel').value.trim();
  const address = document.getElementById('contactAddress').value.trim();

  if (!ethers.isAddress(address)) {
    showToast('Enter a valid address');
    return;
  }

  try {
    await db.collection('users').doc(dbUser.uid).collection('contacts').add({
      label,
      address,
      chain: activeChain.name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    showToast('Could not save contact');
    return;
  }

  contactForm.reset();
  showToast('Contact saved');
  loadContacts();
}

async function loadContacts() {
  if (!db || !dbUser) return;
  try {
    const snapshot = await db.collection('users').doc(dbUser.uid)
      .collection('contacts').orderBy('createdAt', 'desc').get();

    if (snapshot.empty) {
      contactsList.innerHTML = `<li class="history-empty">No saved contacts yet.</li>`;
      return;
    }

    contactsList.innerHTML = snapshot.docs.map((doc) => {
      const c = doc.data();
      return `
        <li class="history-item">
          <div class="h-left">
            <span class="h-amount">${escapeHtml(c.label)}</span>
            <span class="h-to">${shortAddress(c.address)}</span>
          </div>
          <button class="contact-item-actions" onclick="useContact('${c.address}')">Use</button>
        </li>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

function useContact(address) {
  document.getElementById('recipientInput').value = address;
  openPanel(sendPanel);
}

// ---------- Portfolio (reads balances across all chains via public RPCs) ----------

async function loadPortfolio() {
  if (!userAddress) return;
  portfolioGrid.innerHTML = CONFIG.chains.map((c) => `
    <div class="portfolio-card" id="p-${c.chainIdHex}">
      <div class="p-chain"><span class="p-dot" style="background:${c.color}"></span>${c.name}</div>
      <div class="p-amount">…</div>
    </div>
  `).join('');

  await Promise.all(CONFIG.chains.map(async (chain) => {
    try {
      const rpc = new ethers.JsonRpcProvider(chain.rpcUrl);
      const raw = await rpc.getBalance(userAddress);
      const formatted = parseFloat(ethers.formatEther(raw)).toFixed(4);
      const card = document.getElementById(`p-${chain.chainIdHex}`);
      if (card) card.querySelector('.p-amount').textContent = `${formatted} ${chain.symbol}`;

      if (db && dbUser) {
        db.collection('users').doc(dbUser.uid).collection('balances').doc(chain.chainIdHex).set({
          chain: chain.name,
          symbol: chain.symbol,
          amount: formatted,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch((err) => console.error(err));
      }
    } catch (err) {
      const card = document.getElementById(`p-${chain.chainIdHex}`);
      if (card) card.querySelector('.p-amount').textContent = '—';
    }
  }));
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderHistory() {
  if (!historyRecords.length) {
    historyList.innerHTML = `<li class="history-empty">No transactions yet. Once you send funds, they'll show up here.</li>`;
    return;
  }
  historyList.innerHTML = historyRecords.map((r) => `
    <li class="history-item ${r.status}">
      <div class="h-left">
        <span class="h-amount">−${r.amount} ${r.symbol}</span>
        <span class="h-to">to ${shortAddress(r.to)}</span>
      </div>
      <span class="h-status">${r.status}</span>
    </li>
  `).join('');
}

// ---------- Helpers ----------

function shortAddress(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '…' + addr.slice(-4);
}

let toastTimer = null;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function tiltCard() {
  const maxTilt = 4;
  walletCard.addEventListener('mousemove', (e) => {
    const rect = walletCard.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    walletCard.style.transform = `perspective(1000px) rotateX(${(-y * maxTilt).toFixed(2)}deg) rotateY(${(x * maxTilt).toFixed(2)}deg)`;
  });
  walletCard.addEventListener('mouseleave', () => {
    walletCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
  });
}
