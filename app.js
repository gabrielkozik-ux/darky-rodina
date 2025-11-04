// --- Importy potřebných funkcí z Firebase SDK -----------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
// *** Import PRO APP CHECK ***
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app-check.js";
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

// --- Inicializace App Check ---------------------------------------
// POZOR: Vlož sem svůj reCAPTCHA Site Key, který jsi získal
try {
    const appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider('6LfDTQIsAAAAANXqps6CUrdaWyDH2_u72xvur-V8'), // <-- VLOŽ KLÍČ SEM
      isTokenAutoRefreshEnabled: true
    });
    console.log("Firebase App Check inicializován.");
} catch (error) {
    console.error("Chyba při inicializaci Firebase App Check:", error);
}
// --- KONEC App Check ----------------------------------------------------

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

// Kontejnery dárků
const giftsWrapper = document.getElementById('gifts-wrapper');
const giftsHanickaSection = document.getElementById('gifts-hanicka-section');
const giftsHanickaContainer = document.getElementById('gifts-hanicka-container');
const giftsOliverSection = document.getElementById('gifts-oliver-section');
const giftsOliverContainer = document.getElementById('gifts-oliver-container');
const giftsOtherSection = document.getElementById('gifts-other-section');
const giftsOtherContainer = document.getElementById('gifts-other-container');

// Filtr
const filterContainer = document.getElementById('filter-container');
const occasionFilter = document.getElementById('occasion-filter');

// Zprávy
const filterNoResultsMsg = document.getElementById('filter-no-results-msg');
const giftsEmptyDbMsg = document.getElementById('gifts-empty-db-msg');

// *** NOVÉ: Admin Panel ***
const adminPanel = document.getElementById('admin-panel');
const addGiftForm = document.getElementById('add-gift-form');
const addGiftLoader = document.getElementById('add-gift-loader');
const addGiftSubmitBtn = document.getElementById('add-gift-submit');

// *** NOVÉ: Modální okno ***
const reservationModal = document.getElementById('reservation-modal');
const modalTitle = document.getElementById('modal-title');
const modalGiftName = document.getElementById('modal-gift-name');
const modalOccasion = document.getElementById('modal-occasion');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');


// --- Globální proměnné ----------------------------------------------------
let currentUser = null;
let isAdmin = false;
let allGifts = []; // Budeme zde držet všechny dárky pro filtrování
let currentModalAction = { id: null, action: null }; // Pro ukládání stavu modálu


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
        adminPanel.classList.add('hidden'); // Skrýt admin panel při odhlášení
        
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
    // Nahradíme pouze text, který je URL
    return text.replace(urlRegex, function(url) {
        let displayUrl = url;
        // Zkusíme odstranit protokol pro zkrácení
        try {
            const urlObj = new URL(url);
            displayUrl = urlObj.hostname.replace('www.', '') + (urlObj.pathname.length > 1 ? urlObj.pathname : '');
        } catch (e) { /* Zůstane původní url */ }
        
        if (displayUrl.length > 50) {
            displayUrl = displayUrl.substring(0, 47) + '...';
        }
        
        return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-indigo-600 hover:underline">${displayUrl}</a>`;
    });
}


async function checkUserRoleAndLoadGifts(user) {
    loader.classList.remove('hidden');
    loader.classList.add('flex');
    
    // Reset UI
    giftsHanickaContainer.innerHTML = '';
    giftsOliverContainer.innerHTML = '';
    giftsOtherContainer.innerHTML = '';
    giftsHanickaSection.classList.add('hidden');
    giftsOliverSection.classList.add('hidden');
    giftsOtherSection.classList.add('hidden');
    filterNoResultsMsg.classList.add('hidden');
    giftsEmptyDbMsg.classList.add('hidden');
    adminPanel.classList.add('hidden');
    
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
            if (isAdmin) {
                adminPanel.classList.remove('hidden'); // Zobrazit admin panel
            }
            listenForGifts(); // Začneme naslouchat dárkům
        } else {
            pendingApprovalMsg.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
}

