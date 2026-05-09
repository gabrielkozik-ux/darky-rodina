// --- Importy ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app-check.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp, addDoc, query, orderBy, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-storage.js";

// --- Firebase config ---
const firebaseConfig = {
    apiKey: "AIzaSyC5qWRgRWW9q5G8NRmOpCln1Wwb03Z2eXs",
    authDomain: "darky-rodina.firebaseapp.com",
    projectId: "darky-rodina",
    storageBucket: "darky-rodina.firebasestorage.app",
    messagingSenderId: "1070152594421",
    appId: "1:1070152594421:web:5e686e340e756025d726bc"
};

const app = initializeApp(firebaseConfig);
try {
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider('6LfDTQIsAAAAANXqps6CUrdaWyDH2_u72xvur-V8'), isTokenAutoRefreshEnabled: true });
} catch(e) { console.error("App Check error:", e); }

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- DOM refs ---
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfo = document.getElementById('user-info');
const userNameEl = document.getElementById('user-name');
const welcomeMsg = document.getElementById('welcome-msg');
const pendingApprovalMsg = document.getElementById('pending-approval-msg');
const loader = document.getElementById('loader');
const adminPanel = document.getElementById('admin-panel');
const adminFormTitle = document.getElementById('admin-form-title');
const addGiftForm = document.getElementById('add-gift-form');
const addGiftLoader = document.getElementById('add-gift-loader');
const addGiftSubmitBtn = document.getElementById('add-gift-submit');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const giftIsContributionCheckbox = document.getElementById('gift-is-contribution');
const giftImageInput = document.getElementById('gift-image');
const giftImagePreview = document.getElementById('gift-image-preview');
const tabBar = document.getElementById('tab-bar');
const toolbar = document.getElementById('toolbar');
const searchInput = document.getElementById('search-input');
const occasionFilter = document.getElementById('occasion-filter');
const giftsWrapper = document.getElementById('gifts-wrapper');
const giftsGrid = document.getElementById('gifts-grid');
const giftsEmptyDbMsg = document.getElementById('gifts-empty-db-msg');
const filterNoResultsMsg = document.getElementById('filter-no-results-msg');
const reservationModal = document.getElementById('reservation-modal');
const modalTitle = document.getElementById('modal-title');
const modalGiftName = document.getElementById('modal-gift-name');
const modalOccasion = document.getElementById('modal-occasion');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const imageLightbox = document.getElementById('image-lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxClose = document.getElementById('lightbox-close');

// --- Globals ---
let currentUser = null;
let isAdmin = false;
let allGifts = [];
let userMap = new Map(); // uid -> displayName
let activeTab = null;
let currentEditGiftId = null;
let currentModalAction = { id: null, action: null };

// Recipients config (static for now; Etapa 2 will load from Firestore)
const RECIPIENTS = [
    { id: 'hanicka', name: 'Hanička', icon: '👧', match: ['hanička','hanicka'] },
    { id: 'oliver',  name: 'Oliver',  icon: '👦', match: ['oliver'] },
    { id: 'other',   name: 'Ostatní', icon: '🎀', match: [] }
];

const occasionCategoryMap = {
    'Vánoce':      ['vanoce','vánoce','vianoce'],
    'Narozeniny':  ['narozeniny','narodeniny'],
    'Svátek':      ['svátek','svatek','meniny']
};
const staticFilterOptions = ['all', ...Object.keys(occasionCategoryMap), 'Ostatní'];

// --- Auth ---
loginBtn.addEventListener('click', () => signInWithPopup(auth, new GoogleAuthProvider()).catch(console.error));
logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) {
        loginBtn.classList.add('hidden');
        userInfo.style.display = 'flex';
        userInfo.classList.remove('hidden');
        userNameEl.textContent = user.displayName;
        welcomeMsg.classList.add('hidden');
        checkUserRoleAndLoadGifts(user);
    } else {
        isAdmin = false;
        loginBtn.classList.remove('hidden');
        userInfo.style.display = 'none';
        userInfo.classList.add('hidden');
        userNameEl.textContent = '';
        welcomeMsg.classList.remove('hidden');
        pendingApprovalMsg.classList.add('hidden');
        loader.classList.add('hidden');
        tabBar.classList.add('hidden');
        toolbar.classList.add('hidden');
        adminPanel.classList.add('hidden');
        giftsGrid.innerHTML = '';
        giftsEmptyDbMsg.classList.add('hidden');
        filterNoResultsMsg.classList.add('hidden');
        resetAdminForm();
    }
});

