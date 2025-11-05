// --- Importy potřebných funkcí z Firebase SDK -----------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app-check.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-storage.js";

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
const storage = getStorage(app);

// --- ===== TATO ČÁST CHYBĚLA (Reference na HTML Elementy) ===== ---
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
const personFilter = document.getElementById('person-filter'); 

// Zprávy
const filterNoResultsMsg = document.getElementById('filter-no-results-msg');
const giftsEmptyDbMsg = document.getElementById('gifts-empty-db-msg');

// Admin Panel
const adminPanel = document.getElementById('admin-panel');
const adminFormTitle = document.getElementById('admin-form-title');
const addGiftForm = document.getElementById('add-gift-form');
const addGiftLoader = document.getElementById('add-gift-loader');
const addGiftSubmitBtn = document.getElementById('add-gift-submit');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const giftIsContributionCheckbox = document.getElementById('gift-is-contribution'); 
const giftImageInput = document.getElementById('gift-image'); 
const giftImagePreview = document.getElementById('gift-image-preview'); 

// Modální okno
const reservationModal = document.getElementById('reservation-modal');
const modalTitle = document.getElementById('modal-title');
const modalGiftName = document.getElementById('modal-gift-name');
const modalOccasion = document.getElementById('modal-occasion');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

// Lightbox
const imageLightbox = document.getElementById('image-lightbox');
const lightboxImage = document.getElementById('lightbox-image');
const lightboxClose = document.getElementById('lightbox-close');
// --- ========================================================== ---


// --- Globální proměnné ----------------------------------------------------
let currentUser = null;
let isAdmin = false;
let allGifts = []; 
let currentModalAction = { id: null, action: null }; 
let currentEditGiftId = null; 

// Mapa pro chytré filtrování
const occasionCategoryMap = {
    'Vánoce': ['vanoce', 'vánoce', 'vianoce'],
    'Narozeniny': ['narozeniny', 'narodeniny'],
    'Svátek': ['svátek', 'svatek', 'meniny']
};
const staticFilterOptions = ['all', ...Object.keys(occasionCategoryMap), 'Ostatní'];


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
        adminPanel.classList.add('hidden'); 
        resetAdminForm(); 
        
        giftsHanickaContainer.innerHTML = '';
        giftsOliverContainer.innerHTML = '';
        giftsOtherContainer.innerHTML = '';
        giftsHanickaSection.classList.add('hidden');
        giftsOliverSection.classList.add('hidden');
        giftsOtherSection.classList.add('hidden');
        
        filterNoResultsMsg.classList.add('hidden');
        giftsEmptyDbMsg.classList.add('hidden');
    }
});

// --- Logika Aplikace ----------------------------------------------------

/**
 * Funkce pro reset admin formuláře
 */
function resetAdminForm() {
    addGiftForm.reset();
    adminFormTitle.textContent = 'Panel administrátora';
    addGiftSubmitBtn.textContent = 'Přidat dárek';
    cancelEditBtn.classList.add('hidden');
    giftIsContributionCheckbox.checked = false; 
    currentEditGiftId = null;
    
    giftImageInput.value = null;
    giftImagePreview.classList.add('hidden');
    giftImagePreview.src = '';
}

/**
 * Funkce pro převod textu s URL na klikatelné odkazy
 */
function linkify(text) {
    if (!text) return '';
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
    return text.replace(urlRegex, function(url) {
        let displayUrl = url;
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
    
    giftsHanickaContainer.innerHTML = '';
    giftsOliverContainer.innerHTML = '';
    giftsOtherContainer.innerHTML = '';
    giftsHanickaSection.classList.add('hidden');
    giftsOliverSection.classList.add('hidden');
    giftsOtherSection.classList.add('hidden');
    filterNoResultsMsg.classList.add('hidden');
    giftsEmptyDbMsg.classList.add('hidden');
    adminPanel.classList.add('hidden');
    resetAdminForm();
    
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
                adminPanel.classList.remove('hidden');
            }
            listenForGifts();
        } else {
            pendingApprovalMsg.classList.remove('hidden');
            loader.classList.add('hidden');
        }
    }
}