function listenForGifts() {
    // Ujisti se, že máš vytvořený index ve Firebase! (pro orderBy recipient a name)
    const giftsQuery = query(collection(db, 'gifts'), orderBy('recipient'), orderBy('name'));
    
    onSnapshot(giftsQuery, snapshot => {
        loader.classList.add('hidden');
        
        allGifts = []; // Naplníme globální pole
        snapshot.forEach(doc => {
            allGifts.push({ id: doc.id, ...doc.data() });
        });
        
        if (allGifts.length === 0) {
            giftsEmptyDbMsg.classList.remove('hidden');
            filterNoResultsMsg.classList.add('hidden');
            giftsHanickaSection.classList.add('hidden');
            giftsOliverSection.classList.add('hidden');
            giftsOtherSection.classList.add('hidden');
            filterContainer.classList.add('hidden');
            return;
        }

        giftsEmptyDbMsg.classList.add('hidden');
        filterContainer.classList.remove('hidden');
        populateOccasionFilter();
        renderFilteredGifts();

    }, error => {
        console.error("Chyba při načítání dárků:", error);
        loader.classList.add('hidden');
        if (giftsWrapper) {
            giftsWrapper.innerHTML = `<p class="text-center text-red-600 font-semibold p-4">Došlo k chybě při načítání databáze. Pravděpodobně chybí index (viz F12 konzole).</p>`;
        }
    });
}

/**
 * Naplní filtr unikátními příležitostmi z dárků, aniž by rozbila stav.
 */
function populateOccasionFilter() {
    const defaultOptions = ['all', 'Narozeniny', 'Vánoce', 'Svátek'];
    const currentSelectedValue = occasionFilter.value;
    const occasionsFromDb = new Set(allGifts.map(g => g.occasion).filter(Boolean));
    const currentDynamicOptions = new Set(
        Array.from(occasionFilter.options)
             .map(o => o.value)
             .filter(o => !defaultOptions.includes(o))
    );

    currentDynamicOptions.forEach(optionValue => {
        if (!occasionsFromDb.has(optionValue)) {
            const optionEl = occasionFilter.querySelector(`option[value="${optionValue}"]`);
            if (optionEl) optionEl.remove();
        }
    });

    occasionsFromDb.forEach(occasionValue => {
        if (!currentDynamicOptions.has(occasionValue) && !defaultOptions.includes(occasionValue)) {
            const option = document.createElement('option');
            option.value = occasionValue;
            option.textContent = occasionValue;
            occasionFilter.appendChild(option);
        }
    });
    
    if (Array.from(occasionFilter.options).some(o => o.value === currentSelectedValue)) {
        occasionFilter.value = currentSelectedValue;
    } else {
        occasionFilter.value = 'all';
    }
}

/**
 * Vykreslí dárky na základě aktuálně zvoleného filtru a rozdělí je
 */