// --- Load user map for admin reservation display ---
async function loadUserMap() {
    try {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach(d => userMap.set(d.id, d.data().displayName || d.data().email || d.id));
    } catch(e) { console.warn('loadUserMap error:', e); }
}

// --- Role check ---
async function checkUserRoleAndLoadGifts(user) {
    loader.classList.remove('hidden');
    giftsGrid.innerHTML = '';
    giftsEmptyDbMsg.classList.add('hidden');
    filterNoResultsMsg.classList.add('hidden');
    adminPanel.classList.add('hidden');
    resetAdminForm();

    try {
        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);

        if (!userDoc.exists()) {
            try {
                await setDoc(userRef, { email: user.email, displayName: user.displayName, role: 'pending' });
                pendingApprovalMsg.classList.remove('hidden');
            } catch(e) { console.error(e); }
            loader.classList.add('hidden');
            return;
        }

        const userData = userDoc.data();
        isAdmin = userData.role === 'admin';

        if (userData.role === 'approved' || userData.role === 'admin') {
            pendingApprovalMsg.classList.add('hidden');
            if (isAdmin) {
                adminPanel.classList.remove('hidden');
                await loadUserMap();
            }
            listenForGifts();
        } else {
            pendingApprovalMsg.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    } catch(err) {
        console.error('checkUserRoleAndLoadGifts error:', err);
        loader.classList.add('hidden');
        giftsGrid.innerHTML = '<p style="color:var(--c-red);text-align:center;padding:16px;">Chyba při načítání (viz F12 konzole).</p>';
    }
}

// --- Reset admin form ---
function resetAdminForm() {
    if (!addGiftForm) return;
    addGiftForm.reset();
    adminFormTitle.textContent = 'Panel administrátora';
    addGiftSubmitBtn.textContent = 'Přidat dárek';
    cancelEditBtn.classList.add('hidden');
    giftIsContributionCheckbox.checked = false;
    giftImageInput.value = null;
    giftImagePreview.classList.add('hidden');
    giftImagePreview.src = '';
    currentEditGiftId = null;
}

// --- Gifts listener ---
function listenForGifts() {
    const q = query(collection(db, 'gifts'), orderBy('name'));
    onSnapshot(q, snap => {
        loader.classList.add('hidden');
        allGifts = [];
        snap.forEach(d => allGifts.push({ id: d.id, ...d.data() }));

        if (allGifts.length === 0) {
            giftsEmptyDbMsg.classList.remove('hidden');
            tabBar.classList.add('hidden');
            toolbar.classList.add('hidden');
            return;
        }
        giftsEmptyDbMsg.classList.add('hidden');
        tabBar.classList.remove('hidden');
        toolbar.classList.remove('hidden');
        buildTabs();
        renderFilteredGifts();
    }, err => {
        console.error(err);
        loader.classList.add('hidden');
        giftsGrid.innerHTML = '<p style="color:var(--c-red);text-align:center;padding:16px;">Chyba při načítání databáze (viz konzole).</p>';
    });
}

// --- Tab helpers ---
function recipientForGift(gift) {
    const r = (gift.recipient || '').toLowerCase();
    for (const rec of RECIPIENTS) {
        if (rec.match.length === 0) continue;
        if (rec.match.some(m => r.includes(m))) return rec.id;
    }
    return 'other';
}

function buildTabs() {
    // Count per tab
    const counts = {};
    const available = {};
    for (const rec of RECIPIENTS) { counts[rec.id] = 0; available[rec.id] = 0; }

    allGifts.forEach(g => {
        const id = recipientForGift(g);
        counts[id] = (counts[id] || 0) + 1;
        if (g.status === 'available' || !g.status) available[id] = (available[id] || 0) + 1;
    });

    tabBar.innerHTML = '';
    RECIPIENTS.forEach(rec => {
        const btn = document.createElement('button');
        btn.className = 'tab-btn' + (activeTab === rec.id ? ' active' : '');
        btn.dataset.tab = rec.id;
        const avail = available[rec.id] || 0;
        btn.innerHTML = `
            <span class="tab-icon">${rec.icon}</span>
            <span class="tab-name">${rec.name}</span>
            <span class="tab-badge">${counts[rec.id]} dárků${avail > 0 ? ' · ' + avail + ' volných' : ''}</span>`;
        btn.addEventListener('click', () => switchTab(rec.id));
        tabBar.appendChild(btn);
    });

    // Auto-select first tab with available gifts, or first tab
    if (!activeTab || !RECIPIENTS.find(r => r.id === activeTab)) {
        const firstWithAvail = RECIPIENTS.find(r => (available[r.id] || 0) > 0);
        activeTab = firstWithAvail ? firstWithAvail.id : RECIPIENTS[0].id;
        tabBar.querySelector(`[data-tab="${activeTab}"]`)?.classList.add('active');
    }
}