function listenForGifts() {
    const giftsQuery = query(collection(db, 'gifts'), orderBy('recipient'), orderBy('name'));
    
    onSnapshot(giftsQuery, snapshot => {
        loader.classList.add('hidden');
        
        allGifts = [];
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
        filterContainer.classList.add('flex');
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
 * Funkce pro statický filtr
 */
function populateOccasionFilter() {
    const currentSelectedValue = occasionFilter.value;
    
    Array.from(occasionFilter.options).forEach(option => {
        if (!staticFilterOptions.includes(option.value)) {
            option.remove();
        }
    });
    
    if (Array.from(occasionFilter.options).some(o => o.value === currentSelectedValue)) {
        occasionFilter.value = currentSelectedValue;
    } else {
        occasionFilter.value = 'all';
    }
}


/**
 * Funkce pro chytré filtrování (oběma filtry)
 */
function renderFilteredGifts() {
    giftsHanickaContainer.innerHTML = '';
    giftsOliverContainer.innerHTML = '';
    giftsOtherContainer.innerHTML = '';

    const selectedOccasion = occasionFilter.value;
    const selectedPerson = personFilter.value; 
    
    const filteredGifts = allGifts.filter(gift => {
        // --- Shoda osoby (jednoduchá logika) ---
        const personMatch = (selectedPerson === 'all') || (gift.recipient === selectedPerson);
        if (!personMatch) return false;

        // --- Shoda příležitosti (chytrá logika) ---
        if (selectedOccasion === 'all') return true;

        if (!gift.occasion || gift.occasion.trim() === '') {
            return selectedOccasion === 'Ostatní';
        }

        const giftOccasionLower = gift.occasion.toLowerCase();

        if (selectedOccasion === 'Ostatní') {
            let isMainCategory = false;
            for (const categoryKey in occasionCategoryMap) {
                const mutations = occasionCategoryMap[categoryKey];
                if (mutations.some(prefix => giftOccasionLower.startsWith(prefix))) {
                    isMainCategory = true;
                    break;
                }
            }
            return !isMainCategory;
        }

        const mutations = occasionCategoryMap[selectedOccasion];
        if (mutations) {
            return mutations.some(prefix => giftOccasionLower.startsWith(prefix));
        }

        return false;
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

    gifts.hanicka.length > 0 ? (gifts.hanicka.forEach(gift => renderGift(gift, giftsHanickaContainer)), giftsHanickaSection.classList.remove('hidden')) : giftsHanickaSection.classList.add('hidden');
    gifts.oliver.length > 0 ? (gifts.oliver.forEach(gift => renderGift(gift, giftsOliverContainer)), giftsOliverSection.classList.remove('hidden')) : giftsOliverSection.classList.add('hidden');
    gifts.other.length > 0 ? (gifts.other.forEach(gift => renderGift(gift, giftsOtherContainer)), giftsOtherSection.classList.remove('hidden')) : giftsOtherSection.classList.add('hidden');
}


/**
 * Funkce pro vykreslení jedné karty dárku
 */
function renderGift(gift, container) {
    const isContributor = gift.contributors && gift.contributors.includes(currentUser.uid);
    const isSoloClaimer = gift.claimedBySolo === currentUser.uid;
    const isContributionGift = gift.giftType === 'contribution'; 

    const card = document.createElement('div');
    card.className = "bg-white p-5 rounded-lg border border-slate-200 shadow-sm";
    
    let statusHTML = '';
    let editOccasionBtn = '';
    let adminControls = '';

    if (isSoloClaimer || isContributor) {
        editOccasionBtn = `<button data-id="${gift.id}" data-action="edit-occasion" class="edit-occasion-btn ml-2 text-xs text-slate-500 hover:text-indigo-600" title="Upravit příležitost">✏️</button>`;
    }
    
    if (isAdmin) {
        let adminResetBtn = '';
        if (!isContributionGift && gift.status !== 'available') {
             adminResetBtn = `<button data-id="${gift.id}" class="admin-reset-btn w-full px-3 py-1 bg-orange-600 text-white text-xs font-semibold rounded-md hover:bg-orange-700">Resetovat rezervaci</button>`;
        }
         adminControls = `
            <div class="mt-3 pt-3 border-t border-slate-200 space-y-2">
                <button data-id="${gift.id}" class="admin-edit-btn w-full px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700">Upravit detaily</button>
                ${adminResetBtn}
                <button data-id="${gift.id}" class="admin-delete-btn w-full px-3 py-1 bg-red-700 text-white text-xs font-semibold rounded-md hover:bg-red-800">Smazat dárek</button>
            </div>
         `;
    }

    if (isContributionGift) {
        // --- Finanční příspěvek ---
        statusHTML = `<p class="text-sm text-blue-600 font-semibold mb-3">Finanční příspěvek (${gift.contributors?.length || 0})</p>`;
        if (!isContributor) {
            statusHTML += `<button data-id="${gift.id}" class="join-group-btn px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 w-full">Chci přispět</button>`;
        } else {
            statusHTML += `<button data-id="${gift.id}" class="leave-group-btn px-3 py-1 bg-slate-500 text-white text-sm rounded-md hover:bg-slate-600 w-full">Už nechci přispět</button>`;
        }
    } else {
        // --- Běžné dárky ---
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
                    statusHTML = `<p class="text-sm text-slate-500 font-semibold mb-3">Zarezervováno vámi</p>
                        <button data-id="${gift.id}" class="cancel-solo-claim-btn px-3 py-1 bg-red-500 text-white text-sm rounded-md hover:bg-red-600">Zrušit rezervaci</button>`;
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
                    statusHTML += `<button data-id="${gift.id}" class="reopen-group-btn px-3 py-1 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 w-full mt-2">Znovu otevřít diskuzi</button>`;
                }
                break;
        }
    }
    
    statusHTML += adminControls; 

    let chatHTML = '';
    if (isContributor && (isContributionGift || gift.status === 'group-open' || gift.status === 'claimed-group')) {
        const showChatForm = (isContributionGift || gift.status === 'group-open');
        
        chatHTML = `
            <div class="mt-4 pt-4 border-t border-slate-200">
                <h4 class="font-semibold text-sm mb-2">Domluva (${isContributionGift ? 'příspěvek' : 'skupina'}):</h4>
                <div id="chat-${gift.id}" class="space-y-2 text-sm max-h-40 overflow-y-auto pr-2"></div>
                ${showChatForm ? `
                <form class="chat-form flex gap-2 mt-3">
                    <input type="text" placeholder="Napsat zprávu..." class="flex-grow border border-slate-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500" required>
                    <button type="submit" data-id="${gift.id}" class="px-3 py-1 bg-indigo-500 text-white text-sm rounded-md hover:bg-indigo-600">Odeslat</button>
                </form>` : '<p class="text-sm text-slate-500 italic mt-2">Skupina je uzavřená, chat je pouze ke čtení.</p>'}
            </div>
        `;
        listenForChatMessages(gift.id);
    }
    
    const linkHTML = (gift.link && !isContributionGift) ? `<a href="${gift.link}" target="_blank" rel="noopener noreferrer" class="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-800 text-sm font-semibold rounded-md hover:bg-gray-200">Odkaz na dárek</a>` : '';

    const imageHTML = gift.imageUrl ? `
        <div class="mt-4">
            <img src="${gift.imageUrl}" alt="${gift.name}" class="gift-image-clickable rounded-lg shadow-md w-full h-auto max-h-72 object-cover cursor-pointer transition-transform duration-200 hover:scale-105">
        </div>
    ` : '';

    card.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="flex-grow">
                ${imageHTML}
                <h3 class="text-lg font-bold ${imageHTML ? 'mt-3' : ''}">${gift.name}</h3>
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
 * Naslouchá zprávám v chatu
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
            msgEl.dataset.msgId = doc.id;

            const isMyMessage = msg.uid === currentUser.uid;
            const sender = isMyMessage ? 'Vy' : msg.user;
            const fontWeight = isMyMessage ? 'font-bold' : 'font-semibold';

            let actionsHTML = '';
            const gift = allGifts.find(g => g.id === giftId);
            
            if (isMyMessage && gift && (gift.status === 'group-open' || gift.giftType === 'contribution')) {
                actionsHTML = `
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button class="edit-comment-btn text-xs text-slate-500 hover:text-indigo-600" title="Upravit">✏️</button>
                        <button class="delete-comment-btn text-xs text-slate-500 hover:text-red-600" title="Smazat">🗑️</button>
                    </div>
                `;
            }

            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            const pEl = document.createElement('p');
            const strongEl = document.createElement('strong');
            strongEl.className = fontWeight;
            strongEl.textContent = sender + ':';
            const spanEl = document.createElement('span');
            spanEl.className = 'message-text';
            spanEl.textContent = ' ' + msg.message;

            pEl.appendChild(strongEl);
            pEl.appendChild(spanEl);
            contentEl.appendChild(pEl);
            msgEl.appendChild(contentEl);
            msgEl.insertAdjacentHTML('beforeend', actionsHTML);
            chatContainer.appendChild(msgEl);
        });
        
        if (chatContainer.scrollHeight > chatContainer.clientHeight) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    });
}


