// --- CONFIG ---
const APP_CONFIG = window.__APP_CONFIG__ || {};
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = APP_CONFIG.SUPABASE_ANON_KEY || '';
const supabase = SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;
const tg = window.Telegram?.WebApp || { expand: () => {}, initDataUnsafe: {} };
tg.expand?.();

const storage = {
    get(key, fallback = null) {
        try {
            const value = window.localStorage?.getItem(key);
            return value ?? fallback;
        } catch (error) {
            console.warn('[WEBAPP:storage.get]', key, error);
            return fallback;
        }
    },
    set(key, value) {
        try {
            window.localStorage?.setItem(key, String(value));
            return true;
        } catch (error) {
            console.warn('[WEBAPP:storage.set]', key, error);
            return false;
        }
    },
    remove(key) {
        try {
            window.localStorage?.removeItem(key);
            return true;
        } catch (error) {
            console.warn('[WEBAPP:storage.remove]', key, error);
            return false;
        }
    }
};

function resolveCurrentUserId() {
    const params = new URLSearchParams(window.location.search);
    const fromTelegram = Number(tg.initDataUnsafe?.user?.id || 0);
    const fromQuery = Number(params.get('user_id') || 0);
    const fromStorage = Number(storage.get('debugUserId') || 0);
    const resolved = fromTelegram || fromQuery || fromStorage || 0;
    if (fromQuery && fromQuery !== fromStorage) storage.set('debugUserId', String(fromQuery));
    return resolved;
}

const currentUserId = resolveCurrentUserId();
const icons = ['shopping-cart', 'zap', 'wifi', 'smartphone', 'car', 'home', 'gift', 'coffee', 'music', 'book', 'heart', 'smile', 'star', 'briefcase', 'credit-card', 'monitor', 'tool', 'truck', 'shopping-bag', 'banknote', 'pill', 'shirt', 'bus'];

async function sendClientLog(level, scope, message = '', payload = {}) {
    try {
        await fetch('/api/client-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level,
                scope,
                message,
                payload,
                currentUserId,
                url: window.location.href,
                userAgent: navigator.userAgent,
                tgUserId: tg.initDataUnsafe?.user?.id || null,
            }),
        });
    } catch (_) {
        // client log yuborishning o'zi ishlamasa, appni to'xtatmaymiz
    }
}

const logInfo = (scope, payload = {}) => {
    console.log(`[WEBAPP:${scope}]`, payload);
    sendClientLog('info', scope, '', payload);
};

const logError = (scope, error, payload = {}) => {
    const message = error?.message || String(error);
    const stack = error?.stack || null;
    console.error(`[WEBAPP:${scope}]`, { message, ...payload, raw: error });
    sendClientLog('error', scope, message, { ...payload, stack });
};
sendClientLog('info', 'script-evaluated', '', {
    hasSupabaseFactory: Boolean(window.supabase?.createClient),
    hasTelegramObject: Boolean(window.Telegram?.WebApp),
    readyState: document.readyState,
});
const toIsoString = (value = Date.now()) => new Date(value).toISOString();
const toDateMs = (value) => {
    if (typeof value === 'number') return value;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
};
const normalizeTransactionRecord = (record) => ({
    ...record,
    amount: Number(record.amount) || 0,
    dateMs: toDateMs(record.date),
    receipt_url: record.receipt_url || null,
});
const normalizeTransactions = (rows = []) => rows.map(normalizeTransactionRecord);

// --- STATE ---
let transactions = [];
let allCats = { income: [], expense: [] };
let pin = storage.get('pin');
let bioEnabled = storage.get('bio') === 'true';
let exchangeRate = Number(storage.get('exchangeRate') || 12850);
let activeType = 'all', activeDate = 'all', botState = 'idle', draft = { receipt: null, rawFile: null }, selId = null, selIcon = 'circle';
let pinInput = "", pinStep = 'unlock', tempPin = "";
let selCatIndex = null, selCatType = null;
let isBiometricAvailable = false;
let dashboardCurrency = 'UZS';
let inputCurrency = 'UZS'; // Bot uchun

function safeCreateIcons() {
    try {
        window.lucide?.createIcons?.();
    } catch (error) {
        logError('lucide.createIcons', error);
    }
}