function switchTab(tabId) {
    activeTab = tabId;
    tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    renderFilteredGifts();
}

// --- Occasion filter ---
function populateOccasionFilter() {
    const cur = occasionFilter.value;
    Array.from(occasionFilter.options).forEach(o => { if (!staticFilterOptions.includes(o.value)) o.remove(); });
    if (!Array.from(occasionFilter.options).some(o => o.value === cur)) occasionFilter.value = 'all';
}

function matchesOccasion(gift, selectedOccasion) {
    if (selectedOccasion === 'all') return true;
    if (!gift.occasion || gift.occasion.trim() === '') return selectedOccasion === 'Ostatní';
    const occ = gift.occasion.toLowerCase();
    if (selectedOccasion === 'Ostatní') {
        return !Object.values(occasionCategoryMap).some(arr => arr.some(p => occ.startsWith(p)));
    }
    const arr = occasionCategoryMap[selectedOccasion];
    return arr ? arr.some(p => occ.startsWith(p)) : false;
}

// --- Main render ---
function renderFilteredGifts() {
    giftsGrid.innerHTML = '';
    populateOccasionFilter();

    const selectedOccasion = occasionFilter.value;
    const searchTerm = (searchInput.value || '').toLowerCase().trim();

    const filtered = allGifts.filter(gift => {
        if (recipientForGift(gift) !== activeTab) return false;
        if (!matchesOccasion(gift, selectedOccasion)) return false;
        if (searchTerm && !gift.name.toLowerCase().includes(searchTerm) && !(gift.description || '').toLowerCase().includes(searchTerm)) return false;
        return true;
    });

    if (filtered.length === 0) {
        filterNoResultsMsg.classList.remove('hidden');
        return;
    }
    filterNoResultsMsg.classList.add('hidden');

    filtered.forEach((gift, i) => {
        const card = buildGiftCard(gift);
        card.style.setProperty('--i', i);
        giftsGrid.appendChild(card);
        // Start chat listeners for gifts where user is participant
        const isMember = (gift.contributors || []).includes(currentUser.uid);
        if (isMember && (gift.giftType === 'contribution' || gift.status === 'group-open' || gift.status === 'claimed-group')) {
            listenForChatMessages(gift.id);
        }
    });
}

// --- Status badge helper ---
function statusBadge(gift) {
    const isContribution = gift.giftType === 'contribution';
    if (isContribution) return { cls: 'status-contribution', label: '💜 Příspěvek (' + (gift.contributors?.length || 0) + ')' };
    switch (gift.status) {
        case 'available':     return { cls: 'status-available',   label: '🟢 Dostupné' };
        case 'group-open':    return { cls: 'status-group',       label: '🔵 Skupina (' + (gift.contributors?.length || 0) + ')' };
        case 'claimed-group': return { cls: 'status-group-done',  label: '✅ Zajištěno (' + (gift.contributors?.length || 0) + ')' };
        case 'claimed-solo':  return { cls: 'status-claimed',     label: '⚫ Zarezervováno' };
        default:              return { cls: 'status-available',   label: '🟢 Dostupné' };
    }
}

// --- Admin reservation info ---
function adminReservedByHTML(gift) {
    if (!isAdmin) return '';
    const isContribution = gift.giftType === 'contribution';
    let names = [];
    if (gift.status === 'claimed-solo' && gift.claimedBySolo) {
        names = [userMap.get(gift.claimedBySolo) || '?'];
    } else if (['group-open','claimed-group'].includes(gift.status) || isContribution) {
        names = (gift.contributors || []).map(uid => userMap.get(uid) || uid);
    }
    if (names.length === 0) return '';
    return `<div class="admin-reserved-by">👤 ${names.join(', ')}</div>`;
}

