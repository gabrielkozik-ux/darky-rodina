// --- Importy potřebných funkcí z Firebase SDK -----------------------------
// Načítáme moduly přímo z Firebase CDN, což nám umožňuje moderní přístup
// bez nutnosti "build" procesů jako Webpack.
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, serverTimestamp, addDoc, query, orderBy } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- Firebase Konfigurace --------------------------------------------------
// Tvoje konfigurační data z Firebase projektu.
const firebaseConfig = {
    apiKey: "AIzaSyC5qWRgRWW9q5G8NRmOpCln1Wwb03Z2eXs",
    authDomain: "darky-rodina.firebaseapp.com",
    projectId: "darky-rodina",
    storageBucket: "darky-rodina.firebasestorage.app",
    messagingSenderId: "1070152594421",
    appId: "1:1070152594421:web:5e686e340e756025d726bc"
};

// --- Inicializace Firebase a služeb --------------------------------------
// Inicializujeme aplikaci a získáme reference na služby Auth a Firestore.
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Reference na HTML Elementy -------------------------------------------
// Načteme si všechny elementy z HTML, se kterými budeme pracovat.
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfo = document.getElementById('user-info');
const userNameEl = document.getElementById('user-name');
const welcomeMsg = document.getElementById('welcome-msg');
const pendingApprovalMsg = document.getElementById('pending-approval-msg');
const giftsContainer = document.getElementById('gifts-container');
const loader = document.getElementById('loader');

let currentUser = null; // Globální proměnná pro přihlášeného uživatele

// --- Autentizace ---------------------------------------------------------

// Přihlášení pomocí Google
loginBtn.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => {
        console.error("Chyba při přihlašování: ", error);
    });
});

// Odhlášení
logoutBtn.addEventListener('click', () => {
    signOut(auth);
});

// Sledování změn stavu přihlášení (uživatel se přihlásí / odhlásí)
onAuthStateChanged(auth, user => {
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
        loader.classList.add('hidden');
    }
});

// --- Logika Aplikace ----------------------------------------------------

/**
 * Zkontroluje roli uživatele v databázi. Pokud neexistuje, vytvoří ho
 * s rolí 'pending'. Pokud je schválený, načte dárky.
 * @param {object} user - Objekt uživatele z Firebase Auth.
 */