// --- Funkce pro modální okno ---
function openReservationModal(giftId, action) {
    const gift = allGifts.find(g => g.id === giftId);
    if (!gift) return;

    currentModalAction = { id: giftId, action: action };
    modalTitle.textContent = action === 'edit-occasion' ? "Upravit příležitost" : "Rezervovat dárek";
    modalGiftName.textContent = gift.name;
    modalOccasion.value = gift.occasion;
    reservationModal.classList.remove('hidden');
    modalOccasion.focus();
}

modalCancelBtn.addEventListener('click', () => reservationModal.classList.add('hidden'));
reservationModal.addEventListener('click', (e) => {
    if (e.target === reservationModal) {
        reservationModal.classList.add('hidden');
    }
});

modalConfirmBtn.addEventListener('click', async () => {
    const { id, action } = currentModalAction;
    if (!id || !action) return;

    const rawOccasion = modalOccasion.value.trim();
    if (!rawOccasion) {
        alert("Příležitost nesmí být prázdná.");
        return;
    }
    const newOccasion = rawOccasion.charAt(0).toUpperCase() + rawOccasion.slice(1);
    
    const giftRef = doc(db, 'gifts', id);
    let updateData = { occasion: newOccasion };

    try {
        if (action === 'claim-solo') {
            updateData = { ...updateData, status: 'claimed-solo', claimedBySolo: currentUser.uid, contributors: [], coordinator: null };
        } else if (action === 'create-group') {
             updateData = { ...updateData, status: 'group-open', contributors: arrayUnion(currentUser.uid), coordinator: currentUser.uid };
        }
        
        await updateDoc(giftRef, updateData);
        reservationModal.classList.add('hidden');
        currentModalAction = { id: null, action: null };
        
    } catch (err) {
        console.error("Chyba při potvrzení modálu:", err);
        alert("Došlo k chybě. Zkuste to znovu.");
    }
});


