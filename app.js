// --- Firebase Konfigurace --------------------------------------------------
// Tento objekt získáš v nastavení svého projektu ve Firebase konzoli.
// Project Settings -> General -> Your apps -> SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyC5qWRgRWW9q5G8NRmOpCln1Wwb03Z2eXs",
  authDomain: "darky-rodina.firebaseapp.com",
  projectId: "darky-rodina",
  storageBucket: "darky-rodina.firebasestorage.app",
  messagingSenderId: "1070152594421",
  appId: "1:1070152594421:web:5e686e340e756025d726bc"
};

// --- Inicializace Firebase ------------------------------------------------
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- Reference na HTML Elementy -------------------------------------------
const authContainer = document.getElementById('auth-container');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfo = document.getElementById('user-info');
const userNameEl = document.getElementById('user-name');

const appContent = document.getElementById('app-content');
const welcomeMsg = document.getElementById('welcome-msg');
const pendingApprovalMsg = document.getElementById('pending-approval-msg');
const giftsContainer = document.getElementById('gifts-container');
const loader = document.getElementById('loader');

let currentUser = null; // Uchováme si info o přihlášeném uživateli

// --- Autentizace ---------------------------------------------------------
loginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider);
});

logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// Sledování změn stavu přihlášení
auth.onAuthStateChanged(user => {
    currentUser = user;
    if (user) {
        // Uživatel je přihlášen
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userInfo.classList.add('flex');
        userNameEl.textContent = user.displayName;
        welcomeMsg.classList.add('hidden');
        checkUserRoleAndLoadGifts(user);
    } else {
        // Uživatel je odhlášen
        loginBtn.classList.remove('hidden');
        userInfo.classList.add('hidden');
        userNameEl.textContent = '';
        giftsContainer.innerHTML = '';
        welcomeMsg.classList.remove('hidden');
        pendingApprovalMsg.classList.add('hidden');
    }
});

// --- Logika Aplikace ----------------------------------------------------

async function checkUserRoleAndLoadGifts(user) {
    loader.classList.remove('hidden');
    loader.classList.add('flex');
    giftsContainer.innerHTML = '';
    
    const userRef = db.collection('users').doc(user.uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        // Uživatel je tu poprvé -> vytvoříme záznam a čeká na schválení
        try {
            await userRef.set({
                email: user.email,
                displayName: user.displayName,
                role: 'pending' // Role: pending, approved, admin
            });
            pendingApprovalMsg.classList.remove('hidden');
        } catch (error) {
            console.error("Error creating user profile:", error);
        }
        loader.classList.add('hidden');
    } else {
        const userData = userDoc.data();
        if (userData.role === 'approved' || userData.role === 'admin') {
            pendingApprovalMsg.classList.add('hidden');
            listenForGifts(); // Začneme naslouchat změnám dárků
        } else { // Role je 'pending'
            pendingApprovalMsg.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
}

// Naslouchání změn v reálném čase
function listenForGifts() {
    db.collection('gifts').onSnapshot(snapshot => {
        loader.classList.add('hidden');
        giftsContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const gift = { id: doc.id, ...doc.data() };
            renderGift(gift);
        });
    }, error => {
        console.error("Error fetching gifts:", error);
    });
}

