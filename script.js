// ==========================================================
// Nebula wallet — connects to Phantom, reads/sends SOL on
// Solana mainnet-beta. No private keys are ever handled here.
// ==========================================================

const { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } = solanaWeb3;

let connection = null;
let walletPublicKey = null;
let auth = null;
let db = null;
let dbUser = null;

const connectBtn = document.getElementById('connectBtn');
const accountPill = document.getElementById('accountPill');
const accountAddress = document.getElementById('accountAddress');
const balanceValue = document.getElementById('balanceValue');
const balanceFiat = document.getElementById('balanceFiat');
const sendOpenBtn = document.getElementById('sendOpenBtn');
const receiveOpenBtn = document.getElementById('receiveOpenBtn');
const contactsOpenBtn = document.getElementById('contactsOpenBtn');
const refreshBtn = document.getElementById('refreshBtn');
const sendPanel = document.getElementById('sendPanel');
const receivePanel = document.getElementById('receivePanel');
const contactsPanel = document.getElementById('contactsPanel');
const sendForm = document.getElementById('sendForm');
const sendStatus = document.getElementById('sendStatus');
const receiveAddress = document.getElementById('receiveAddress');
const copyAddressBtn = document.getElementById('copyAddressBtn');
const contactsList = document.getElementById('contactsList');
const contactForm = document.getElementById('contactForm');
const portfolioSection = document.getElementById('portfolioSection');
const portfolioGrid = document.getElementById('portfolioGrid');
const historyList = document.getElementById('historyList');
const toast = document.getElementById('toast');
const orbHero = document.getElementById('orbHero');
const orbCore = document.getElementById('orbCore');

init();

function init() {
  connection = new Connection(CONFIG.solana.rpcUrl, 'confirmed');
  bindUI();
  initOrbParallax();
  initStarField();
  initFirebase();

  if (window.solana) {
    window.solana.on?.('accountChanged', handleAccountChanged);
    window.solana.on?.('disconnect', handleDisconnect);
  }
}

function initFirebase() {
  if (!CONFIG.firebaseConfig || CONFIG.firebaseConfig.apiKey.startsWith('YOUR_')) return;
  firebase.initializeApp(CONFIG.firebaseConfig);
  auth = firebase.auth();
  db = firebase.firestore();
}

function bindUI() {
  connectBtn.addEventListener('click', connectWallet);
  sendOpenBtn.addEventListener('click', () => openPanel(sendPanel));
  receiveOpenBtn.addEventListener('click', () => {
    receiveAddress.textContent = walletPublicKey ? walletPublicKey.toBase58() : '—';
    openPanel(receivePanel);
  });
  contactsOpenBtn.addEventListener('click', () => openPanel(contactsPanel));
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
  contactForm.addEventListener('submit', handleAddContact);
  copyAddressBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(walletPublicKey ? walletPublicKey.toBase58() : '');
    showToast('Address copied');
  });
}

function openPanel(panel) {
  [sendPanel, receivePanel, contactsPanel].forEach((p) => (p.hidden = true));
  panel.hidden = false;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Connection (Phantom) ----------

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

async function connectWallet() {
  const provider = window.solana;

  if (!provider || !provider.isPhantom) {
    // On mobile, Phantom doesn't inject window.solana into Safari/Chrome —
    // it only exists inside Phantom's own in-app browser. So instead of
    // just opening the app store, send the user into Phantom's in-app
    // browser pointed at this same page. Once it reloads there,
    // window.solana will exist and Connect will work normally.
    if (isMobileDevice()) {
      const currentUrl = encodeURIComponent(window.location.href);
      showToast('Opening in Phantom…');
      window.location.href = `https://phantom.app/ul/browse/${currentUrl}?ref=${currentUrl}`;
      return;
    }

    showToast('Phantom not found — install it to continue');
    window.open('https://phantom.app/download', '_blank');
    return;
  }

  try {
    const resp = await provider.connect();
    walletPublicKey = resp.publicKey;
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
  accountAddress.textContent = shortAddress(walletPublicKey.toBase58());
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
      const reason = err.code || err.message || 'unknown error';
      showToast(`Wallet connected — backend error: ${reason}`, 6000);
    }
  }
}