async function detectBiometricAvailability() {
    try {
        if (!window.isSecureContext) return false;
        if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch (error) {
        logError('detectBiometricAvailability', error);
        return false;
    }
}

let shellHasBeenRevealed = false;

function revealAppShell() {
    const skeleton = document.getElementById('dashboard-skeleton');
    const dashboard = document.getElementById('view-dashboard');
    if (skeleton) skeleton.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    shellHasBeenRevealed = true;
}

function scheduleShellReveal(delay = 0) {
    window.setTimeout(() => {
        try {
            revealAppShell();
        } catch (error) {
            console.error('[WEBAPP:revealAppShell]', error);
        }
    }, delay);
}

window.addEventListener('load', () => scheduleShellReveal(0));
scheduleShellReveal(1800);

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        safeCreateIcons();
        isBiometricAvailable = await detectBiometricAvailability();
        if (pin) showPinScreen('unlock');
        if (storage.get('theme') === 'light') toggleTheme(true);
        logInfo('boot', {
            hasSupabase: Boolean(supabase),
            hasTelegramUser: Boolean(currentUserId),
            currentUserId,
            path: window.location.pathname,
            isSecureContext: window.isSecureContext,
        });
        const ic = document.getElementById('icon-selector');
        if (ic) {
            icons.forEach(i => {
                const d = document.createElement('div');
                d.className = "p-2 rounded-lg bg-slate-700 flex items-center justify-center cursor-pointer icon-opt transition-all";
                d.innerHTML = `<i data-lucide="${i}" class="w-5 h-5 text-slate-300 pointer-events-none"></i>`;
                d.onclick = () => { document.querySelectorAll('.icon-opt').forEach(e => e.classList.remove('selected')); d.classList.add('selected'); selIcon = i; };
                ic.appendChild(d);
            });
            safeCreateIcons();
        }
        window.addEventListener('click', () => { const menu = document.getElementById('cat-context-menu'); if (menu) menu.classList.add('hidden'); });

        if (!supabase) throw new Error('SUPABASE_URL yoki SUPABASE_ANON_KEY sozlanmagan. /api/config.js envlarini tekshiring.');
        if (!currentUserId) throw new Error(`Telegram user_id topilmadi. Mini appni Telegram ichida oching yoki test uchun URLga ?user_id=123 qo'shing.`);
        revealAppShell();
        await fetchInitialData();
        logInfo('boot-ready', { currentUserId, transactions: transactions.length });
    } catch (e) {
        logError('boot-failed', e, { currentUserId, hasSupabase: Boolean(supabase) });
    } finally {
        revealAppShell();
        setTimeout(() => {
            revealAppShell();
            try {
                updateUI();
            } catch (error) {
                logError('updateUI-after-boot', error);
            }
            const navDash = document.getElementById('nav-dashboard');
            if (navDash) navDash.classList.add('active');
            try {
                updateSettingsUI();
            } catch (error) {
                logError('updateSettingsUI-after-boot', error);
            }
            logInfo('shell-state', { shellHasBeenRevealed });
        }, 300);
    }

    // --- SWIPE LOGIC (O'ZGARTIRILDI: MOUSE EVENTS QO'SHILDI) ---
    const card = document.getElementById('balance-card');
    if (card) {
        let startX = 0;
        let endX = 0;

        // Touch events (Telefonlar uchun)
        card.addEventListener('touchstart', (e) => {
            startX = e.changedTouches[0].screenX;
        }, { passive: true });

        card.addEventListener('touchend', (e) => {
            endX = e.changedTouches[0].screenX;
            handleDashboardSwipe(startX, endX);
        }, { passive: true });

        // Mouse events (Kompyuter/Laptop uchun)
        card.addEventListener('mousedown', (e) => {
            startX = e.clientX;
        });

        card.addEventListener('mouseup', (e) => {
            endX = e.clientX;
            handleDashboardSwipe(startX, endX);
        });

        // Swipe handler function
        function handleDashboardSwipe(s, e) {
            const threshold = 50; 
            
            // Chapga surish (UZS -> USD)
            if (s - e > threshold) {
                if (dashboardCurrency === 'UZS') {
                    setDashboardCurrency('USD');
                }
            }
            
            // O'ngga surish (USD -> UZS)
            if (e - s > threshold) {
                if (dashboardCurrency === 'USD') {
                    setDashboardCurrency('UZS');
                }
            }
        }
    }
});

function setDashboardCurrency(curr) {
    if (curr === dashboardCurrency) return; // O'zgarmasa qayt

    dashboardCurrency = curr;
    vibrate('medium'); // Tebranish beramiz

    // Animatsiya (swiper effekti)
    const swiper = document.getElementById('balance-swiper');

    // Bir oz siljish effekti va qaytish
    if (curr === 'USD') {
        swiper.style.transform = 'translateX(-10px)';
        setTimeout(() => swiper.style.transform = 'translateX(0)', 150);
        document.getElementById('dot-uzs').classList.remove('active');
        document.getElementById('dot-usd').classList.add('active');
    } else {
        swiper.style.transform = 'translateX(10px)';
        setTimeout(() => swiper.style.transform = 'translateX(0)', 150);
        document.getElementById('dot-usd').classList.remove('active');
        document.getElementById('dot-uzs').classList.add('active');
    }

    // Ma'lumotlarni yangilash
    updateUI();
}

// --- BACKEND ---
async function ensureUserProfile() {
    const baseProfile = {
        user_id: currentUserId,
        full_name: [tg.initDataUnsafe?.user?.first_name, tg.initDataUnsafe?.user?.last_name].filter(Boolean).join(' ').trim() || `User ${currentUserId}`,
        exchange_rate: Number(exchangeRate) || 12850,
    };

    const { error } = await supabase
        .from('users')
        .upsert(baseProfile, { onConflict: 'user_id' });

    if (error) throw error;
}

async function fetchInitialData() {
    await ensureUserProfile();

    const { data: userData, error: uError } = await supabase
        .from('users')
        .select('exchange_rate')
        .eq('user_id', currentUserId)
        .maybeSingle();

    if (uError) logError('fetch-user', uError, { currentUserId });
    if (userData?.exchange_rate) {
        exchangeRate = Number(userData.exchange_rate) || exchangeRate;
        storage.set('exchangeRate', String(exchangeRate));
    }

    const { data: tData, error: tError } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', currentUserId)
        .order('date', { ascending: false });

    if (tError) throw tError;
    transactions = normalizeTransactions(tData || []);

    const { data: cData, error: cError } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', currentUserId)
        .order('name', { ascending: true });

    if (cError) throw cError;

    if (!cData || cData.length === 0) {
        await initDefaultCategories();
    } else {
        allCats.income = cData.filter(c => c.type === 'income');
        allCats.expense = cData.filter(c => c.type === 'expense');
    }

    logInfo('fetchInitialData', {
        currentUserId,
        transactions: transactions.length,
        incomeCategories: allCats.income.length,
        expenseCategories: allCats.expense.length,
        exchangeRate,
    });
}