// Vykreslení jednoho dárku
function renderGift(gift) {
    const isContributor = gift.contributors && gift.contributors.includes(currentUser.uid);
    const isCoordinator = gift.coordinator === currentUser.uid;
    const isSoloClaimer = gift.claimedBySolo === currentUser.uid;

    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-lg border border-slate-200 shadow-sm";
    
    let statusHTML = '';
    // Logika pro zobrazení stavu a tlačítek
    switch(gift.status) {
        case 'available':
            statusHTML = `
                <p class="text-sm text-green-600 font-semibold mb-3">Dostupné</p>
                <div class="flex gap-2">
                    <button data-id="${gift.id}" class="claim-solo-btn px-3 py-1 bg-indigo-500 text-white text-sm rounded-md hover:bg-indigo-600">Koupím sám/a</button>
                    <button data-id="${gift.id}" class="create-group-btn px-3 py-1 bg-slate-500 text-white text-sm rounded-md hover:bg-slate-600">Chci se složit</button>
                </div>`;
            break;
        case 'group-open':
            statusHTML = `<p class="text-sm text-blue-600 font-semibold mb-3">Skládá se skupina</p>`;
            if (!isContributor) {
                statusHTML += `<button data-id="${gift.id}" class="join-group-btn px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600">Přidat se</button>`;
            }
            break;
        case 'claimed-solo':
        case 'claimed-group':
            statusHTML = `<p class="text-sm text-slate-500 font-semibold mb-3">Zarezervováno</p>`;
            break;
    }

    // Zobrazení chatu pouze pro členy skupiny
    let chatHTML = '';
    if (isContributor) {
        chatHTML = `
            <div class="mt-4 pt-4 border-t border-slate-200">
                <h4 class="font-semibold text-sm mb-2">Domluva ve skupině:</h4>
                <div id="chat-${gift.id}" class="space-y-2 text-sm max-h-40 overflow-y-auto pr-2"></div>
                <form class="chat-form flex gap-2 mt-3">
                    <input type="text" placeholder="Napsat zprávu..." class="flex-grow border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500">
                    <button type="submit" data-id="${gift.id}" class="px-3 py-1 bg-indigo-500 text-white text-sm rounded-md hover:bg-indigo-600">Odeslat</button>
                </form>
            </div>
        `;
        // Načteme a vykreslíme chat
        listenForChatMessages(gift.id);
    }


    card.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <h3 class="text-lg font-bold">${gift.name}</h3>
                <p class="text-sm text-slate-500 mb-2">Příležitost: ${gift.occasion}</p>
                <p class="text-slate-700">${gift.description}</p>
                ${gift.link ? `<a href="${gift.link}" target="_blank" class="text-indigo-600 hover:underline text-sm">Odkaz na dárek</a>` : ''}
            </div>
            <div class="text-right">
                ${statusHTML}
            </div>
        </div>
        ${chatHTML}
    `;
    
    giftsContainer.appendChild(card);
}

function listenForChatMessages(giftId) {
    db.collection('gifts').doc(giftId).collection('chat').orderBy('timestamp')
      .onSnapshot(snapshot => {
        const chatContainer = document.getElementById(`chat-${giftId}`);
        if (!chatContainer) return;
        chatContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const msgEl = document.createElement('div');
            msgEl.innerHTML = `<p><strong class="font-semibold">${msg.user}:</strong> ${msg.message}</p>`;
            chatContainer.appendChild(msgEl);
        });
        // Scroll to bottom
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}


// --- Event Listeners pro akce ---------------------------------------------
giftsContainer.addEventListener('click', async (e) => {
    const giftId = e.target.dataset.id;
    if (!giftId || !currentUser) return;

    if (e.target.matches('.claim-solo-btn')) {
        await db.collection('gifts').doc(giftId).update({
            status: 'claimed-solo',
            claimedBySolo: currentUser.uid,
            contributors: [],
            coordinator: null
        });
    }
    if (e.target.matches('.create-group-btn')) {
        await db.collection('gifts').doc(giftId).update({
            status: 'group-open',
            contributors: firebase.firestore.FieldValue.arrayUnion(currentUser.uid),
            coordinator: currentUser.uid
        });
    }
    if (e.target.matches('.join-group-btn')) {
        await db.collection('gifts').doc(giftId).update({
            contributors: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
        });
    }
});

giftsContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.target.matches('.chat-form')) return;

    const giftId = e.target.querySelector('button').dataset.id;
    const input = e.target.querySelector('input');
    const message = input.value.trim();

    if (message && giftId && currentUser) {
        await db.collection('gifts').doc(giftId).collection('chat').add({
            user: currentUser.displayName,
            uid: currentUser.uid,
            message: message,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value = '';
    }
});