async function checkUserRoleAndLoadGifts(user) {
    loader.classList.remove('hidden');
    loader.classList.add('flex');
    giftsContainer.innerHTML = '';
    
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        // Uživatel je v systému poprvé, vytvoříme mu profil.
        try {
            await setDoc(userRef, {
                email: user.email,
                displayName: user.displayName,
                role: 'pending' // Role: pending, approved, admin
            });
            pendingApprovalMsg.classList.remove('hidden');
        } catch (error) {
            console.error("Chyba při vytváření uživatelského profilu:", error);
        }
        loader.classList.add('hidden');
    } else {
        // Uživatel již v databázi existuje, zkontrolujeme jeho roli.
        const userData = userDoc.data();
        if (userData.role === 'approved' || userData.role === 'admin') {
            pendingApprovalMsg.classList.add('hidden');
            listenForGifts(); // Uživatel je schválen, načteme dárky.
        } else { // Role je 'pending' nebo jiná neschválená.
            pendingApprovalMsg.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
}

/**
 * Naslouchá změnám v kolekci 'gifts' v reálném čase a překresluje seznam.
 */
function listenForGifts() {
    const giftsQuery = query(collection(db, 'gifts'));
    onSnapshot(giftsQuery, snapshot => {
        loader.classList.add('hidden');
        giftsContainer.innerHTML = ''; // Vyčistíme starý seznam
        snapshot.forEach(doc => {
            const gift = { id: doc.id, ...doc.data() };
            renderGift(gift);
        });
    }, error => {
        console.error("Chyba při načítání dárků:", error);
    });
}

/**
 * Vykreslí jednu kartu dárku do HTML.
 * @param {object} gift - Objekt dárku z Firestore.
 */
function renderGift(gift) {
    const isContributor = gift.contributors && gift.contributors.includes(currentUser.uid);

    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-lg border border-slate-200 shadow-sm";
    
    let statusHTML = '';
    // Logika pro zobrazení stavu a tlačítek podle statusu dárku
    switch(gift.status) {
        case 'available':
            statusHTML = `
                <p class="text-sm text-green-600 font-semibold mb-3">Dostupné</p>
                <div class="flex flex-col sm:flex-row gap-2">
                    <button data-id="${gift.id}" class="claim-solo-btn px-3 py-1 bg-indigo-500 text-white text-sm rounded-md hover:bg-indigo-600">Koupím sám/a</button>
                    <button data-id="${gift.id}" class="create-group-btn px-3 py-1 bg-slate-500 text-white text-sm rounded-md hover:bg-slate-600">Chci se složit</button>
                </div>`;
            break;
        case 'group-open':
            statusHTML = `<p class="text-sm text-blue-600 font-semibold mb-3">Skládá se skupina (${gift.contributors.length})</p>`;
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
                    <input type="text" placeholder="Napsat zprávu..." class="flex-grow border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" required>
                    <button type="submit" data-id="${gift.id}" class="px-3 py-1 bg-indigo-500 text-white text-sm rounded-md hover:bg-indigo-600">Odeslat</button>
                </form>
            </div>
        `;
        // Asynchronně načteme zprávy pro tento chat
        listenForChatMessages(gift.id);
    }

    card.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="flex-grow">
                <h3 class="text-lg font-bold">${gift.name}</h3>
                <p class="text-sm text-slate-500 mb-2">Příležitost: ${gift.occasion}</p>
                <p class="text-slate-700">${gift.description}</p>
                ${gift.link ? `<a href="${gift.link}" target="_blank" class="text-indigo-600 hover:underline text-sm break-all">Odkaz na dárek</a>` : ''}
            </div>
            <div class="text-left sm:text-right flex-shrink-0">
                ${statusHTML}
            </div>
        </div>
        ${chatHTML}
    `;
    
    giftsContainer.appendChild(card);
}

/**
 * Naslouchá zprávám v chatu konkrétního dárku.
 * @param {string} giftId - ID dárku.
 */
function listenForChatMessages(giftId) {
    const chatQuery = query(collection(db, 'gifts', giftId, 'chat'), orderBy('timestamp'));
    onSnapshot(chatQuery, snapshot => {
        const chatContainer = document.getElementById(`chat-${giftId}`);
        if (!chatContainer) return;
        chatContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const msgEl = document.createElement('div');
            // Zvýraznění vlastních zpráv
            const sender = msg.uid === currentUser.uid ? 'Vy' : msg.user;
            const fontWeight = msg.uid === currentUser.uid ? 'font-bold' : 'font-semibold';
            msgEl.innerHTML = `<p><strong class="${fontWeight}">${sender}:</strong> ${msg.message}</p>`;
            chatContainer.appendChild(msgEl);
        });
        // Automaticky odscrollovat na poslední zprávu
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

// --- Event Listeners pro akce s dárky ---------------------------------------
giftsContainer.addEventListener('click', async (e) => {
    const btn = e.target;
    const giftId = btn.dataset.id;
    if (!giftId || !currentUser) return;

    const giftRef = doc(db, 'gifts', giftId);

    if (btn.matches('.claim-solo-btn')) {
        await updateDoc(giftRef, {
            status: 'claimed-solo',
            claimedBySolo: currentUser.uid,
            contributors: [],
            coordinator: null
        });
    }
    if (btn.matches('.create-group-btn')) {
        await updateDoc(giftRef, {
            status: 'group-open',
            contributors: arrayUnion(currentUser.uid),
            coordinator: currentUser.uid
        });
    }
    if (btn.matches('.join-group-btn')) {
        await updateDoc(giftRef, {
            contributors: arrayUnion(currentUser.uid)
        });
    }
});

// Odesílání zpráv v chatu
giftsContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.target.matches('.chat-form')) return;

    const giftId = e.target.querySelector('button').dataset.id;
    const input = e.target.querySelector('input');
    const message = input.value.trim();

    if (message && giftId && currentUser) {
        const chatCollectionRef = collection(db, 'gifts', giftId, 'chat');
        await addDoc(chatCollectionRef, {
            user: currentUser.displayName,
            uid: currentUser.uid,
            message: message,
            timestamp: serverTimestamp()
        });
        input.value = ''; // Vyčistit pole po odeslání
    }
});