// --- Listenery pro Lightbox ---
if (imageLightbox) {
    lightboxClose.addEventListener('click', () => {
        imageLightbox.classList.add('hidden');
        lightboxImage.src = ''; 
    });
    
    imageLightbox.addEventListener('click', (e) => {
        if (e.target === imageLightbox) { 
            imageLightbox.classList.add('hidden');
            lightboxImage.src = '';
        }
    });
}


// --- Event Listeners pro akce ---

occasionFilter.addEventListener('change', () => renderFilteredGifts());
personFilter.addEventListener('change', () => renderFilteredGifts());

if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => resetAdminForm());
}

if (giftImageInput) {
    giftImageInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                giftImagePreview.src = event.target.result;
                giftImagePreview.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else {
            giftImagePreview.classList.add('hidden');
            giftImagePreview.src = '';
        }
    });
}


/**
 * Listener pro Admin formulář (Přidání/Úprava)
 */
if (addGiftForm) {
    addGiftForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        addGiftLoader.classList.remove('hidden');
        addGiftSubmitBtn.disabled = true;
        cancelEditBtn.disabled = true;

        const rawOccasion = document.getElementById('gift-occasion').value.trim();
        const normalizedOccasion = rawOccasion.charAt(0).toUpperCase() + rawOccasion.slice(1);
        const isContribution = giftIsContributionCheckbox.checked; 
        const file = giftImageInput.files[0];

        let giftData = {
            name: document.getElementById('gift-name').value,
            recipient: document.getElementById('gift-recipient').value,
            occasion: normalizedOccasion || 'Neurčeno',
            description: document.getElementById('gift-description').value || '',
            link: document.getElementById('gift-link').value || '',
            giftType: isContribution ? 'contribution' : 'item'
        };

        try {
            if (currentEditGiftId) {
                // --- Režim ÚPRAVY ---
                const giftRef = doc(db, 'gifts', currentEditGiftId);
                const originalGift = allGifts.find(g => g.id === currentEditGiftId);

                if (file) {
                    const imagePath = `gifts/${currentEditGiftId}/${file.name}`;
                    const storageRef = ref(storage, imagePath);
                    const metadata = { contentType: file.type }; 
                    await uploadBytes(storageRef, file, metadata); 
                    giftData.imageUrl = await getDownloadURL(storageRef);
                    giftData.imagePath = imagePath; 

                    if (originalGift.imagePath && originalGift.imagePath !== imagePath) {
                        try {
                            await deleteObject(ref(storage, originalGift.imagePath));
                        } catch (delErr) { console.warn("Nepodařilo se smazat starý obrázek:", delErr); }
                    }
                } else {
                    giftData.imageUrl = originalGift.imageUrl || null;
                    giftData.imagePath = originalGift.imagePath || null;
                }
                
                await updateDoc(giftRef, giftData);
                console.log("Dárek upraven:", currentEditGiftId);

            } else {
                // --- Režim PŘIDÁNÍ ---
                const newGiftRef = doc(collection(db, 'gifts'));
                const giftId = newGiftRef.id;
                let imageUrl = null;
                let imagePath = null;

                if (file) {
                    imagePath = `gifts/${giftId}/${file.name}`;
                    const storageRef = ref(storage, imagePath);
                    const metadata = { contentType: file.type }; 
                    await uploadBytes(storageRef, file, metadata); 
                    imageUrl = await getDownloadURL(storageRef);
                }

                const newGiftData = {
                    ...giftData,
                    imageUrl: imageUrl,
                    imagePath: imagePath,
                    status: 'available', 
                    claimedBySolo: null,
                    contributors: [],
                    coordinator: null
                };
                
                await setDoc(newGiftRef, newGiftData);
                console.log("Nový dárek přidán.");
            }
            resetAdminForm(); 
        } catch (err) {
            console.error("Chyba při ukládání dárku:", err);
            alert("Došlo k chybě při ukládání dárku.");
        } finally {
            addGiftLoader.classList.add('hidden');
            addGiftSubmitBtn.disabled = false;
            cancelEditBtn.disabled = false;
        }
    });
}