async function initDefaultCategories() {
    const defaultIncome = [
        { name: 'Oylik', icon: 'banknote', type: 'income' },
        { name: 'Bonus', icon: 'gift', type: 'income' },
        { name: 'Sotuv', icon: 'shopping-bag', type: 'income' },
    ];
    const defaultExpense = [
        { name: 'Oziq-ovqat', icon: 'shopping-cart', type: 'expense' },
        { name: 'Transport', icon: 'bus', type: 'expense' },
        { name: 'Kafe', icon: 'coffee', type: 'expense' },
    ];

    const payload = [...defaultIncome, ...defaultExpense].map(category => ({
        ...category,
        user_id: currentUserId,
    }));

    const { data, error } = await supabase
        .from('categories')
        .insert(payload)
        .select();

    if (error) throw error;

    allCats.income = (data || []).filter(c => c.type === 'income');
    allCats.expense = (data || []).filter(c => c.type === 'expense');
}


// --- NAVIGATION ---
function switchTab(t) {
    vibrate('light');
    ['dashboard', 'bot', 'history'].forEach(v => { const el = document.getElementById(`view-${v}`); if (el) el.classList.add('hidden'); });
    const target = document.getElementById(`view-${t}`);
    if (target) target.classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const botBtn = document.getElementById('nav-bot');
    if (botBtn) { botBtn.classList.remove('active'); botBtn.querySelector('i').classList.remove('text-blue-500'); botBtn.querySelector('i').classList.add('text-white'); }
    if (t === 'bot') { if (botBtn) { botBtn.classList.add('active'); botBtn.querySelector('i').classList.remove('text-white'); botBtn.querySelector('i').classList.add('text-blue-500'); } }
    else { const activeBtn = document.getElementById(`nav-${t}`); if (activeBtn) activeBtn.classList.add('active'); }
    if (t === 'dashboard') updateUI();
    safeCreateIcons();
}

// --- CATEGORY ACTIONS (EDIT/DELETE) ---
let longPressTimer;
function handleCatPressStart(e, idx, type) { longPressTimer = setTimeout(() => showCatOptions(e, idx, type), 500); }
function handleCatPressEnd() { clearTimeout(longPressTimer); }
function showCatOptions(e, idx, type) {
    e.preventDefault(); selCatIndex = idx; selCatType = type;
    const menu = document.getElementById('cat-context-menu');
    const clickX = e.clientX || e.touches[0].clientX; const clickY = e.clientY || e.touches[0].clientY;
    menu.style.left = `${Math.min(clickX, window.innerWidth - 170)}px`; menu.style.top = `${Math.min(clickY, window.innerHeight - 100)}px`;
    menu.classList.remove('hidden');
}
function editCatFromMenu() {
    const cat = allCats[selCatType][selCatIndex];
    document.getElementById('edit-cat-name-input').value = cat.name;
    document.getElementById('edit-cat-modal').classList.remove('hidden'); document.getElementById('cat-context-menu').classList.add('hidden');
}
async function confirmEditCat() {
    const newName = document.getElementById('edit-cat-name-input').value.trim();
    if (!newName) return;

    const cat = allCats[selCatType]?.[selCatIndex];
    if (!cat) return;

    allCats[selCatType][selCatIndex] = { ...cat, name: newName };
    renderBotCats(selCatType);
    closeModal('edit-cat-modal');

    const query = supabase.from('categories').update({ name: newName }).eq('user_id', currentUserId);
    const { error } = cat.id ? await query.eq('id', cat.id) : await query.eq('name', cat.name).eq('type', selCatType);
    if (error) logError('confirmEditCat', error, { currentUserId, catId: cat.id, oldName: cat.name, newName });
}
async function deleteCatFromMenu() {
    if (!confirm("Bu kategoriyani o'chirasizmi?")) return;

    const catToDelete = allCats[selCatType]?.[selCatIndex];
    if (!catToDelete) return;

    allCats[selCatType].splice(selCatIndex, 1);
    renderBotCats(selCatType);
    document.getElementById('cat-context-menu').classList.add('hidden');

    const query = supabase.from('categories').delete().eq('user_id', currentUserId);
    const { error } = catToDelete.id ? await query.eq('id', catToDelete.id) : await query.eq('name', catToDelete.name).eq('type', selCatType);
    if (error) logError('deleteCatFromMenu', error, { currentUserId, catId: catToDelete.id, name: catToDelete.name });
}