function handleAccountChanged(publicKey) {
  if (!publicKey) {
    handleDisconnect();
    return;
  }
  walletPublicKey = publicKey;
  accountAddress.textContent = shortAddress(walletPublicKey.toBase58());
  updateBalance();
}

function handleDisconnect() {
  walletPublicKey = null;
  connectBtn.textContent = 'Connect Phantom';
  connectBtn.classList.remove('connected');
  accountPill.hidden = true;
  sendOpenBtn.disabled = true;
  receiveOpenBtn.disabled = true;
  contactsOpenBtn.disabled = true;
  refreshBtn.disabled = true;
  portfolioSection.hidden = true;
  balanceValue.textContent = '—';
  balanceFiat.textContent = 'Connect Phantom to view your balance';
}

// ---------- Backend auth (Firebase) ----------
// Phantom signs a fixed message to prove address ownership. The signature
// is hashed into a password so Firebase Auth can issue a normal session.
// This signature never touches or authorizes any on-chain transaction.

async function signInWithWallet() {
  const message = 'Sign in to Linkchain\n\nThis signature only proves wallet ownership for backend sign-in. It does not move any funds.';
  const encoded = new TextEncoder().encode(message);
  const { signature } = await window.solana.signMessage(encoded, 'utf8');

  const hashBuffer = await crypto.subtle.digest('SHA-256', signature);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const password = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  const email = `${walletPublicKey.toBase58().toLowerCase()}@nebula.local`;

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

  await db.collection('solUsers').doc(dbUser.uid).set({
    walletAddress: walletPublicKey.toBase58()
  }, { merge: true });
}

// ---------- Balance ----------

async function updateBalance() {
  if (!connection || !walletPublicKey) return;
  try {
    const lamports = await connection.getBalance(walletPublicKey);
    const sol = (lamports / LAMPORTS_PER_SOL).toFixed(5);
    balanceValue.textContent = sol;
    balanceFiat.textContent = 'On Solana mainnet-beta';
    updateOrbGlow(lamports / LAMPORTS_PER_SOL);
  } catch (err) {
    console.error(err);
    balanceFiat.textContent = 'Could not load balance';
  }
}

function updateOrbGlow(sol) {
  const intensity = Math.min(1, sol / 10);
  orbCore.style.boxShadow = `
    0 0 ${60 + intensity * 60}px rgba(139, 108, 247, ${0.5 + intensity * 0.3}),
    0 0 ${120 + intensity * 80}px rgba(244, 95, 176, ${0.25 + intensity * 0.2}),
    inset -10px -14px 30px rgba(0,0,0,0.35)
  `;
}

// ---------- Send ----------

async function handleSend(e) {
  e.preventDefault();
  const to = document.getElementById('recipientInput').value.trim();
  const amount = parseFloat(document.getElementById('amountInput').value);

  let toPubkey;
  try {
    toPubkey = new PublicKey(to);
  } catch {
    sendStatus.textContent = 'Enter a valid Solana address.';
    return;
  }

  const submitBtn = document.getElementById('sendSubmitBtn');
  submitBtn.disabled = true;
  sendStatus.textContent = 'Confirm the transaction in Phantom…';

  try {
    const { blockhash } = await connection.getLatestBlockhash();
    const tx = new Transaction({
      recentBlockhash: blockhash,
      feePayer: walletPublicKey
    }).add(
      SystemProgram.transfer({
        fromPubkey: walletPublicKey,
        toPubkey,
        lamports: Math.round(amount * LAMPORTS_PER_SOL)
      })
    );

    const { signature } = await window.solana.signAndSendTransaction(tx);

    addHistoryItem({ to, amount, hash: signature, status: 'pending' });
    sendStatus.textContent = 'Transaction submitted. Waiting for confirmation…';
    sendForm.reset();
    sendPanel.hidden = true;

    connection.confirmTransaction(signature, 'confirmed').then(() => {
      updateHistoryStatus(signature, 'confirmed');
      updateBalance();
      showToast('Transaction confirmed');
    }).catch(() => {
      updateHistoryStatus(signature, 'failed');
    });
  } catch (err) {
    console.error(err);
    sendStatus.textContent = err.message || 'Transaction was rejected or failed.';
  } finally {
    submitBtn.disabled = false;
  }
}