/**
 * Hlavní listener pro akce na kartách
 */
if (giftsWrapper) {
    giftsWrapper.addEventListener('click', async (e) => {
        if (!currentUser) return;

        // 1. Zjistíme, na co se kliklo
        const clickedImage = e.target.closest('.gift-image-clickable');
        const clickedButton = e.target.closest('button');

        // 2. Akce: Kliknutí na obrázek (Lightbox)
        if (clickedImage) {
            e.preventDefault(); 
            lightboxImage.src = clickedImage.src; 
            imageLightbox.classList.remove('hidden');
            return; 
        }

        // 3. Pokud se nekliklo na tlačítko, končíme
        if (!clickedButton) return;

        // 4. Akce: Kliknutí na tlačítko v komentáři
        const msgEl = clickedButton.closest('.chat-message');
        if (msgEl) {
            const msgId = msgEl.dataset.msgId;
            const chatGiftId = msgEl.closest('[id^="chat-"]').id.replace('chat-', '');
            if (!msgId || !chatGiftId) return;

            const msgRef = doc(db, 'gifts', chatGiftId, 'chat', msgId);

            try {
                if (clickedButton.matches('.delete-comment-btn') && confirm('Opravdu smazat komentář?')) {
                    await deleteDoc(msgRef);
                }
                
                if (clickedButton.matches('.edit-comment-btn')) {
                    const contentEl = msgEl.querySelector('.message-content');
                    const originalText = contentEl.querySelector('.message-text').textContent.trim();
                    contentEl.style.display = 'none';
                    clickedButton.parentElement.style.display = 'none';

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

                if (clickedButton.matches('.cancel-edit-btn')) {
                    msgEl.querySelector('.edit-comment-form').remove();
                    msgEl.querySelector('.message-content').style.display = 'block';
                    msgEl.querySelector('.flex-shrink-0').style.display = 'flex';
                }
            } catch (err) {
                 console.error("Chyba při akci s komentářem:", err);
            }
            return; 
        }

        // 5. Akce: Kliknutí na tlačítko u dárku (má data-id)
        const giftId = clickedButton.dataset.id;
        if (!giftId) return; 

        const giftRef = doc(db, 'gifts', giftId);

        // 5a. Akce otevírající modal
        const modalAction = clickedButton.dataset.action;
        if (modalAction) {
            openReservationModal(giftId, modalAction);
            return;
        }
        
        // 5b. Přímé akce (bez modálu)
        try {
            // Přidat se ke skupině (nebo "Chci přispět")
            if (clickedButton.matches('.join-group-btn')) {
                await updateDoc(giftRef, { contributors: arrayUnion(currentUser.uid) });
            }
            
            // Zrušit sólo rezervaci
            if (clickedButton.matches('.cancel-solo-claim-btn')) {
                await updateDoc(giftRef, { status: 'available', claimedBySolo: null });
            }
            
            // Odejít ze skupiny (nebo "Už nechci přispět")
            if (clickedButton.matches('.leave-group-btn')) {
                if (confirm('Opravdu chcete odejít ze skupiny / zrušit příspěvek?')) {
                    const giftDoc = await getDoc(giftRef);
                    const giftData = giftDoc.data();
                    const currentContributors = giftData.contributors || [];
                    
                    if (giftData.giftType === 'contribution') {
                         await updateDoc(giftRef, { contributors: arrayRemove(currentUser.uid) });
                    } 
                    else if (currentContributors.length === 1 && currentContributors[0] === currentUser.uid) {
                        await updateDoc(giftRef, { status: 'available', contributors: arrayRemove(currentUser.uid), coordinator: null });
                    } else {
                        await updateDoc(giftRef, { contributors: arrayRemove(currentUser.uid) });
                    }
                }
            }
            
            // Uzavřít skupinu
            if (clickedButton.matches('.finalize-group-btn')) {
                if (confirm('Opravdu chcete skupinu označit za domluvenou? Chat bude poté uzamčen.')) {
                    await updateDoc(giftRef, { status: 'claimed-group' });
                }
            }

            // Znovu otevřít diskuzi
            if (clickedButton.matches('.reopen-group-btn')) {
                if (confirm('Chcete znovu otevřít diskuzi? Chat bude odemčen.')) {
                    await updateDoc(giftRef, { status: 'group-open' });
                }
            }
            
            // --- Admin akce ---
            if (isAdmin) {
                // Admin reset
                if (clickedButton.matches('.admin-reset-btn')) {
                    if (confirm('ADMIN: Opravdu chcete tuto rezervaci zrušit a vrátit dárek na "Dostupné"?')) {
                        await updateDoc(giftRef, { status: 'available', claimedBySolo: null, contributors: [], coordinator: null });
                    }
                }
                
                // Admin smazání
                if (clickedButton.matches('.admin-delete-btn')) {
                    if (confirm('ADMIN: Opravdu chcete tento dárek TRVALE SMAZAT? Tato akce je nevratná a smaže i obrázek a chat.')) {
                        const gift = allGifts.find(g => g.id === giftId);
                        
                        if (gift && gift.imagePath) {
                            try {
                                await deleteObject(ref(storage, gift.imagePath));
                                console.log("Obrázek smazán ze Storage.");
                            } catch (imgErr) {
                                console.warn("Nepodařilo se smazat obrázek:", imgErr);
                            }
                        }
                        
                        await deleteDoc(giftRef);
                        console.log("Dárek smazán:", giftId);
                    }
                }
                
                // Admin úprava
                if (clickedButton.matches('.admin-edit-btn')) {
                    const gift = allGifts.find(g => g.id === giftId);
                    if (gift) {
                        document.getElementById('gift-name').value = gift.name || '';
                        document.getElementById('gift-recipient').value = gift.recipient || 'Ostatní';
                        document.getElementById('gift-occasion').value = gift.occasion || '';
                        document.getElementById('gift-description').value = gift.description || '';
                        document.getElementById('gift-link').value = gift.link || '';
                        giftIsContributionCheckbox.checked = (gift.giftType === 'contribution');
                        
                        giftImageInput.value = null; 
                        if (gift.imageUrl) {
                            giftImagePreview.src = gift.imageUrl;
                            giftImagePreview.classList.remove('hidden');
                        } else {
                            giftImagePreview.classList.add('hidden');
                            giftImagePreview.src = '';
                        }
                        
                        adminFormTitle.textContent = `Právě upravujete: ${gift.name}`;
                        addGiftSubmitBtn.textContent = 'Uložit změny';
                        cancelEditBtn.classList.remove('hidden');
                        currentEditGiftId = giftId;
                        
                        adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }
            // --- KONEC Admin akcí ---

        } catch (err) {
            console.error("Chyba při akci s dárkem:", err);
            alert("Došlo k chybě.");
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
            }
        }
    });
} else {
    console.error("Kritická chyba: Element 'gifts-wrapper' nebyl nalezen. Ujistěte se, že používáte správný index.html.");
}