// --- PIN SYSTEM ---
function showPinScreen(step) {
    pinStep = step; pinInput = ""; updatePinDots();
    document.getElementById('pin-screen').classList.remove('hidden');
    const t = document.getElementById('pin-title'), s = document.getElementById('pin-subtitle'), c = document.getElementById('cancel-pin-setup'), bioBtn = document.getElementById('bio-btn'), bioPlace = document.getElementById('bio-placeholder');
    if (step === 'unlock') {
        t.innerText = "PIN Kod"; s.innerText = "Kirish uchun"; c.classList.add('hidden');
        if (bioEnabled && isBiometricAvailable) { bioBtn.classList.remove('hidden'); bioPlace.classList.add('hidden'); setTimeout(triggerBiometric, 300); } else { bioBtn.classList.add('hidden'); bioPlace.classList.remove('hidden'); }
    } else if (step === 'setup_old') { t.innerText = "Eski PIN"; s.innerText = "Tasdiqlash uchun"; c.classList.remove('hidden'); bioBtn.classList.add('hidden'); bioPlace.classList.remove('hidden'); } else if (step === 'setup_new') { t.innerText = "Yangi PIN"; s.innerText = "4 xonali kod o'rnating"; c.classList.remove('hidden'); bioBtn.classList.add('hidden'); bioPlace.classList.remove('hidden'); } else if (step === 'setup_confirm') { t.innerText = "Qayta kiritish"; s.innerText = "Yangi PINni tasdiqlang"; }
}
function handlePinInput(n) { vibrate('medium'); if (pinInput.length < 4) { pinInput += n; updatePinDots(); if (pinInput.length === 4) setTimeout(checkPin, 200); } }
function handlePinDelete() { pinInput = pinInput.slice(0, -1); updatePinDots(); }
function updatePinDots() { document.querySelectorAll('.pin-dot').forEach((d, i) => i < pinInput.length ? d.classList.add('bg-blue-500', 'active', 'scale-110') : d.classList.remove('bg-blue-500', 'active', 'scale-110')); }
function checkPin() {
    const d = document.getElementById('pin-dots'); const err = () => { d.classList.add('shake'); setTimeout(() => { d.classList.remove('shake'); pinInput = ""; updatePinDots(); }, 400); };
    if (pinStep === 'unlock') { if (pinInput === pin) { document.getElementById('pin-screen').classList.add('hidden'); } else err(); } else if (pinStep === 'setup_old') { if (pinInput === pin) { showPinScreen('setup_new'); } else err(); } else if (pinStep === 'setup_new') { tempPin = pinInput; showPinScreen('setup_confirm'); } else if (pinStep === 'setup_confirm') { if (pinInput === tempPin) { pin = tempPin; localStorage.setItem('pin', pin); document.getElementById('pin-screen').classList.add('hidden'); updateSettingsUI(); alert("PIN o'zgartirildi! ✅"); closeModal('settings-modal'); } else { alert("Mos kelmadi!"); showPinScreen('setup_new'); } }
}
async function triggerBiometric() { if (!isBiometricAvailable) return; try { const challenge = new Uint8Array(32); window.crypto.getRandomValues(challenge); await navigator.credentials.get({ publicKey: { challenge: challenge, timeout: 60000, userVerification: "required", } }); document.getElementById('pin-screen').classList.add('hidden'); } catch (e) { console.log("Biometric error", e); } }
function startPinSetup() { if (pin) showPinScreen('setup_old'); else showPinScreen('setup_new'); }
function cancelPinSetup() { document.getElementById('pin-screen').classList.add('hidden'); }
function toggleBiometric(el) { bioEnabled = el.checked; storage.set('bio', bioEnabled); }
function removePin() { if (confirm("PIN kodni olib tashlaysizmi?")) { storage.remove('pin'); pin = null; updateSettingsUI(); alert("PIN kod olib tashlandi."); closeModal('settings-modal'); } }

// --- UPLOAD & RECEIPT ---
function handleReceiptUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    draft.rawFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image(); img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const maxW = 800; const scale = maxW / img.width;
            canvas.width = scale < 1 ? maxW : img.width; canvas.height = scale < 1 ? img.height * scale : img.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            draft.receipt = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('receipt-img-preview').src = draft.receipt;
            document.getElementById('receipt-preview-area').classList.remove('hidden');
        }
    }; reader.readAsDataURL(file);
}
async function uploadReceipt(file) {
    const fileName = `${currentUserId}/${Date.now()}-${file.name || 'receipt'}.jpg`;
    const { error } = await supabase.storage
        .from('receipts')
        .upload(fileName, file, { upsert: false, contentType: file.type || 'image/jpeg' });

    if (error) {
        logError('uploadReceipt', error, { currentUserId, fileName });
        throw error;
    }

    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
    logInfo('uploadReceipt', { currentUserId, fileName, publicUrl });
    return publicUrl;
}

function clearReceipt() { draft.receipt = null; draft.rawFile = null; document.getElementById('file-upload').value = ''; document.getElementById('receipt-preview-area').classList.add('hidden'); }
function viewReceipt(src) { document.getElementById('full-receipt-image').src = src; document.getElementById('receipt-modal').classList.remove('hidden'); }
function closeReceiptModal() { document.getElementById('receipt-modal').classList.add('hidden'); }

// --- CORE UI ---
function updateUI() {
    const { s, e } = getDateRange();
    transactions = normalizeTransactions(transactions).sort((a, b) => b.dateMs - a.dateMs);

    const dateFiltered = transactions.filter(t => t.dateMs >= s && t.dateMs <= e);
    const filtered = activeType === 'all' ? dateFiltered : dateFiltered.filter(t => t.type === activeType);

    const incBase = filtered.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const expBase = filtered.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const balBase = incBase - expBase;

    if (dashboardCurrency === 'USD' && exchangeRate > 0) {
        const displayBal = balBase / exchangeRate;
        const displayInc = incBase / exchangeRate;
        const displayExp = expBase / exchangeRate;

        document.getElementById('total-balance').innerText = `$ ${formatNumber(displayBal)}`;
        document.getElementById('total-income').innerText = `+$ ${formatNumber(displayInc)}`;
        document.getElementById('total-expense').innerText = `-$ ${formatNumber(displayExp)}`;
        document.getElementById('currency-badge').innerText = 'USD';
        document.getElementById('currency-badge').className = 'text-[10px] bg-blue-500 px-1.5 py-0.5 rounded text-white font-mono';
    } else {
        document.getElementById('total-balance').innerText = `${formatNumber(balBase)} so'm`;
        document.getElementById('total-income').innerText = `+${formatNumber(incBase)}`;
        document.getElementById('total-expense').innerText = `-${formatNumber(expBase)}`;
        document.getElementById('currency-badge').innerText = 'UZS';
        document.getElementById('currency-badge').className = 'text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white font-mono';
    }

    updateTrendWidgets();

    const ci = document.getElementById('card-income'), ce = document.getElementById('card-expense');
    ci.className = `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'income' ? 'bg-emerald-500/20 border-emerald-500' : 'hover:bg-emerald-500/10'}`;
    ce.className = `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'expense' ? 'bg-rose-500/20 border-rose-500' : 'hover:bg-rose-500/10'}`;

    renderCharts(filtered);
    renderHistory();
}

