// --- Importy potřebných funkcí z Firebase SDK -----------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";

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
const loader = document.getElementById('loader');

// Nové reference pro rozdělené kontejnery
const giftsWrapper = document.getElementById('gifts-wrapper');
const giftsHanickaSection = document.getElementById('gifts-hanicka-section');
const giftsHanickaContainer = document.getElementById('gifts-hanicka-container');
const giftsOliverSection = document.getElementById('gifts-oliver-section');
const giftsOliverContainer = document.getElementById('gifts-oliver-container');
const giftsOtherSection = document.getElementById('gifts-other-section');
const giftsOtherContainer = document.getElementById('gifts-other-container');

// Nové reference pro filtr
const filterContainer = document.getElementById('filter-container');
const occasionFilter = document.getElementById('occasion-filter');

// *** NOVÉ REFERENCE PRO ZPRÁVY ***
const filterNoResultsMsg = document.getElementById('filter-no-results-msg');
const giftsEmptyDbMsg = document.getElementById('gifts-empty-db-msg');


// --- Globální proměnné ----------------------------------------------------
let currentUser = null;
let isAdmin = false;
let allGifts = []; // Budeme zde držet všechny dárky pro filtrování

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
        welcomeMsg.classList.remove('hidden');
        pendingApprovalMsg.classList.add('hidden');
        loader.classList.add('hidden');
        filterContainer.classList.add('hidden');
        
        // Vyčistit všechny kontejnery
        giftsHanickaContainer.innerHTML = '';
        giftsOliverContainer.innerHTML = '';
        giftsOtherContainer.innerHTML = '';
        giftsHanickaSection.classList.add('hidden');
        giftsOliverSection.classList.add('hidden');
        giftsOtherSection.classList.add('hidden');
        
        // Skrýt zprávy
        filterNoResultsMsg.classList.add('hidden');
        giftsEmptyDbMsg.classList.add('hidden');
    }
});

// --- Logika Aplikace ----------------------------------------------------

/**
 * Funkce pro převod textu s URL na klikatelné odkazy
 */
function linkify(text) {
    if (!text) return '';
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function(url) {
        // Zkrátíme zobrazený text, pokud je příliš dlouhý, ale odkaz zůstane celý
        const shortUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">${shortUrl}</a>`;
    });
}


async function checkUserRoleAndLoadGifts(user) {
    loader.classList.remove('hidden');
    loader.classList.add('flex');
    
    // Vyčistit všechny kontejnery
    giftsHanickaContainer.innerHTML = '';
    giftsOliverContainer.innerHTML = '';
    giftsOtherContainer.innerHTML = '';
    giftsHanickaSection.classList.add('hidden');
    giftsOliverSection.classList.add('hidden');
    giftsOtherSection.classList.add('hidden');
    filterNoResultsMsg.classList.add('hidden');
    giftsEmptyDbMsg.classList.add('hidden');
    
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
            listenForGifts(); // Začneme naslouchat dárkům
        } else {
            pendingApprovalMsg.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
}

function listenForGifts() {
    const giftsQuery = query(collection(db, 'gifts'), orderBy('recipient'), orderBy('name'));
    
    // Přidáno chybové hlášení, aby se loader schoval i při chybě
    onSnapshot(giftsQuery, snapshot => {
        loader.classList.add('hidden');
        
        allGifts = [];
        snapshot.forEach(doc => {
            allGifts.push({ id: doc.id, ...doc.data() });
        });
        
        if (allGifts.length === 0) {
            // Databáze je úplně prázdná
            // *** UPRAVENO ***
            giftsEmptyDbMsg.classList.remove('hidden'); // Zobrazíme zprávu
            filterNoResultsMsg.classList.add('hidden'); // Skryjeme druhou zprávu
            giftsHanickaSection.classList.add('hidden');
            giftsOliverSection.classList.add('hidden');
            giftsOtherSection.classList.add('hidden');
            filterContainer.classList.add('hidden');
            return;
        }

        // Databáze není prázdná
        // *** UPRAVENO ***
        giftsEmptyDbMsg.classList.add('hidden'); // Skryjeme zprávu o prázdné DB

        filterContainer.classList.remove('hidden'); // Zobrazíme filtr
        populateOccasionFilter();
        renderFilteredGifts();

    }, error => {
        console.error("Chyba při načítání dárků:", error);
        loader.classList.add('hidden'); // <-- SCHOVEJ LOADER
        // A zobraz uživateli chybovou hlášku
        giftsWrapper.innerHTML = `<p class="text-center text-red-600 font-semibold p-4">Došlo k chybě při načítání databáze. Zkontrolujte konzoli (F12).</p>`;
    });
}

/**
 * Naplní filtr unikátními příležitostmi z dárků
 */
function populateOccasionFilter() {
    const defaultOptions = ['all', 'Narozeniny', 'Vánoce', 'Svátek'];
    
    // Získáme aktuálně vybranou hodnotu, abychom ji mohli po přeplnění zachovat
    const currentSelectedValue = occasionFilter.value;
    
    const existingOptions = Array.from(occasionFilter.options).map(o => o.value);
    
    const occasions = new Set(allGifts.map(g => g.occasion).filter(Boolean));
    
    // Nejprve smažeme staré dynamicky přidané options (necháme jen ty defaultní)
    Array.from(occasionFilter.options).forEach(option => {
        if (!defaultOptions.includes(option.value)) {
            option.remove();
        }
    });

    // Nyní přidáme všechny unikátní z databáze, které ještě neexistují
    occasions.forEach(occasion => {
        if (!defaultOptions.includes(occasion) && !existingOptions.includes(occasion)) {
            const option = document.createElement('option');
            option.value = occasion;
            option.textContent = occasion;
            occasionFilter.appendChild(option);
        }
    });
    
    // Vrátíme původně vybranou hodnotu
    occasionFilter.value = currentSelectedValue;
}

