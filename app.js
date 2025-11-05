// --- Importy potřebných funkcí z Firebase SDK -----------------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-app-check.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, arrayUnion, arrayRemove, serverTimestamp, addDoc, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-firestore.js";
// *** NOVÉ IMPORTY PRO STORAGE ***
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.10.0/firebase-storage.js";

// --- Firebase Konfigurace --------------------------------------------------
const firebaseConfig = {
    apiKey: "AIzaSyC5qWRgRWW9q5G8NRmOpCln1Wwb03Z2eXs",
    authDomain: "darky-rodina.firebaseapp.com",
    projectId: "darky-rodina",
    storageBucket: "darky-rodina.firebasestorage.app", // Ujisti se, že toto sedí
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
const storage = getStorage(app); // *** INICIALIZACE STORAGE ***

// --- Reference na HTML Elementy -------------------------------------------
// ... (všechny staré reference zůstávají) ...
const personFilter = document.getElementById('person-filter'); 
const giftIsContributionCheckbox = document.getElementById('gift-is-contribution'); 
const giftImageInput = document.getElementById('gift-image'); // *** NOVÉ ***
const giftImagePreview = document.getElementById('gift-image-preview'); // *** NOVÉ ***

// ... (všechny ostatní reference zůstávají) ...


// --- Globální proměnné ----------------------------------------------------
let currentUser = null;
let isAdmin = false;
let allGifts = []; 
let currentModalAction = { id: null, action: null }; 
let currentEditGiftId = null; 

// ... (mapa occasionCategoryMap a staticFilterOptions zůstávají) ...
const occasionCategoryMap = {
    'Vánoce': ['vanoce', 'vánoce', 'vianoce'],
    'Narozeniny': ['narozeniny', 'narodeniny'],
    'Svátek': ['svátek', 'svatek', 'meniny']
};
const staticFilterOptions = ['all', ...Object.keys(occasionCategoryMap)];

// --- Autentizace ---------------------------------------------------------
// ... (celá sekce onAuthStateChanged zůstává stejná) ...

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
    
    // *** NOVÉ: Skrytí náhledu ***
    giftImageInput.value = null;
    giftImagePreview.classList.add('hidden');
    giftImagePreview.src = '';
}

// ... (funkce linkify, checkUserRoleAndLoadGifts, listenForGifts, populateOccasionFilter, renderFilteredGifts zůstávají stejné) ...

// ...
// Uvnitř renderFilteredGifts, volání renderGift...
// ...

/**
 * *** UPRAVENO: renderGift ***
 * Přidána logika pro zobrazení nahraného obrázku.
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

    // ... (logika pro editOccasionBtn a adminControls zůstává stejná) ...
    
    // --- (logika pro statusHTML, switch(gift.status) atd. zůstává stejná) ---

    // ...
    
    statusHTML += adminControls; 

    let chatHTML = '';
    // ... (logika pro chatHTML zůstává stejná) ...
    
    const linkHTML = (gift.link && !isContributionGift) ? `<a href="${gift.link}" target="_blank" rel="noopener noreferrer" class="inline-block mt-2 px-3 py-1 bg-gray-100 text-gray-800 text-sm font-semibold rounded-md hover:bg-gray-200">Odkaz na dárek</a>` : '';

    // *** NOVÉ: Logika pro zobrazení obrázku ***
    const imageHTML = gift.imageUrl ? `
        <div class="mt-4">
            <img src="${gift.imageUrl}" alt="${gift.name}" class="rounded-lg shadow-md w-full h-auto max-h-72 object-cover">
        </div>
    ` : '';
    // *** KONEC NOVÉ ČÁSTI ***

    card.innerHTML = `
        <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div class="flex-grow">
                ${imageHTML} <!-- Zobrazení obrázku nahoře -->
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

// ... (funkce listenForChatMessages, openReservationModal, a listenery pro modál zůstávají stejné) ...

// --- Event Listeners pro akce ---

occasionFilter.addEventListener('change', () => renderFilteredGifts());
personFilter.addEventListener('change', () => renderFilteredGifts());

if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => resetAdminForm());
}

// *** NOVÉ: Listener pro náhled obrázku v admin formuláři ***
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
 * *** PŘEDĚLANÝ: Listener pro Admin formulář (Přidání/Úprava) ***
 * Zahrnuje logiku pro nahrání obrázku do Storage.
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
        const file = giftImageInput.files[0]; // Nový obrázek

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
                    // Nahrává se nový obrázek
                    const imagePath = `gifts/${currentEditGiftId}/${file.name}`;
                    const storageRef = ref(storage, imagePath);
                    await uploadBytes(storageRef, file);
                    giftData.imageUrl = await getDownloadURL(storageRef);
                    giftData.imagePath = imagePath; // Uložíme cestu pro budoucí smazání

                    // Smazat starý obrázek, pokud existoval
                    if (originalGift.imagePath && originalGift.imagePath !== imagePath) {
                        try {
                            await deleteObject(ref(storage, originalGift.imagePath));
                        } catch (delErr) { console.warn("Nepodařilo se smazat starý obrázek:", delErr); }
                    }
                } else {
                    // Žádný nový obrázek, ponechat starý
                    giftData.imageUrl = originalGift.imageUrl || null;
                    giftData.imagePath = originalGift.imagePath || null;
                }
                
                await updateDoc(giftRef, giftData);
                console.log("Dárek upraven:", currentEditGiftId);

            } else {
                // --- Režim PŘIDÁNÍ ---
                // 1. Vytvoříme referenci na dokument, abychom získali ID
                const newGiftRef = doc(collection(db, 'gifts'));
                const giftId = newGiftRef.id;

                let imageUrl = null;
                let imagePath = null;

                if (file) {
                    // 2. Nahrajeme obrázek pod tímto ID
                    imagePath = `gifts/${giftId}/${file.name}`;
                    const storageRef = ref(storage, imagePath);
                    await uploadBytes(storageRef, file);
                    imageUrl = await getDownloadURL(storageRef);
                }

                // 3. Sestavíme finální data
                const newGiftData = {
                    ...giftData,
                    imageUrl: imageUrl,
                    imagePath: imagePath,
                    status: 'available', 
                    claimedBySolo: null,
                    contributors: [],
                    coordinator: null
                };
                
                // 4. Uložíme dokument
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
 * *** AKTUALIZOVANÝ HLAVNÍ LISTENER PRO AKCE NA KARTÁCH ***
 * Přidána logika pro mazání obrázků a náhled při úpravách.
 */