function updateTrendWidgets() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const lastMonthEnd = thisMonthStart - 1;
    const thisMonthTrans = transactions.filter(t => t.dateMs >= thisMonthStart && t.type === 'expense');
    const lastMonthTrans = transactions.filter(t => t.dateMs >= lastMonthStart && t.dateMs <= lastMonthEnd && t.type === 'expense');
    const group = (arr) => arr.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + (Number(t.amount) || 0); return acc; }, {});
    const curr = group(thisMonthTrans);
    const prev = group(lastMonthTrans);
    let html = '';
    const cats = [...new Set([...Object.keys(curr), ...Object.keys(prev)])];

    if (cats.length > 0) {
        document.getElementById('trend-container').classList.remove('hidden');
        cats.forEach(c => {
            const cVal = curr[c] || 0;
            const pVal = prev[c] || 0;
            if (pVal > 0 && cVal > 0) {
                const pct = ((cVal - pVal) / pVal) * 100;
                if (Math.abs(pct) > 5) {
                    const isBad = pct > 0;
                    const color = isBad ? 'text-rose-400' : 'text-emerald-400';
                    const icon = isBad ? 'trending-up' : 'trending-down';
                    html += `<div class="glass-panel p-3 rounded-xl flex justify-between items-center"><div><div class="text-xs text-slate-400">${c}</div><div class="font-bold text-sm text-white">${formatNumber(cVal)}</div></div><div class="text-right"><div class="${color} font-bold text-xs flex items-center gap-1 justify-end"><i data-lucide="${icon}" class="w-3 h-3"></i> ${Math.round(Math.abs(pct))}%</div><div class="text-xs text-slate-500">o'tgan oy</div></div></div>`;
                }
            }
        });
    } else {
        document.getElementById('trend-container').classList.add('hidden');
    }

    document.getElementById('trend-list').innerHTML = html || `<div class="col-span-2 text-center text-xs text-slate-500 py-2">Trendlar uchun ma'lumot yetarli emas</div>`;
}
function renderCharts(data) {
    const canvas = document.getElementById('categoryChart');
    const noData = document.getElementById('no-data-msg');
    const list = document.getElementById('top-transaction-list');

    if (!canvas || typeof window.Chart === 'undefined') {
        logError('renderCharts-missing-deps', new Error(!canvas ? 'categoryChart canvas topilmadi' : 'Chart kutubxonasi yuklanmagan'));
        if (noData) noData.classList.remove('hidden');
        if (list) list.innerHTML = '';
        return;
    }

    const ctx = canvas.getContext?.('2d');
    if (!ctx) {
        logError('renderCharts-no-context', new Error('Canvas 2d context olinmadi'));
        if (noData) noData.classList.remove('hidden');
        if (list) list.innerHTML = '';
        return;
    }

    let t = activeType === 'income' ? data.filter(x => x.type === 'income') : data.filter(x => x.type === 'expense');
    if (activeType === 'all') t = data.filter(x => x.type === 'expense');
    if (noData) noData.classList.toggle('hidden', t.length > 0);

    const cats = {};
    t.forEach(x => cats[x.category] = (cats[x.category] || 0) + (Number(x.amount) || 0));

    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats),
            datasets: [{ data: Object.values(cats), backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    });

    if (!list) return;
    list.innerHTML = '';
    Object.entries(cats).sort(([, a], [, b]) => b - a).slice(0, 5).forEach(([c, a]) => {
        list.innerHTML += `<tr><td class="py-2.5 text-slate-300 capitalize pl-2">${c}</td><td class="text-right font-bold pr-2 ${activeType === 'income' ? 'text-emerald-400' : 'text-rose-400'}">${formatNumber(a)}</td></tr>`;
    });
}
function renderHistory() {
    const list = document.getElementById('history-list');
    const emptyState = document.getElementById('empty-history');
    if (!list) return;

    list.innerHTML = '';
    if (emptyState) emptyState.classList.toggle('hidden', transactions.length > 0);

    transactions
        .slice()
        .sort((a, b) => b.dateMs - a.dateMs)
        .forEach(t => {
            const isInc = t.type === 'income';
            const hasReceipt = t.receipt || t.receipt_url;
            const receiptBadge = hasReceipt ? `<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-0.5"><i data-lucide="paperclip" class="w-2 h-2"></i> Chek</span>` : '';
            list.innerHTML += `<div onclick="openActionSheet(event, ${t.id})" class="glass-panel p-4 rounded-2xl flex justify-between items-center cursor-pointer active:scale-95 transition-transform hover:bg-slate-800/50"><div class="flex items-center gap-4"><div class="p-3 rounded-full ${isInc ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}"><i data-lucide="${isInc ? 'arrow-down-left' : 'arrow-up-right'}" class="w-5 h-5"></i></div><div><div class="font-bold text-sm text-white capitalize flex items-center">${t.category} ${receiptBadge}</div><div class="text-xs text-slate-400 mt-0.5">${new Date(t.dateMs).toLocaleDateString()} • ${new Date(t.dateMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div></div></div><div class="font-bold ${isInc ? 'text-emerald-400' : 'text-rose-400'} text-base">${isInc ? '+' : '-'}${formatNumber(t.amount)}</div></div>`;
        });
    safeCreateIcons();
}
// --- BOT ---
function startBotFlow(type) { draft = { type, category: '', amount: 0, receipt: null, rawFile: null }; clearReceipt(); document.getElementById('bot-start-actions').classList.add('hidden'); document.getElementById('category-selector').classList.remove('hidden'); renderBotCats(type); }
function renderBotCats(type) {
    const grid = document.getElementById('category-grid'); grid.innerHTML = '';
    allCats[type].forEach((c, idx) => {
        const btn = document.createElement('button');
        btn.className = "cat-btn flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-blue-500 transition-all active:scale-95 select-none";
        btn.innerHTML = `<i data-lucide="${c.icon}" class="w-6 h-6 mb-1 ${type === 'income' ? 'text-emerald-400' : 'text-rose-400'} pointer-events-none"></i><span class="text-[10px] text-slate-300 truncate w-full text-center pointer-events-none">${c.name}</span>`;
        btn.onclick = () => { vibrate('light'); draft.category = c.name; document.getElementById('category-selector').classList.add('hidden'); document.getElementById('bot-input-container').classList.remove('hidden'); document.getElementById('bot-input').focus(); };
        btn.oncontextmenu = (e) => showCatOptions(e, idx, type);
        btn.ontouchstart = (e) => handleCatPressStart(e, idx, type);
        btn.ontouchend = handleCatPressEnd;
        grid.appendChild(btn);
    });
    safeCreateIcons();
}

