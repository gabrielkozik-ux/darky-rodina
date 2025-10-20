// --- Importy potřebných funkcí z Firebase SDK -----------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, serverTimestamp, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

// --- Firebase Konfigurace --------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyC5qWRgRWW9q5G8NRmOpCln1Wwb03Z2eXs",
    authDomain: "darky-rodina.firebaseapp.com",
    projectId: "darky-rodina",
    storageBucket: "darky-rodina.firebasestorage.app",
    messagingSenderId: "1070152594421",
    appId: "1:1070152594421:web:5e686e340e756025d726bc"
};

// --- Inicializace Firebase a služeb --------------------------------------
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Reference na HTML Elementy -------------------------------------------
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfo = document.getElementById('user-info');
const userNameEl = document.getElementById('user-name');
const welcomeMsg = document.getElementById('welcome-msg');
const pendingApprovalMsg = document.getElementById('pending-approval-msg');
const giftsContainer = document.getElementById('gifts-container');
const loader = document.getElementById('loader');

// --- Globální proměnné ----------------------------------------------------
let currentUser = null;
let isAdmin = false;

// --- Autentizace ---------------------------------------------------------
loginBtn.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider).catch(error => console.error("Chyba při přihlašování: ", error));
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, user => {
    currentUser = user;
    if (user) {
        loginBtn.classList.add('hidden');
        userInfo.classList.remove('hidden');
        userInfo.classList.add('flex');
        userNameEl.textContent = user.displayName;
        welcomeMsg.classList.add('hidden');
        checkUserRoleAndLoadGifts(user);
    } else {
        isAdmin = false;
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
async function checkUserRoleAndLoadGifts(user) {
    loader.classList.remove('hidden');
    loader.classList.add('flex');
    giftsContainer.innerHTML = '';
    
    const userRef = doc(db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
        isAdmin = false;
        try {
            await setDoc(userRef, {
                email: user.email,
                displayName: user.displayName,
                role: 'pending'
            });
            pendingApprovalMsg.classList.remove('hidden');
        } catch (error) {
            console.error("Chyba při vytváření uživatelského profilu:", error);
        }
        loader.classList.add('hidden');
    } else {
        const userData = userDoc.data();
        isAdmin = userData.role === 'admin';
        if (userData.role === 'approved' || userData.role === 'admin') {
            pendingApprovalMsg.classList.add('hidden');
            listenForGifts();
        } else {
            pendingApprovalMsg.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
}

function listenForGifts() {
    const giftsQuery = query(collection(db, 'gifts'));
    onSnapshot(giftsQuery, snapshot => {
        loader.classList.add('hidden');
        giftsContainer.innerHTML = '';
        if (snapshot.empty) {
             giftsContainer.innerHTML = `<p class="text-center text-slate-500">Zatím tu nejsou žádné nápady na dárky.</p>`;
        }
        snapshot.forEach(doc => {
            const gift = { id: doc.id, ...doc.data() };
            renderGift(gift);
        });
    }, error => console.error("Chyba při načítání dárků:", error));
}

function renderGift(gift) {
    const isContributor = gift.contributors && gift.contributors.includes(currentUser.uid);
    const isSoloClaimer = gift.claimedBySolo === currentUser.uid;

    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-lg border border-slate-200 shadow-sm";
    
    let statusHTML = '';
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
            statusHTML = `<p class="text-sm text-blue-600 font-semibold mb-3">Skládá se skupina (${gift.contributors?.length || 0})</p>`;
            if (!isContributor) {
                statusHTML += `<button data-id="${gift.id}" class="join-group-btn px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600">Přidat se</button>`;
            }
            break;
        case 'claimed-solo':
            if (isSoloClaimer) {
                statusHTML = `
                    <p class="text-sm text-slate-500 font-semibold mb-3">Zarezervováno vámi</p>
                    <button data-id="${gift.id}" class="cancel-solo-claim-btn px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600">Zrušit rezervaci</button>
                `;
            } else if (isAdmin) {
                 statusHTML = `<p class="text-sm text-purple-600 font-semibold mb-3">Rezervoval někdo jiný</p>`;
            } else {
                statusHTML = `<p class="text-sm text-slate-500 font-semibold mb-3">Zarezervováno</p>`;
            }
            break;
        case 'claimed-group':
            statusHTML = `<p class="text-sm text-slate-500 font-semibold mb-3">Zarezervováno (skupina)</p>`;
            break;
    }

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
        listenForChatMessages(gift.id);
    }

    card.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="flex-grow">
                <h3 class="text-lg font-bold">${gift.name}</h3>
                ${gift.recipient ? `<p class="text-sm font-medium text-slate-600">Pro: ${gift.recipient}</p>` : ''}
                <p class="text-sm text-slate-500 mb-2">Příležitost: ${gift.occasion}</p>
                <p class="text-slate-700">${gift.description}</p>
                ${gift.link ? `<a href="${gift.link}" target="_blank" rel="noopener noreferrer" class="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-800 text-sm font-semibold rounded-md hover:bg-gray-200">Přejít na web dárku</a>` : ''}
            </div>
            <div class="text-left sm:text-right flex-shrink-0">
                ${statusHTML}
            </div>
        </div>
        ${chatHTML}
    `;
    giftsContainer.appendChild(card);
}

function listenForChatMessages(giftId) {
    const chatQuery = query(collection(db, 'gifts', giftId, 'chat'), orderBy('timestamp'));
    onSnapshot(chatQuery, snapshot => {
        const chatContainer = document.getElementById(`chat-${giftId}`);
        if (!chatContainer) return;
        chatContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const msgEl = document.createElement('div');
            msgEl.className = 'chat-message flex items-start justify-between gap-2';
            msgEl.dataset.msgId = doc.id; // Uložíme ID zprávy pro pozdější použití

            const isMyMessage = msg.uid === currentUser.uid;
            const sender = isMyMessage ? 'Vy' : msg.user;
            const fontWeight = isMyMessage ? 'font-bold' : 'font-semibold';

            let actionsHTML = '';
            if (isMyMessage) {
                actionsHTML = `
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button class="edit-comment-btn text-xs text-slate-500 hover:text-indigo-600" title="Upravit">✏️</button>
                        <button class="delete-comment-btn text-xs text-slate-500 hover:text-red-600" title="Smazat">🗑️</button>
                    </div>
                `;
            }

            msgEl.innerHTML = `
                <div class="message-content">
                    <p><strong class="${fontWeight}">${sender}:</strong> <span class="message-text">${msg.message}</span></p>
                </div>
                ${actionsHTML}
            `;
            chatContainer.appendChild(msgEl);
        });
        chatContainer.scrollTop = chatContainer.scrollHeight;
    });
}

// --- Event Listeners pro akce ---
giftsContainer.addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); // Zajistí, že chytneme i klik na ikonu v tlačítku
    if (!btn || !currentUser) return;

    const giftId = btn.dataset.id || btn.closest('[data-id]')?.dataset.id || btn.closest('.chat-message')?.closest('[id^="chat-"]')?.id.replace('chat-', '');
    const giftRef = giftId ? doc(db, 'gifts', giftId) : null;

    // Akce s dárky
    if (btn.matches('.claim-solo-btn')) await updateDoc(giftRef, { status: 'claimed-solo', claimedBySolo: currentUser.uid, contributors: [], coordinator: null });
    if (btn.matches('.create-group-btn')) await updateDoc(giftRef, { status: 'group-open', contributors: arrayUnion(currentUser.uid), coordinator: currentUser.uid });
    if (btn.matches('.join-group-btn')) await updateDoc(giftRef, { contributors: arrayUnion(currentUser.uid) });
    if (btn.matches('.cancel-solo-claim-btn')) await updateDoc(giftRef, { status: 'available', claimedBySolo: null });

    // Akce s komentáři
    const msgId = btn.closest('.chat-message')?.dataset.msgId;

    if (btn.matches('.delete-comment-btn') && confirm('Opravdu smazat komentář?')) {
        const msgRef = doc(db, 'gifts', giftId, 'chat', msgId);
        await deleteDoc(msgRef);
    }
    
    if (btn.matches('.edit-comment-btn')) {
        const msgEl = btn.closest('.chat-message');
        const contentEl = msgEl.querySelector('.message-content');
        const originalText = contentEl.querySelector('.message-text').textContent;
        contentEl.style.display = 'none'; // Skryjeme původní text
        btn.parentElement.style.display = 'none'; // Skryjeme tlačítka

        const editForm = document.createElement('form');
        editForm.className = 'edit-comment-form flex-grow flex gap-2';
        editForm.innerHTML = `
            <input type="text" value="${originalText}" class="flex-grow border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" required>
            <button type="submit" class="px-2 py-1 bg-green-500 text-white text-xs rounded-md hover:bg-green-600">Uložit</button>
            <button type="button" class="cancel-edit-btn px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded-md hover:bg-slate-300">Zrušit</button>
        `;
        msgEl.appendChild(editForm);
    }

    if (btn.matches('.cancel-edit-btn')) {
        const msgEl = btn.closest('.chat-message');
        msgEl.querySelector('.edit-comment-form').remove();
        msgEl.querySelector('.message-content').style.display = 'block';
        msgEl.querySelector('.flex-shrink-0').style.display = 'flex';
    }
});

giftsContainer.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    
    // Odeslání nové zprávy
    if (e.target.matches('.chat-form')) {
        const giftId = e.target.querySelector('button').dataset.id;
        const input = e.target.querySelector('input');
        const message = input.value.trim();
        if (message && giftId) {
            const chatCollectionRef = collection(db, 'gifts', giftId, 'chat');
            await addDoc(chatCollectionRef, { user: currentUser.displayName, uid: currentUser.uid, message: message, timestamp: serverTimestamp() });
            input.value = '';
        }
    }
    
    // Uložení upravené zprávy
    if (e.target.matches('.edit-comment-form')) {
        const giftId = e.target.closest('[id^="chat-"]').id.replace('chat-', '');
        const msgId = e.target.closest('.chat-message').dataset.msgId;
        const input = e.target.querySelector('input');
        const newMessage = input.value.trim();
        if (newMessage && giftId && msgId) {
            const msgRef = doc(db, 'gifts', giftId, 'chat', msgId);
            await updateDoc(msgRef, { message: newMessage });
            // onSnapshot se postará o překreslení, takže není třeba nic dalšího
        }
    }
});