// ---------- History (session list, backed by Firestore when connected) ----------

const historyRecords = [];

function addHistoryItem({ to, amount, hash, status }) {
  historyRecords.unshift({ to, amount, hash, status });
  renderHistory();

  if (db && dbUser) {
    db.collection('solUsers').doc(dbUser.uid).collection('transactions').doc(hash).set({
      toAddress: to,
      amount: String(amount),
      symbol: 'SOL',
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
    db.collection('solUsers').doc(dbUser.uid).collection('transactions').doc(hash)
      .update({ status })
      .catch((err) => console.error(err));
  }
}

function renderHistory() {
  if (!historyRecords.length) {
    historyList.innerHTML = `<li class="history-empty">No transactions yet. Once you send SOL, they'll show up here.</li>`;
    return;
  }
  historyList.innerHTML = historyRecords.map((r) => `
    <li class="history-item ${r.status}">
      <div class="h-left">
        <span class="h-amount">−${r.amount} SOL</span>
        <span class="h-to">to ${shortAddress(r.to)}</span>
      </div>
      <span class="h-status">${r.status}</span>
    </li>
  `).join('');
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

  try {
    new PublicKey(address);
  } catch {
    showToast('Enter a valid Solana address');
    return;
  }

  try {
    await db.collection('solUsers').doc(dbUser.uid).collection('contacts').add({
      label,
      address,
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
    const snapshot = await db.collection('solUsers').doc(dbUser.uid)
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

// ---------- Portfolio (cross-device synced balance snapshot) ----------

async function loadPortfolio() {
  if (!walletPublicKey) return;
  portfolioGrid.innerHTML = `
    <div class="portfolio-card" id="p-sol">
      <div class="p-label"><span class="p-dot"></span>Solana</div>
      <div class="p-amount">…</div>
    </div>
  `;

  try {
    const lamports = await connection.getBalance(walletPublicKey);
    const formatted = (lamports / LAMPORTS_PER_SOL).toFixed(4);
    document.querySelector('#p-sol .p-amount').textContent = `${formatted} SOL`;

    if (db && dbUser) {
      db.collection('solUsers').doc(dbUser.uid).collection('balances').doc('sol').set({
        symbol: 'SOL',
        amount: formatted,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch((err) => console.error(err));
    }
  } catch (err) {
    document.querySelector('#p-sol .p-amount').textContent = '—';
  }
}

// ---------- Helpers ----------

function shortAddress(addr) {
  if (!addr) return '';
  return addr.slice(0, 4) + '…' + addr.slice(-4);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

let toastTimer = null;
function showToast(message, duration = 2800) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ---------- 3D orb parallax ----------

function initOrbParallax() {
  const maxTilt = 14;
  window.addEventListener('mousemove', (e) => {
    const x = (e.clientX / window.innerWidth) - 0.5;
    const y = (e.clientY / window.innerHeight) - 0.5;
    const back = document.querySelector('.orb-back');
    const mid = document.querySelector('.orb-mid');
    if (back) back.style.transform = `translateZ(-80px) translate(${x * -18}px, ${y * -18}px) scale(1.1)`;
    if (mid) mid.style.transform = `translateZ(-30px) translate(${x * -30}px, ${y * -30}px)`;
    orbCore.style.transform = `rotateX(${(-y * maxTilt).toFixed(2)}deg) rotateY(${(x * maxTilt).toFixed(2)}deg)`;
  });
}

// ---------- Ambient starfield background ----------

function initStarField() {
  const canvas = document.getElementById('starField');
  const ctx = canvas.getContext('2d');
  let stars = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const count = Math.floor((canvas.width * canvas.height) / 9000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.6 + 0.2,
      speed: Math.random() * 0.15 + 0.02
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0b0a12';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    stars.forEach((s) => {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(237, 234, 246, ${s.a})`;
      ctx.fill();
      s.y += s.speed;
      if (s.y > canvas.height) s.y = 0;
    });
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  resize();
  draw();
}