// --- CURRENCY LOGIC ---
function toggleInputCurrency() {
    vibrate('light');
    const btn = document.getElementById('currency-toggle');
    if (inputCurrency === 'UZS') {
        inputCurrency = 'USD';
        btn.innerText = 'USD';
        btn.classList.remove('text-emerald-400', 'border-emerald-500/30');
        btn.classList.add('text-blue-400', 'border-blue-500/30'); // Dollar rangi
        document.getElementById('bot-input').placeholder = "Necha dollar?";
    } else {
        inputCurrency = 'UZS';
        btn.innerText = 'UZS';
        btn.classList.remove('text-blue-400', 'border-blue-500/30');
        btn.classList.add('text-emerald-400', 'border-emerald-500/30');
        document.getElementById('bot-input').placeholder = "Summani kiriting...";
    }
}

async function submitBotInput() {
    vibrate('heavy');
    const rawVal = document.getElementById('bot-input').value;
    const val = parseFloat(rawVal.replace(/[^0-9.]/g, ''));
    if (!val) return;

    let finalAmount = val;
    let note = '';
    if (inputCurrency === 'USD') {
        finalAmount = Math.round(val * exchangeRate);
        note = ` ($${val})`;
    }

    let finalReceiptUrl = null;
    if (draft.rawFile) {
        try {
            finalReceiptUrl = await uploadReceipt(draft.rawFile);
        } catch (error) {
            alert("Rasm yuklanmadi, lekin tranzaksiya saqlanadi.");
        }
    }

    const createdAtIso = toIsoString();
    const newTrans = {
        user_id: currentUserId,
        amount: Math.round(finalAmount),
        category: `${draft.category}${note}`,
        type: draft.type,
        date: createdAtIso,
        receipt_url: finalReceiptUrl,
    };

    const tempId = Date.now();
    transactions.unshift(normalizeTransactionRecord({ ...newTrans, id: tempId, receipt: draft.receipt }));
    updateUI();
    document.getElementById('bot-input').value = '';

    if (inputCurrency === 'USD') toggleInputCurrency();

    cancelBotFlow();

    const icon = draft.receipt ? '📎' : '';
    const chat = document.getElementById('chat-messages');
    chat.innerHTML += `<div class="msg-wrapper ai fade-in"><div class="msg-bubble ai border-l-4 ${draft.type === 'income' ? 'border-l-emerald-500' : 'border-l-rose-500'}">Saqlandi: <b>${formatNumber(finalAmount)} so'm</b> ${icon} <br><span class="text-xs opacity-70">${draft.category}${note}</span></div></div>`;
    setTimeout(() => chat.scrollTop = chat.scrollHeight, 100);

    draft = { receipt: null, rawFile: null };

    const { data, error } = await supabase.from('transactions').insert([newTrans]).select().single();
    if (error) {
        transactions = transactions.filter(t => t.id !== tempId);
        updateUI();
        logError('submitBotInput', error, { currentUserId, category: newTrans.category, amount: newTrans.amount });
        alert("Saqlashda xatolik bo'ldi. Loglarni tekshiring.");
        return;
    }

    const idx = transactions.findIndex(t => t.id === tempId);
    if (idx !== -1) transactions[idx] = normalizeTransactionRecord({ ...transactions[idx], ...data, receipt: draft.receipt });
    logInfo('submitBotInput', { currentUserId, transactionId: data.id, amount: newTrans.amount, type: newTrans.type });
}

function cancelBotFlow() { document.getElementById('bot-input-container').classList.add('hidden'); document.getElementById('category-selector').classList.add('hidden'); document.getElementById('bot-start-actions').classList.remove('hidden'); clearReceipt(); }
// --- HELPER FUNCTIONS ---
function toggleTheme(forceValue) { const isLight = typeof forceValue === 'boolean' ? forceValue : document.body.classList.toggle('light-mode'); document.body.classList.toggle('light-mode', isLight); storage.set('theme', isLight ? 'light' : 'dark'); safeCreateIcons(); }
function openAddCategoryModal() { document.getElementById('add-cat-modal').classList.remove('hidden'); }
async function saveNewCategory() {
    const n = document.getElementById('new-cat-name').value.trim();
    if (n && draft.type) {
        const payload = { user_id: currentUserId, name: n, icon: selIcon, type: draft.type };
        const { data, error } = await supabase.from('categories').insert([payload]).select().single();
        if (error) {
            logError('saveNewCategory', error, { currentUserId, payload });
            alert("Kategoriyani saqlab bo'lmadi. Balki shu nom allaqachon mavjuddir.");
            return;
        }
        allCats[draft.type].push(data);
        allCats[draft.type].sort((a, b) => a.name.localeCompare(b.name));
        renderBotCats(draft.type);
        closeModal('add-cat-modal');
        document.getElementById('new-cat-name').value = '';
        selIcon = 'circle';
    }
}
function openSettings() { updateSettingsUI(); document.getElementById('settings-modal').classList.remove('hidden'); }