// --- linkify ---
function linkify(text) {
    if (!text) return '';
    const re = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#/%?=~_|!:,.;]*[-A-Z0-9+&@#/%=~_|])/ig;
    return text.replace(re, url => {
        let display = url;
        try { const u = new URL(url); display = u.hostname.replace('www.','') + (u.pathname.length > 1 ? u.pathname : ''); } catch(e){}
        if (display.length > 50) display = display.substring(0,47) + '...';
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${display}</a>`;
    });
}

// --- Build card DOM ---
function buildGiftCard(gift) {
    const badge = statusBadge(gift);
    const isContributor = (gift.contributors || []).includes(currentUser.uid);
    const isSoloClaimer = gift.claimedBySolo === currentUser.uid;
    const isContribution = gift.giftType === 'contribution';

    const card = document.createElement('div');
    card.className = 'gift-card';
    card.dataset.id = gift.id;

    // -- thumb --
    const thumbHTML = gift.imageUrl
        ? `<img src="${gift.imageUrl}" class="gift-thumb" alt="${gift.name}">`
        : `<div class="gift-thumb-placeholder">🎁</div>`;

    // -- admin reserved-by (compact) --
    const adminCompactHTML = adminReservedByHTML(gift);

    // -- compact row --
    const compactHTML = `
        <div class="gift-compact">
            ${thumbHTML}
            <div class="gift-compact-info">
                <div class="gift-compact-name">${gift.name}</div>
                <div class="gift-compact-occasion">${gift.occasion || ''}</div>
                ${adminCompactHTML}
            </div>
            <span class="status-badge ${badge.cls}">${badge.label}</span>
        </div>`;

    // -- action buttons --
    let actionsHTML = '';
    if (isContribution) {
        if (!isContributor) {
            actionsHTML = `<button class="btn btn-sm btn-blue join-group-btn" data-id="${gift.id}">Chci přispět</button>`;
        } else {
            actionsHTML = `<button class="btn btn-sm btn-ghost leave-group-btn" data-id="${gift.id}">Už nechci přispět</button>`;
        }
    } else {
        switch (gift.status) {
            case 'available':
                actionsHTML = `
                    <button class="btn btn-sm btn-primary claim-solo-btn" data-id="${gift.id}" data-action="claim-solo">Koupím sám/a</button>
                    <button class="btn btn-sm btn-ghost create-group-btn" data-id="${gift.id}" data-action="create-group">Chci se složit</button>`;
                break;
            case 'group-open':
                if (!isContributor) {
                    actionsHTML = `<button class="btn btn-sm btn-blue join-group-btn" data-id="${gift.id}">Přidat se</button>`;
                } else {
                    actionsHTML = `
                        <button class="btn btn-sm btn-ghost leave-group-btn" data-id="${gift.id}">Odejít ze skupiny</button>
                        <button class="btn btn-sm btn-green finalize-group-btn" data-id="${gift.id}">Uzavřít (domluveno)</button>`;
                }
                break;
            case 'claimed-solo':
                if (isSoloClaimer) {
                    actionsHTML = `
                        <button class="btn btn-sm btn-ghost edit-occasion-btn" data-id="${gift.id}" data-action="edit-occasion">✏️ Příležitost</button>
                        <button class="btn btn-sm btn-red cancel-solo-claim-btn" data-id="${gift.id}">Zrušit rezervaci</button>`;
                }
                break;
            case 'claimed-group':
                if (isContributor) {
                    actionsHTML = `<button class="btn btn-sm btn-blue reopen-group-btn" data-id="${gift.id}">Znovu otevřít diskuzi</button>`;
                }
                break;
        }
        if ((isSoloClaimer || isContributor) && gift.status !== 'claimed-solo') {
            actionsHTML += `<button class="btn btn-sm btn-ghost edit-occasion-btn" data-id="${gift.id}" data-action="edit-occasion">✏️ Příležitost</button>`;
        }
    }

    // -- chat --
    const showChat = isContributor && (isContribution || gift.status === 'group-open' || gift.status === 'claimed-group');
    const chatInputEnabled = isContribution || gift.status === 'group-open';
    let chatHTML = '';
    if (showChat) {
        chatHTML = `
            <div class="gift-chat">
                <div class="gift-chat-title">💬 Domluva</div>
                <div class="chat-messages" id="chat-${gift.id}"></div>
                ${chatInputEnabled ? `
                <form class="chat-form">
                    <input type="text" placeholder="Napsat zprávu…" required>
                    <button type="submit" data-id="${gift.id}">Odeslat</button>
                </form>` : '<p style="font-size:0.78rem;color:var(--c-text-dim);margin-top:6px;font-style:italic;">Skupina uzavřena – chat jen ke čtení.</p>'}
            </div>`;
    }

    // -- full detail --
    const detailImageHTML = gift.imageUrl ? `<img src="${gift.imageUrl}" alt="${gift.name}" class="gift-detail-image gift-image-clickable">` : '';
    const detailLinkHTML = gift.link ? `<a href="${gift.link}" target="_blank" rel="noopener noreferrer" class="gift-detail-link">🔗 Odkaz na dárek</a>` : '';
    const descHTML = gift.description ? `<p class="gift-detail-desc">${linkify(gift.description)}</p>` : '';

    const detailHTML = `
        <div class="gift-detail">
            ${detailImageHTML}
            ${descHTML}
            ${detailLinkHTML}
            <div class="gift-actions">${actionsHTML}</div>
            ${chatHTML}
        </div>`;

    // -- admin dropdown --
    let adminDropHTML = '';
    if (isAdmin) {
        const isContrib = gift.giftType === 'contribution';
        const hasReservation = !isContrib && gift.status !== 'available';
        const hasContribs = isContrib && (gift.contributors || []).length > 0;
        adminDropHTML = `
            <div class="admin-dropdown">
                <button class="admin-dropdown-toggle" data-id="${gift.id}" title="Admin akce">⋯</button>
                <div class="admin-dropdown-menu">
                    <button class="admin-dropdown-item admin-edit-btn" data-id="${gift.id}">✏️ Upravit detaily</button>
                    ${hasReservation ? `<button class="admin-dropdown-item admin-reset-reservation-btn" data-id="${gift.id}">↩️ Resetovat rezervaci</button>` : ''}
                    ${hasContribs ? `<button class="admin-dropdown-item admin-reset-contributors-btn" data-id="${gift.id}">↩️ Resetovat přispěvatele</button>` : ''}
                    <button class="admin-dropdown-item danger admin-delete-btn" data-id="${gift.id}">🗑️ Smazat dárek</button>
                </div>
            </div>`;
    }

    card.innerHTML = compactHTML + detailHTML + adminDropHTML;

    // Toggle expand on compact click
    card.querySelector('.gift-compact').addEventListener('click', (e) => {
        if (e.target.closest('.admin-dropdown')) return;
        card.classList.toggle('expanded');
        if (card.classList.contains('expanded') && showChat) listenForChatMessages(gift.id);
    });

    return card;
}

// --- Chat listener ---
function listenForChatMessages(giftId) {
    const q = query(collection(db, 'gifts', giftId, 'chat'), orderBy('timestamp'));
    onSnapshot(q, snap => {
        const container = document.getElementById(`chat-${giftId}`);
        if (!container) return;
        container.innerHTML = '';
        snap.forEach(d => {
            const msg = d.data();
            const isMe = msg.uid === currentUser.uid;
            const gift = allGifts.find(g => g.id === giftId);
            const canEdit = isMe && gift && (gift.status === 'group-open' || gift.giftType === 'contribution');
            const el = document.createElement('div');
            el.className = 'chat-message';
            el.dataset.msgId = d.id;
            el.innerHTML = `
                <div class="message-content" style="flex:1;">
                    <strong>${isMe ? 'Vy' : msg.user}:</strong>
                    <span class="message-text"> ${msg.message}</span>
                </div>
                ${canEdit ? `<div class="chat-actions">
                    <button class="edit-comment-btn" title="Upravit">✏️</button>
                    <button class="delete-comment-btn" title="Smazat">🗑️</button>
                </div>` : ''}`;
            container.appendChild(el);
        });
        if (container.scrollHeight > container.clientHeight) container.scrollTop = container.scrollHeight;
    });
}

// --- Modal ---
function openReservationModal(giftId, action) {
    const gift = allGifts.find(g => g.id === giftId);
    if (!gift) return;
    currentModalAction = { id: giftId, action };
    modalTitle.textContent = action === 'edit-occasion' ? 'Upravit příležitost' : 'Rezervovat dárek';
    modalGiftName.textContent = gift.name;
    modalOccasion.value = gift.occasion || '';
    reservationModal.classList.remove('hidden');
    modalOccasion.focus();
}

modalCancelBtn.addEventListener('click', () => reservationModal.classList.add('hidden'));
reservationModal.addEventListener('click', e => { if (e.target === reservationModal) reservationModal.classList.add('hidden'); });

modalConfirmBtn.addEventListener('click', async () => {
    const { id, action } = currentModalAction;
    if (!id || !action) return;
    const rawOcc = modalOccasion.value.trim();
    if (!rawOcc) { alert('Příležitost nesmí být prázdná.'); return; }
    const newOcc = rawOcc.charAt(0).toUpperCase() + rawOcc.slice(1);
    const giftRef = doc(db, 'gifts', id);
    let upd = { occasion: newOcc };
    try {
        if (action === 'claim-solo') upd = { ...upd, status: 'claimed-solo', claimedBySolo: currentUser.uid, contributors: [], coordinator: null };
        else if (action === 'create-group') upd = { ...upd, status: 'group-open', contributors: arrayUnion(currentUser.uid), coordinator: currentUser.uid };
        await updateDoc(giftRef, upd);
        reservationModal.classList.add('hidden');
        currentModalAction = { id: null, action: null };
    } catch(e) { console.error(e); alert('Chyba. Zkuste to znovu.'); }
});

// --- Lightbox ---
lightboxClose.addEventListener('click', () => { imageLightbox.classList.add('hidden'); lightboxImage.src = ''; });
imageLightbox.addEventListener('click', e => { if (e.target === imageLightbox) { imageLightbox.classList.add('hidden'); lightboxImage.src = ''; } });

// --- Filter listeners ---
occasionFilter.addEventListener('change', renderFilteredGifts);
searchInput.addEventListener('input', renderFilteredGifts);

// --- Image preview in admin form ---
giftImageInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = ev => { giftImagePreview.src = ev.target.result; giftImagePreview.classList.remove('hidden'); };
        reader.readAsDataURL(file);
    } else { giftImagePreview.classList.add('hidden'); giftImagePreview.src = ''; }
});
cancelEditBtn.addEventListener('click', resetAdminForm);

// --- Admin form submit ---
addGiftForm.addEventListener('submit', async e => {
    e.preventDefault();
    addGiftLoader.classList.remove('hidden');
    addGiftSubmitBtn.disabled = true;
    cancelEditBtn.disabled = true;

    const rawOcc = document.getElementById('gift-occasion').value.trim();
    const isContrib = giftIsContributionCheckbox.checked;
    const file = giftImageInput.files[0];
    let giftData = {
        name: document.getElementById('gift-name').value,
        recipient: document.getElementById('gift-recipient').value,
        occasion: rawOcc ? rawOcc.charAt(0).toUpperCase() + rawOcc.slice(1) : 'Neurčeno',
        description: document.getElementById('gift-description').value || '',
        link: document.getElementById('gift-link').value || '',
        giftType: isContrib ? 'contribution' : 'item'
    };

    try {
        if (currentEditGiftId) {
            const giftRef = doc(db, 'gifts', currentEditGiftId);
            const orig = allGifts.find(g => g.id === currentEditGiftId);
            if (file) {
                const imagePath = `gifts/${currentEditGiftId}/${file.name}`;
                const sRef = ref(storage, imagePath);
                await uploadBytes(sRef, file, { contentType: file.type });
                giftData.imageUrl = await getDownloadURL(sRef);
                giftData.imagePath = imagePath;
                if (orig.imagePath && orig.imagePath !== imagePath) {
                    try { await deleteObject(ref(storage, orig.imagePath)); } catch(e) {}
                }
            } else {
                giftData.imageUrl = orig.imageUrl || null;
                giftData.imagePath = orig.imagePath || null;
            }
            await updateDoc(giftRef, giftData);
        } else {
            const newRef = doc(collection(db, 'gifts'));
            const giftId = newRef.id;
            let imageUrl = null, imagePath = null;
            if (file) {
                imagePath = `gifts/${giftId}/${file.name}`;
                const sRef = ref(storage, imagePath);
                await uploadBytes(sRef, file, { contentType: file.type });
                imageUrl = await getDownloadURL(sRef);
            }
            await setDoc(newRef, { ...giftData, imageUrl, imagePath, status: 'available', claimedBySolo: null, contributors: [], coordinator: null });
        }
        resetAdminForm();
    } catch(err) { console.error(err); alert('Chyba při ukládání dárku.'); }
    finally { addGiftLoader.classList.add('hidden'); addGiftSubmitBtn.disabled = false; cancelEditBtn.disabled = false; }
});

// --- Main event delegation on gifts-wrapper ---
giftsWrapper.addEventListener('click', async e => {
    if (!currentUser) return;

    // Lightbox
    const img = e.target.closest('.gift-image-clickable');
    if (img) { lightboxImage.src = img.src; imageLightbox.classList.remove('hidden'); return; }

    // Admin dropdown toggle
    const dropToggle = e.target.closest('.admin-dropdown-toggle');
    if (dropToggle) {
        e.stopPropagation();
        const dropdown = dropToggle.closest('.admin-dropdown');
        const isOpen = dropdown.classList.contains('open');
        document.querySelectorAll('.admin-dropdown.open').forEach(d => d.classList.remove('open'));
        if (!isOpen) dropdown.classList.add('open');
        return;
    }

    // Close dropdowns on outside click
    if (!e.target.closest('.admin-dropdown-menu')) {
        document.querySelectorAll('.admin-dropdown.open').forEach(d => d.classList.remove('open'));
    }

    const btn = e.target.closest('button');
    if (!btn) return;

    // Chat comment actions
    const msgEl = btn.closest('.chat-message');
    if (msgEl) {
        const msgId = msgEl.dataset.msgId;
        const chatGiftId = msgEl.closest('[id^="chat-"]').id.replace('chat-', '');
        if (!msgId || !chatGiftId) return;
        const msgRef = doc(db, 'gifts', chatGiftId, 'chat', msgId);
        try {
            if (btn.matches('.delete-comment-btn') && confirm('Opravdu smazat komentář?')) {
                await deleteDoc(msgRef);
            }
            if (btn.matches('.edit-comment-btn')) {
                const contentEl = msgEl.querySelector('.message-content');
                const origText = contentEl.querySelector('.message-text').textContent.trim();
                contentEl.style.display = 'none';
                btn.closest('.chat-actions').style.display = 'none';
                const form = document.createElement('form');
                form.className = 'chat-form edit-comment-form';
                form.style.marginTop = '0';
                const inp = document.createElement('input');
                inp.type = 'text'; inp.value = origText; inp.required = true;
                const saveB = document.createElement('button');
                saveB.type = 'submit'; saveB.textContent = 'Uložit';
                const cancelB = document.createElement('button');
                cancelB.type = 'button'; cancelB.textContent = 'Zrušit';
                cancelB.className = 'btn btn-ghost btn-xs';
                cancelB.style.marginLeft = '4px';
                cancelB.addEventListener('click', () => {
                    form.remove();
                    contentEl.style.display = '';
                    if (msgEl.querySelector('.chat-actions')) msgEl.querySelector('.chat-actions').style.display = '';
                });
                form.append(inp, saveB, cancelB);
                msgEl.appendChild(form);
            }
            if (btn.matches('.cancel-edit-btn')) {
                msgEl.querySelector('.edit-comment-form')?.remove();
                msgEl.querySelector('.message-content').style.display = '';
            }
        } catch(err) { console.error(err); }
        return;
    }

    const giftId = btn.dataset.id;
    if (!giftId) return;
    const giftRef = doc(db, 'gifts', giftId);

    // Modal-opening actions
    const modalAction = btn.dataset.action;
    if (modalAction) { openReservationModal(giftId, modalAction); return; }

    try {
        if (btn.matches('.join-group-btn')) await updateDoc(giftRef, { contributors: arrayUnion(currentUser.uid) });
        if (btn.matches('.cancel-solo-claim-btn')) await updateDoc(giftRef, { status: 'available', claimedBySolo: null });
        if (btn.matches('.leave-group-btn')) {
            if (!confirm('Opravdu chcete odejít / zrušit příspěvek?')) return;
            const snap = await getDoc(giftRef);
            const d = snap.data();
            if (d.giftType === 'contribution') {
                await updateDoc(giftRef, { contributors: arrayRemove(currentUser.uid) });
            } else {
                const curr = d.contributors || [];
                if (curr.length === 1 && curr[0] === currentUser.uid) {
                    await updateDoc(giftRef, { status: 'available', contributors: arrayRemove(currentUser.uid), coordinator: null });
                } else {
                    await updateDoc(giftRef, { contributors: arrayRemove(currentUser.uid) });
                }
            }
        }
        if (btn.matches('.finalize-group-btn') && confirm('Označit skupinu jako domluvenou? Chat bude uzamčen.')) {
            await updateDoc(giftRef, { status: 'claimed-group' });
        }
        if (btn.matches('.reopen-group-btn') && confirm('Znovu otevřít diskuzi? Chat bude odemčen.')) {
            await updateDoc(giftRef, { status: 'group-open' });
        }

        // Admin actions
        if (isAdmin) {
            if (btn.matches('.admin-reset-reservation-btn') && confirm('ADMIN: Zrušit rezervaci a vrátit na Dostupné?')) {
                await updateDoc(giftRef, { status: 'available', claimedBySolo: null, contributors: [], coordinator: null });
            }
            if (btn.matches('.admin-reset-contributors-btn') && confirm('ADMIN: Smazat seznam přispěvatelů?')) {
                await updateDoc(giftRef, { contributors: [] });
            }
            if (btn.matches('.admin-delete-btn') && confirm('ADMIN: Trvale smazat dárek? Tato akce je nevratná.')) {
                const gift = allGifts.find(g => g.id === giftId);
                if (gift?.imagePath) try { await deleteObject(ref(storage, gift.imagePath)); } catch(e) {}
                await deleteDoc(giftRef);
            }
            if (btn.matches('.admin-edit-btn')) {
                const gift = allGifts.find(g => g.id === giftId);
                if (gift) {
                    document.getElementById('gift-name').value = gift.name || '';
                    document.getElementById('gift-recipient').value = gift.recipient || 'Ostatní';
                    document.getElementById('gift-occasion').value = gift.occasion || '';
                    document.getElementById('gift-description').value = gift.description || '';
                    document.getElementById('gift-link').value = gift.link || '';
                    giftIsContributionCheckbox.checked = gift.giftType === 'contribution';
                    giftImageInput.value = null;
                    if (gift.imageUrl) { giftImagePreview.src = gift.imageUrl; giftImagePreview.classList.remove('hidden'); }
                    else { giftImagePreview.classList.add('hidden'); giftImagePreview.src = ''; }
                    adminFormTitle.textContent = `Právě upravujete: ${gift.name}`;
                    addGiftSubmitBtn.textContent = 'Uložit změny';
                    cancelEditBtn.classList.remove('hidden');
                    currentEditGiftId = giftId;
                    adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.querySelectorAll('.admin-dropdown.open').forEach(d => d.classList.remove('open'));
                }
            }
        }
    } catch(err) { console.error(err); alert('Došlo k chybě.'); }
});

// --- Chat form submit ---
giftsWrapper.addEventListener('submit', async e => {
    e.preventDefault();
    if (!currentUser) return;

    // New chat message
    if (e.target.matches('.chat-form') && !e.target.matches('.edit-comment-form')) {
        const giftId = e.target.querySelector('button[data-id]')?.dataset.id;
        const input = e.target.querySelector('input');
        const msg = input?.value.trim();
        if (msg && giftId) {
            await addDoc(collection(db, 'gifts', giftId, 'chat'), {
                user: currentUser.displayName, uid: currentUser.uid, message: msg, timestamp: serverTimestamp()
            });
            input.value = '';
        }
    }

    // Edit chat message
    if (e.target.matches('.edit-comment-form')) {
        const giftId = e.target.closest('[id^="chat-"]').id.replace('chat-', '');
        const msgId = e.target.closest('.chat-message').dataset.msgId;
        const newMsg = e.target.querySelector('input').value.trim();
        if (newMsg && giftId && msgId) {
            await updateDoc(doc(db, 'gifts', giftId, 'chat', msgId), { message: newMsg });
        }
    }
});

// Close admin dropdowns when clicking anywhere outside
document.addEventListener('click', e => {
    if (!e.target.closest('.admin-dropdown')) {
        document.querySelectorAll('.admin-dropdown.open').forEach(d => d.classList.remove('open'));
    }
});