if (giftsWrapper) {
    giftsWrapper.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn || !currentUser) return;

        const giftId = btn.dataset.id;
        if (!giftId) return;

        const giftRef = doc(db, 'gifts', giftId);

        // 1. Akce otevírající modal
        // ... (zůstává stejné) ...
        
        // 2. Přímé akce (bez modálu)
        try {
            // ... (join, cancel, leave, finalize zůstávají stejné) ...
            
            // --- Admin akce ---
            if (isAdmin) {
                // Admin reset
                // ... (zůstává stejné) ...
                
                // *** UPRAVENO: Admin smazání (maže i obrázek) ***
                if (btn.matches('.admin-delete-btn')) {
                    if (confirm('ADMIN: Opravdu chcete tento dárek TRVALE SMAZAT? Tato akce je nevratná a smaže i obrázek a chat.')) {
                        const gift = allGifts.find(g => g.id === giftId);
                        
                        // 1. Smazat obrázek ze Storage (pokud existuje)
                        if (gift && gift.imagePath) {
                            try {
                                await deleteObject(ref(storage, gift.imagePath));
                                console.log("Obrázek smazán ze Storage.");
                            } catch (imgErr) {
                                console.warn("Nepodařilo se smazat obrázek:", imgErr);
                            }
                        }
                        
                        // 2. Smazat dokument z Firestore
                        // (Stále platí poznámka, že subkolekce 'chat' zůstane "viset",
                        // ale to pro tuto appku nevadí)
                        await deleteDoc(giftRef);
                        console.log("Dárek smazán:", giftId);
                    }
                }
                
                // *** UPRAVENO: Admin úprava (načte i obrázek) ***
                if (btn.matches('.admin-edit-btn')) {
                    const gift = allGifts.find(g => g.id === giftId);
                    if (gift) {
                        // 1. Vyplníme formulář
                        document.getElementById('gift-name').value = gift.name || '';
                        document.getElementById('gift-recipient').value = gift.recipient || 'Ostatní';
                        document.getElementById('gift-occasion').value = gift.occasion || '';
                        document.getElementById('gift-description').value = gift.description || '';
                        document.getElementById('gift-link').value = gift.link || '';
                        giftIsContributionCheckbox.checked = (gift.giftType === 'contribution');
                        
                        // 2. Nastavíme náhled obrázku
                        giftImageInput.value = null; // Vyčistíme file input
                        if (gift.imageUrl) {
                            giftImagePreview.src = gift.imageUrl;
                            giftImagePreview.classList.remove('hidden');
                        } else {
                            giftImagePreview.classList.add('hidden');
                            giftImagePreview.src = '';
                        }
                        
                        // 3. Změníme stav formuláře
                        adminFormTitle.textContent = `Právě upravujete: ${gift.name}`;
                        addGiftSubmitBtn.textContent = 'Uložit změny';
                        cancelEditBtn.classList.remove('hidden');
                        currentEditGiftId = giftId;
                        
                        // 4. Scrollujeme nahoru k formuláři
                        adminPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }
            }
            // --- KONEC Admin akcí ---

        } catch (err) {
            console.error("Chyba při akci s dárkem:", err);
            alert("Došlo k chybě.");
        }

        // 3. Logika pro AKCE S KOMENTÁŘI (Editace, mazání)
        // ... (zůstává stejná) ...
    });

    // Listener pro formuláře (odeslání nového komentáře, uložení editace)
    // ... (zůstává stejný) ...
} else {
    console.error("Kritická chyba: Element 'gifts-wrapper' nebyl nalezen. Ujistěte se, že používáte správný index.html.");
}