// O'ZGARTIRILDI: Kurs inputini yangilash qo'shildi
function updateSettingsUI() {
    document.getElementById('pin-status-text').innerText = pin ? "Faol" : "O'rnatilmagan"; document.getElementById('bio-toggle').checked = bioEnabled;
    const removeBtn = document.getElementById('btn-remove-pin'); if (pin) removeBtn.classList.remove('hidden'); else removeBtn.classList.add('hidden');
    if (isBiometricAvailable) document.getElementById('bio-row').classList.remove('hidden'); else document.getElementById('bio-row').classList.add('hidden');
    
    // Kursni inputga yozish
    const rateInput = document.getElementById('exchange-rate-input');
    if(rateInput) rateInput.value = exchangeRate;
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function formatNumber(n) {
    const numeric = Number(n);
    if (!Number.isFinite(numeric)) return '0';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(numeric);
}
function toggleTypeFilter(t) { vibrate('soft'); activeType = activeType === t ? 'all' : t; updateUI(); }
function setDateFilter(f) {
    vibrate('soft');
    activeDate = f;
    document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('filter-active'));
    const activeButton = document.querySelector(`[data-filter="${f}"]`);
    if (activeButton) activeButton.classList.add('filter-active');
    updateUI();
}
function getDateRange() {
    const now = new Date();
    let s = 0; let e = new Date().setHours(23, 59, 59, 999);
    if (activeDate === 'week') s = now.getTime() - 7 * 86400000;
    else if (activeDate === 'month') s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    else if (activeDate === 'custom') {
        s = new Date(document.getElementById('start-date').value).getTime();
        e = new Date(document.getElementById('end-date').value).getTime() + 86400000;
    }
    return { s, e };
}
// --- HAPTIC FEEDBACK ---
function vibrate(style = 'light') {
    // style: 'light', 'medium', 'heavy', 'rigid', 'soft'
    if (window.Telegram?.WebApp?.HapticFeedback) {
        window.Telegram.WebApp.HapticFeedback.impactOccurred(style);
    }
}
function openDateRangeModal() { activeDate = 'custom'; document.getElementById('date-range-modal').classList.remove('hidden'); }
function applyDateRange() { updateUI(); closeModal('date-range-modal'); }
// --- IMPORT / EXPORT (Tuzatilgan) ---
function exportData() {
    const data = { transactions, allCats, pin, bio: bioEnabled };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `backup_kassa_${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const backup = JSON.parse(event.target.result);
            if (backup.pin) storage.set('pin', backup.pin);
            if (backup.bio !== undefined) storage.set('bio', backup.bio);

            if (backup.transactions && Array.isArray(backup.transactions) && backup.transactions.length > 0) {
                const newTrans = backup.transactions.map(t => {
                    const { id, dateMs, receipt, ...rest } = t;
                    return {
                        ...rest,
                        user_id: currentUserId,
                        date: toIsoString(rest.date || dateMs || Date.now()),
                    };
                });
                const { error } = await supabase.from('transactions').insert(newTrans);
                if (error) throw error;
            }

            if (backup.allCats) {
                const allImportedCategories = [...(backup.allCats.income || []), ...(backup.allCats.expense || [])]
                    .map(({ id, created_at, ...rest }) => ({ ...rest, user_id: currentUserId }));
                if (allImportedCategories.length > 0) {
                    await supabase.from('categories').upsert(allImportedCategories, { onConflict: 'user_id,name,type' });
                }
            }

            alert("Muvaffaqiyatli! Dastur qayta yuklanmoqda...");
            location.reload();
        } catch (err) {
            logError('importData', err, { currentUserId });
            alert("Importda xatolik yuz berdi.");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}
function confirmResetData() { if (confirm("DIQQAT! Barcha ma'lumotlar BAZADAN o'chib ketadi. Davom etasizmi?")) { transactions = []; updateUI(); closeModal('settings-modal'); supabase.from('transactions').delete().eq('user_id', currentUserId).then(() => alert("Tozalandi!")); } }
// --- MODALS ACTIONS (Tahrirlash va O'chirish qaytarildi) ---
function openActionSheet(e, id) {
    if (e) e.stopPropagation(); selId = id; const t = transactions.find(x => x.id === id);
    const c = document.getElementById('action-sheet-content'); c.innerHTML = '';
    const hasReceipt = t.receipt_url || t.receipt;
    if (hasReceipt) { c.innerHTML += `<button onclick="viewCurrentReceipt()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-emerald-400 font-medium"><i data-lucide="file-text" class="w-5 h-5"></i> Chekni ko'rish</button>`; }
    c.innerHTML += `<button onclick="handleEdit()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-blue-400 font-medium"><i data-lucide="edit-3" class="w-5 h-5"></i> Tahrirlash</button><button onclick="handleDeleteConfirm()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-rose-400 font-medium"><i data-lucide="trash-2" class="w-5 h-5"></i> O'chirish</button>`;
    document.getElementById('action-sheet').classList.remove('hidden'); safeCreateIcons();
}
function viewCurrentReceipt() { const t = transactions.find(x => x.id === selId); if (t) { const src = t.receipt_url || t.receipt; viewReceipt(src); } closeActionSheet(null); }
function closeActionSheet(e) { if (e && !e.target.closest('.bg-slate-800') && e.target.id !== 'action-sheet') return; document.getElementById('action-sheet').classList.add('hidden'); }
function handleDeleteConfirm() { closeActionSheet(null); document.getElementById('delete-modal').classList.remove('hidden'); }
async function confirmDelete() { const idToDelete = selId; transactions = transactions.filter(t => t.id !== idToDelete); updateUI(); closeModal('delete-modal'); const { error } = await supabase.from('transactions').delete().eq('id', idToDelete).eq('user_id', currentUserId); if (error) logError('confirmDelete', error, { currentUserId, idToDelete }); }
function handleEdit() { closeActionSheet(null); const t = transactions.find(x => x.id === selId); if (!t) return; document.getElementById('edit-category').value = t.category; document.getElementById('edit-amount').value = t.amount; document.getElementById('edit-type').value = t.type; document.getElementById('edit-modal').classList.remove('hidden'); }
async function saveEdit() {
    const c = document.getElementById('edit-category').value, a = Number(document.getElementById('edit-amount').value), tp = document.getElementById('edit-type').value;
    if (c && a) {
        const i = transactions.findIndex(x => x.id === selId);
        if (i !== -1) { transactions[i].category = c; transactions[i].amount = a; transactions[i].type = tp; updateUI(); const { error } = await supabase.from('transactions').update({ category: c, amount: a, type: tp }).eq('id', selId).eq('user_id', currentUserId); if (error) logError('saveEdit', error, { currentUserId, selId }); }
    } closeModal('edit-modal');
}
// --- PDF ---
function openExportModal() {
    const now = new Date(); const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    document.getElementById('export-start-date').valueAsDate = firstDay; document.getElementById('export-end-date').valueAsDate = now;
    updateExportPreview(); document.getElementById('export-modal').classList.remove('hidden');
    document.getElementById('export-start-date').onchange = updateExportPreview; document.getElementById('export-end-date').onchange = updateExportPreview;
}
function updateExportPreview() {
    const s = new Date(document.getElementById('export-start-date').value).getTime(); const e = new Date(document.getElementById('export-end-date').value).getTime() + 86400000;
    const data = transactions.filter(t => t.dateMs >= s && t.dateMs < e); const receipts = data.filter(t => t.receipt || t.receipt_url).length;
    document.getElementById('export-count').innerText = data.length + " ta operatsiya"; document.getElementById('export-receipts').innerText = receipts + " ta rasm";
}
async function generatePDF() {
    const { jsPDF } = window.jspdf; if (!jsPDF) { alert("PDF kutubxonalari yuklanmagan!"); return; }
    const sStr = document.getElementById('export-start-date').value; const eStr = document.getElementById('export-end-date').value;
    const s = new Date(sStr).getTime(); const e = new Date(eStr).getTime() + 86400000;
    const data = transactions.filter(t => t.dateMs >= s && t.dateMs < e).sort((a, b) => a.dateMs - b.dateMs);
    if (data.length === 0) { alert("Tanlangan davrda ma'lumot yo'q."); return; }
    const doc = new jsPDF(); const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pageWidth, 40, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text("Mening Kassam", 14, 18); doc.setFontSize(10); doc.setTextColor(200, 200, 200); doc.text("Moliyaviy hisobot", 14, 26); doc.text(`${sStr} dan ${eStr} gacha`, pageWidth - 14, 26, { align: 'right' });
    const inc = data.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0); const exp = data.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0); const bal = inc - exp;
    let yPos = 50; doc.setTextColor(0); doc.setFontSize(10); doc.text("Jami Kirim:", 14, yPos); doc.setTextColor(16, 185, 129); doc.setFont("helvetica", "bold"); doc.text(`+${formatNumber(inc)} so'm`, 40, yPos); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Jami Chiqim:", 80, yPos); doc.setTextColor(239, 68, 68); doc.setFont("helvetica", "bold"); doc.text(`-${formatNumber(exp)} so'm`, 110, yPos); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Sof Qoldiq:", 150, yPos); doc.setTextColor(59, 130, 246); doc.setFont("helvetica", "bold"); doc.text(`${formatNumber(bal)} so'm`, 175, yPos);
    const tableData = data.map(t => [new Date(t.dateMs).toLocaleDateString(), t.category, t.type === 'income' ? 'Kirim' : 'Chiqim', (t.type === 'income' ? '+' : '-') + formatNumber(t.amount),]);
    doc.autoTable({ startY: yPos + 10, head: [['Sana', 'Kategoriya', 'Tur', 'Summa']], body: tableData, theme: 'striped', headStyles: { fillColor: [30, 41, 59] }, styles: { fontSize: 9 }, columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }, didParseCell: function (data) { if (data.section === 'body' && data.column.index === 3) { const raw = tableData[data.row.index][3]; data.cell.styles.textColor = raw.startsWith('+') ? [16, 185, 129] : [239, 68, 68]; } } });
    const receipts = data.filter(t => t.receipt || t.receipt_url);
    if (receipts.length > 0) {
        doc.addPage(); let rY = 20; doc.setFontSize(16); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text("Biriktirilgan Cheklar", 14, rY); rY += 15; doc.setDrawColor(200); doc.line(14, rY - 5, pageWidth - 14, rY - 5);
        receipts.forEach(t => {
            if (rY > 250) { doc.addPage(); rY = 20; }
            doc.setFontSize(10); doc.setTextColor(50); doc.text(`${new Date(t.dateMs).toLocaleDateString()} - ${t.category}: ${formatNumber(t.amount)}`, 14, rY);
            if (t.receipt) { try { doc.addImage(t.receipt, 'JPEG', 14, rY + 5, 40, 50, undefined, 'FAST'); rY += 60; } catch (e) { } } else if (t.receipt_url) { doc.setTextColor(59, 130, 246); doc.textWithLink("Chekni ko'rish (Browser)", 14, rY + 10, { url: t.receipt_url }); rY += 20; }
        });
    }
    doc.save(`Hisobot_${sStr}_${eStr}.pdf`); closeModal('export-modal');
}

async function saveExchangeRate(val) {
    if (val && val > 0) {
        exchangeRate = Number(val);
        storage.set('exchangeRate', String(exchangeRate));
        vibrate('light');

        const { error } = await supabase
            .from('users')
            .upsert({ user_id: currentUserId, exchange_rate: exchangeRate }, { onConflict: 'user_id' });

        if (error) logError('saveExchangeRate', error, { currentUserId, exchangeRate });
        else logInfo('saveExchangeRate', { currentUserId, exchangeRate });
    }
}


window.addEventListener('error', (event) => {
    logError('window-error', event.error || event.message, { filename: event.filename, lineno: event.lineno, colno: event.colno });
});

window.addEventListener('unhandledrejection', (event) => {
    logError('unhandledrejection', event.reason);
});