/**
 * Vykreslí dárky na základě aktuálně zvoleného filtru a rozdělí je
 */
function renderFilteredGifts() {
    // Vyprázdníme kontejnery
    giftsHanickaContainer.innerHTML = '';
    giftsOliverContainer.innerHTML = '';
    giftsOtherContainer.innerHTML = '';

    const selectedOccasion = occasionFilter.value;
    
    const filteredGifts = allGifts.filter(gift => {
        return selectedOccasion === 'all' || gift.occasion === selectedOccasion;
    });

    if (filteredGifts.length === 0) {
         giftsHanickaSection.classList.add('hidden');
         giftsOliverSection.classList.add('hidden');
         giftsOtherSection.classList.add('hidden');
         
         // *** UPRAVENO ***
         // Místo mazání wrapperu jen zobrazíme zprávu
         filterNoResultsMsg.classList.remove('hidden');
         return;
    }
    
    // *** UPRAVENO ***
    // Skryjeme zprávu o prázdném filtru, protože máme výsledky
    filterNoResultsMsg.classList.add('hidden');

    const gifts = { hanicka: [], oliver: [], other: [] };

    filteredGifts.forEach(gift => {
        const recipient = gift.recipient ? gift.recipient.toLowerCase() : '';
        if (recipient.includes('hanička') || recipient.includes('hanicka')) {
            gifts.hanicka.push(gift);
        } else if (recipient.includes('oliver')) {
            gifts.oliver.push(gift);
        } else {
            gifts.other.push(gift);
        }
    });

    // Vykreslíme dárky a zobrazíme sekce, jen pokud nejsou prázdné
    if (gifts.hanicka.length > 0) {
        gifts.hanicka.forEach(gift => renderGift(gift, giftsHanickaContainer));
        giftsHanickaSection.classList.remove('hidden');
    } else {
        giftsHanickaSection.classList.add('hidden');
    }
    
    if (gifts.oliver.length > 0) {
        gifts.oliver.forEach(gift => renderGift(gift, giftsOliverContainer));
        giftsOliverSection.classList.remove('hidden');
    } else {
        giftsOliverSection.classList.add('hidden');
    }
    
    if (gifts.other.length > 0) {
        gifts.other.forEach(gift => renderGift(gift, giftsOtherContainer));
        giftsOtherSection.classList.remove('hidden');
    } else {
        giftsOtherSection.classList.add('hidden');
    }
}


function renderGift(gift, container) {
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
            } else {
                // NOVÉ: Tlačítko pro opuštění skupiny
                statusHTML += `<button data-id="${gift.id}" class="leave-group-btn px-3 py-1 bg-slate-500 text-white text-sm rounded-md hover:bg-slate-600">Odejít ze skupiny</button>`;
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
                <p class="text-slate-700">${linkify(gift.description)}</p>
                ${gift.link ? `<a href="${gift.link}" target="_blank" rel="noopener noreferrer" class="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-800 text-sm font-semibold rounded-md hover:bg-gray-200">Přejít na web dárku</a>` : ''}
            </div>
            <div class="text-left sm:text-right flex-shrink-0">
                ${statusHTML}
            </div>
        </div>
        ${chatHTML}
    `;
    container.appendChild(card);
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

// Listener pro změnu filtru
occasionFilter.addEventListener('change', () => {
    renderFilteredGifts();
});

// Změníme event listener, aby sledoval celý 'giftsWrapper'
giftsWrapper.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn || !currentUser) return;

    const giftId = btn.dataset.id || btn.closest('[data-id]')?.dataset.id || btn.closest('.chat-message')?.closest('[id^="chat-"]')?.id.replace('chat-', '');
    const giftRef = giftId ? doc(db, 'gifts', giftId) : null;

    // Akce s dárky
    if (btn.matches('.claim-solo-btn')) await updateDoc(giftRef, { status: 'claimed-solo', claimedBySolo: currentUser.uid, contributors: [], coordinator: null });
    if (btn.matches('.create-group-btn')) await updateDoc(giftRef, { status: 'group-open', contributors: arrayUnion(currentUser.uid), coordinator: currentUser.uid });
    if (btn.matches('.join-group-btn')) await updateDoc(giftRef, { contributors: arrayUnion(currentUser.uid) });
    if (btn.matches('.cancel-solo-claim-btn')) await updateDoc(giftRef, { status: 'available', claimedBySolo: null });

    // NOVÉ: Opuštění skupiny
    if (btn.matches('.leave-group-btn')) {
        if (confirm('Opravdu chcete odejít ze skupiny?')) {
            // Musíme zjistit, jestli nejde o posledního člena
            const giftDoc = await getDoc(giftRef);
            const currentContributors = giftDoc.data().contributors || [];
            
            if (currentContributors.length === 1 && currentContributors[0] === currentUser.uid) {
                // Poslední člen odchází, vrátíme dárek do "available"
                await updateDoc(giftRef, {
                    status: 'available',
                    contributors: arrayRemove(currentUser.uid),
                    coordinator: null 
                });
            } else {
                // Ještě někdo zbývá, jen odebereme
                await updateDoc(giftRef, {
                    contributors: arrayRemove(currentUser.uid)
                    // TODO: Pokud odejde koordinátor, mohl by se jmenovat nový
                });
            }
        }
    }

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

giftsWrapper.addEventListener('submit', async (e) => {
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