function renderFilteredGifts() {
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
         filterNoResultsMsg.classList.remove('hidden');
         return;
    }
    
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
    let editOccasionBtn = '';
    let adminResetBtn = '';

    // Tlačítko pro úpravu příležitosti (pro toho, kdo rezervoval)
    if (isSoloClaimer || (isContributor && (gift.status === 'group-open' || gift.status === 'claimed-group'))) {
        editOccasionBtn = `<button data-id="${gift.id}" data-action="edit-occasion" class="edit-occasion-btn ml-2 text-xs text-slate-500 hover:text-indigo-600" title="Upravit příležitost">✏️</button>`;
    }
    
    // Tlačítko pro reset (pouze pro admina a pokud dárek není volný)
    if (isAdmin && gift.status !== 'available') {
         adminResetBtn = `<button data-id="${gift.id}" class="admin-reset-btn mt-2 px-3 py-1 bg-red-600 text-white text-xs font-semibold rounded-md hover:bg-red-700 w-full text-center">Resetovat (Admin)</button>`;
    }

    switch(gift.status) {
        case 'available':
            statusHTML = `
                <p class="text-sm text-green-600 font-semibold mb-3">Dostupné</p>
                <div class="flex flex-col sm:flex-row gap-2">
                    <button data-id="${gift.id}" data-action="claim-solo" class="claim-solo-btn px-3 py-1 bg-indigo-500 text-white text-sm rounded-md hover:bg-indigo-600">Koupím sám/a</button>
                    <button data-id="${gift.id}" data-action="create-group" class="create-group-btn px-3 py-1 bg-slate-500 text-white text-sm rounded-md hover:bg-slate-600">Chci se složit</button>
                </div>`;
            break;
        case 'group-open':
            statusHTML = `<p class="text-sm text-blue-600 font-semibold mb-3">Skládá se skupina (${gift.contributors?.length || 0})</p>`;
            if (!isContributor) {
                statusHTML += `<button data-id="${gift.id}" class="join-group-btn px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600">Přidat se</button>`;
            } else {
                statusHTML += `
                    <div class="space-y-2">
                        <button data-id="${gift.id}" class="leave-group-btn px-3 py-1 bg-slate-500 text-white text-sm rounded-md hover:bg-slate-600 w-full">Odejít ze skupiny</button>
                        <button data-id="${gift.id}" class="finalize-group-btn px-3 py-1 bg-green-500 text-white text-sm rounded-md hover:bg-green-600 w-full">Uzavřít (domluveno)</button>
                    </div>`;
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
             statusHTML = `<p class="text-sm text-green-700 font-semibold mb-3">Zajištěno skupinou (${gift.contributors?.length || 0})</p>`;
             if (isContributor) {
                 statusHTML += `<p class="text-xs text-slate-500 mb-2">(jste členem)</p>`;
             }
            break;
    }
    
    // Přidáme admin resetovací tlačítko, pokud je definováno
    statusHTML += adminResetBtn;

    let chatHTML = '';
    if (isContributor && (gift.status === 'group-open' || gift.status === 'claimed-group')) {
        chatHTML = `
            <div class="mt-4 pt-4 border-t border-slate-200">
                <h4 class="font-semibold text-sm mb-2">Domluva ve skupině:</h4>
                <div id="chat-${gift.id}" class="space-y-2 text-sm max-h-40 overflow-y-auto pr-2"></div>
                ${gift.status === 'group-open' ? `
                <form class="chat-form flex gap-2 mt-3">
                    <input type="text" placeholder="Napsat zprávu..." class="flex-grow border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" required>
                    <button type="submit" data-id="${gift.id}" class="px-3 py-1 bg-indigo-500 text-white text-sm rounded-md hover:bg-indigo-600">Odeslat</button>
                </form>` : '<p class="text-sm text-slate-500 italic mt-2">Skupina je uzavřená, chat je pouze ke čtení.</p>'}
            </div>
        `;
        listenForChatMessages(gift.id);
    }
    
    // NOVĚ: Odkaz na dárek
    const linkHTML = gift.link ? `<a href="${gift.link}" target="_blank" rel="noopener noreferrer" class="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-800 text-sm font-semibold rounded-md hover:bg-gray-200">Odkaz na dárek</a>` : '';

    card.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="flex-grow">
                <h3 class="text-lg font-bold">${gift.name}</h3>
                ${gift.recipient ? `<p class="text-sm font-medium text-slate-600">Pro: ${gift.recipient}</p>` : ''}
                <p class="text-sm text-slate-500 mb-2">Příležitost: ${gift.occasion} ${editOccasionBtn}</p>
                <p class="text-slate-700">${linkify(gift.description)}</p>
                ${linkHTML}
            </div>
            <div class="text-left sm:text-right flex-shrink-0 w-full sm:w-auto sm:min-w-[150px]">
                ${statusHTML}
            </div>
        </div>
        ${chatHTML}
    `;
    container.appendChild(card);
}

/**
 * BEZPEČNÁ VERZE - Opraveno proti XSS
 * Naslouchá zprávám v chatu pro daný dárek.
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
            msgEl.className = 'chat-message flex items-start justify-between gap-2';
            msgEl.dataset.msgId = doc.id; // Uložíme ID zprávy pro pozdější použití

            const isMyMessage = msg.uid === currentUser.uid;
            const sender = isMyMessage ? 'Vy' : msg.user;
            const fontWeight = isMyMessage ? 'font-bold' : 'font-semibold';

            let actionsHTML = '';
            // Tlačítka pro editaci a mazání (tento HTML je bezpečný, je generovaný námi)
            // Zobrazíme je, jen pokud je skupina otevřená
            const gift = allGifts.find(g => g.id === giftId);
            if (isMyMessage && gift && gift.status === 'group-open') {
                actionsHTML = `
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button class="edit-comment-btn text-xs text-slate-500 hover:text-indigo-600" title="Upravit">✏️</button>
                        <button class="delete-comment-btn text-xs text-slate-500 hover:text-red-600" title="Smazat">🗑️</button>
                    </div>
                `;
            }

            // --- BEZPEČNÁ ČÁST (místo msgEl.innerHTML) ---
            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            const pEl = document.createElement('p');
            const strongEl = document.createElement('strong');
            strongEl.className = fontWeight;
            strongEl.textContent = sender + ':'; // BEZPEČNÉ vložení jména
            const spanEl = document.createElement('span');
            spanEl.className = 'message-text';
            spanEl.textContent = ' ' + msg.message; // BEZPEČNÉ vložení zprávy (s mezerou)

            pEl.appendChild(strongEl);
            pEl.appendChild(spanEl);
            contentEl.appendChild(pEl);
            msgEl.appendChild(contentEl);
            msgEl.insertAdjacentHTML('beforeend', actionsHTML);
            // --- KONEC BEZPEČNÉ ČÁSTI ---

            chatContainer.appendChild(msgEl);
        });
        
        if (chatContainer.scrollHeight > chatContainer.clientHeight) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    });
}


// --- NOVÉ: Funkce pro modální okno ---
function openReservationModal(giftId, action) {
    const gift = allGifts.find(g => g.id === giftId);
    if (!gift) return;

    currentModalAction = { id: giftId, action: action };
    
    if (action === 'edit-occasion') {
        modalTitle.textContent = "Upravit příležitost";
    } else {
        modalTitle.textContent = "Rezervovat dárek";
    }
    
    modalGiftName.textContent = gift.name;
    modalOccasion.value = gift.occasion;
    reservationModal.classList.remove('hidden');
    modalOccasion.focus();
}

// Zavření modálu
modalCancelBtn.addEventListener('click', () => reservationModal.classList.add('hidden'));
reservationModal.addEventListener('click', (e) => {
    // Zavře modal jen pokud se klikne na pozadí (ne na obsah)
    if (e.target === reservationModal) {
        reservationModal.classList.add('hidden');
    }
});

// Potvrzení modálu
modalConfirmBtn.addEventListener('click', async () => {
    const { id, action } = currentModalAction;
    if (!id || !action) return;

    const newOccasion = modalOccasion.value.trim();
    if (!newOccasion) {
        alert("Příležitost nesmí být prázdná.");
        return;
    }
    
    const giftRef = doc(db, 'gifts', id);
    let updateData = {
        occasion: newOccasion
    };

    try {
        if (action === 'claim-solo') {
            updateData = { 
                ...updateData, 
                status: 'claimed-solo', 
                claimedBySolo: currentUser.uid, 
                contributors: [], 
                coordinator: null 
            };
        } else if (action === 'create-group') {
             updateData = { 
                ...updateData, 
                status: 'group-open',
                contributors: arrayUnion(currentUser.uid),
                coordinator: currentUser.uid
            };
        }
        // Pro 'edit-occasion' stačí jen `updateData = { occasion: newOccasion }`
        
        await updateDoc(giftRef, updateData);
        reservationModal.classList.add('hidden');
        currentModalAction = { id: null, action: null };
        
    } catch (err) {
        console.error("Chyba při potvrzení modálu:", err);
        alert("Došlo k chybě. Zkuste to znovu.");
    }
});


// --- Event Listeners pro akce ---

// Listener pro změnu filtru
occasionFilter.addEventListener('change', () => {
    renderFilteredGifts();
});

// --- NOVÉ: Listener pro Admin formulář ---
if (addGiftForm) {
    addGiftForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        addGiftLoader.classList.remove('hidden');
        addGiftSubmitBtn.disabled = true;

        const formData = new FormData(addGiftForm);
        const newGift = {
            name: formData.get('gift-name'),
            recipient: formData.get('gift-recipient'),
            occasion: formData.get('gift-occasion'),
            description: formData.get('gift-description') || '',
            link: formData.get('gift-link') || '',
            // Výchozí stav
            status: 'available',
            claimedBySolo: null,
            contributors: [],
            coordinator: null
        };

        try {
            await addDoc(collection(db, 'gifts'), newGift);
            addGiftForm.reset();
        } catch (err) {
            console.error("Chyba při přidávání dárku:", err);
            alert("Došlo k chybě při ukládání dárku.");
        } finally {
            addGiftLoader.classList.add('hidden');
            addGiftSubmitBtn.disabled = false;
        }
    });
}

/**
 * *** AKTUALIZOVANÝ HLAVNÍ LISTENER ***
 */
if (giftsWrapper) {
    giftsWrapper.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn || !currentUser) return;

        // Najdeme ID dárku z data atributu
        const giftId = btn.dataset.id;
        if (!giftId) return; // Není to tlačítko dárku

        const giftRef = doc(db, 'gifts', giftId);

        // 1. Akce otevírající modal
        const modalAction = btn.dataset.action;
        if (modalAction) {
            openReservationModal(giftId, modalAction);
            return;
        }
        
        // 2. Přímé akce (bez modálu)
        try {
            // Přidat se ke skupině
            if (btn.matches('.join-group-btn')) {
                await updateDoc(giftRef, { contributors: arrayUnion(currentUser.uid) });
            }
            
            // Zrušit sólo rezervaci
            if (btn.matches('.cancel-solo-claim-btn')) {
                await updateDoc(giftRef, { status: 'available', claimedBySolo: null });
            }
            
            // Odejít ze skupiny
            if (btn.matches('.leave-group-btn')) {
                // Používáme confirm, dokud nemáme vlastní modal
                if (confirm('Opravdu chcete odejít ze skupiny?')) {
                    const giftDoc = await getDoc(giftRef);
                    const currentContributors = giftDoc.data().contributors || [];
                    
                    if (currentContributors.length === 1 && currentContributors[0] === currentUser.uid) {
                        // Poslední člen odchází -> vrátit na 'available'
                        await updateDoc(giftRef, { status: 'available', contributors: arrayRemove(currentUser.uid), coordinator: null });
                    } else {
                        // Ještě tam někdo zbyl
                        await updateDoc(giftRef, { contributors: arrayRemove(currentUser.uid) });
                        // TODO: Pokud odejde koordinátor, mohl by se jmenovat nový
                    }
                }
            }
            
            // NOVÉ: Uzavřít skupinu
            if (btn.matches('.finalize-group-btn')) {
                if (confirm('Opravdu chcete skupinu označit za domluvenou? Chat bude poté uzamčen.')) {
                    await updateDoc(giftRef, { status: 'claimed-group' });
                }
            }
            
            // NOVÉ: Admin reset
            if (btn.matches('.admin-reset-btn')) {
                 if (confirm('ADMIN: Opravdu chcete tuto rezervaci zrušit a vrátit dárek na "Dostupné"?')) {
                    await updateDoc(giftRef, { 
                        status: 'available', 
                        claimedBySolo: null, 
                        contributors: [], 
                        coordinator: null 
                    });
                 }
            }

        } catch (err) {
            console.error("Chyba při akci s dárkem:", err);
            alert("Došlo k chybě.");
        }

        // 3. Logika pro AKCE S KOMENTÁŘI (Editace, mazání)
        const msgEl = btn.closest('.chat-message');
        if (msgEl) {
            const msgId = msgEl.dataset.msgId;
            const chatGiftId = msgEl.closest('[id^="chat-"]').id.replace('chat-', '');
            if (!msgId || !chatGiftId) return; // Nemáme ID zprávy nebo dárku

            const msgRef = doc(db, 'gifts', chatGiftId, 'chat', msgId);

            try {
                if (btn.matches('.delete-comment-btn') && confirm('Opravdu smazat komentář?')) {
                    await deleteDoc(msgRef);
                }
                
                // --- BEZPEČNÁ ČÁST PRO EDITACI (zůstává) ---
                if (btn.matches('.edit-comment-btn')) {
                    const contentEl = msgEl.querySelector('.message-content');
                    const originalText = contentEl.querySelector('.message-text').textContent.trim();
                    contentEl.style.display = 'none';
                    btn.parentElement.style.display = 'none';

                    const editForm = document.createElement('form');
                    editForm.className = 'edit-comment-form flex-grow flex gap-2';

                    const inputEl = document.createElement('input');
                    inputEl.type = 'text';
                    inputEl.value = originalText;
                    inputEl.className = 'flex-grow border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500';
                    inputEl.required = true;

                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'submit';
                    saveBtn.className = 'px-2 py-1 bg-green-500 text-white text-xs rounded-md hover:bg-green-600';
                    saveBtn.textContent = 'Uložit';

                    const cancelBtn = document.createElement('button');
                    cancelBtn.type = 'button';
                    cancelBtn.className = 'cancel-edit-btn px-2 py-1 bg-slate-200 text-slate-700 text-xs rounded-md hover:bg-slate-300';
                    cancelBtn.textContent = 'Zrušit';

                    editForm.appendChild(inputEl);
                    editForm.appendChild(saveBtn);
                    editForm.appendChild(cancelBtn);
                    msgEl.appendChild(editForm);
                }
                // --- KONEC BEZPEČNÉ ČÁSTI PRO EDITACI ---

                if (btn.matches('.cancel-edit-btn')) {
                    msgEl.querySelector('.edit-comment-form').remove();
                    msgEl.querySelector('.message-content').style.display = 'block';
                    msgEl.querySelector('.flex-shrink-0').style.display = 'flex';
                }
            } catch (err) {
                 console.error("Chyba při akci s komentářem:", err);
            }
            return; // Po akci s komentářem skončíme
        }
    });

    // Listener pro formuláře (odeslání nového komentáře, uložení editace)
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
                // onSnapshot se postará o překreslení
            }
        }
    });
} else {
    console.error("Kritická chyba: Element 'gifts-wrapper' nebyl nalezen. Ujistěte se, že používáte správný index.html.");
}
