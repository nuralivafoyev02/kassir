// ════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════
const APP_CONFIG = window.__APP_CONFIG__ || {};
const SUPABASE_URL = APP_CONFIG.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = APP_CONFIG.SUPABASE_ANON_KEY || '';

const supabase = (SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase?.createClient)
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const tg = window.Telegram?.WebApp || { expand: () => {}, initDataUnsafe: {} };
tg.expand?.();

// ════════════════════════════════════════
// STORAGE (localStorage wrapper)
// ════════════════════════════════════════
const storage = {
    get(key, fallback = null) {
        try { const v = localStorage.getItem(key); return v ?? fallback; }
        catch { return fallback; }
    },
    set(key, value) {
        try { localStorage.setItem(key, String(value)); return true; }
        catch { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); return true; }
        catch { return false; }
    },
};

// ════════════════════════════════════════
// USER ID
// ════════════════════════════════════════
function resolveCurrentUserId() {
    const params = new URLSearchParams(window.location.search);
    const fromTelegram = Number(tg.initDataUnsafe?.user?.id || 0);
    const fromQuery    = Number(params.get('user_id') || 0);
    const fromStorage  = Number(storage.get('debugUserId') || 0);
    const resolved = fromTelegram || fromQuery || fromStorage || 0;
    if (fromQuery && fromQuery !== fromStorage) storage.set('debugUserId', String(fromQuery));
    return resolved;
}
const currentUserId = resolveCurrentUserId();

// ════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════
const ICONS = [
    'shopping-cart', 'zap', 'wifi', 'smartphone', 'car', 'home', 'gift',
    'coffee', 'music', 'book', 'heart', 'smile', 'star', 'briefcase',
    'credit-card', 'monitor', 'tool', 'truck', 'shopping-bag', 'banknote',
    'pill', 'shirt', 'bus',
];

// ════════════════════════════════════════
// LOGGING
// ════════════════════════════════════════
async function sendClientLog(level, scope, message = '', payload = {}) {
    try {
        await fetch('/api/client-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                level, scope, message, payload, currentUserId,
                url: window.location.href,
                userAgent: navigator.userAgent,
                tgUserId: tg.initDataUnsafe?.user?.id || null,
            }),
        });
    } catch { /* never break the app on log failure */ }
}

const logInfo  = (scope, payload = {}) => { console.log(`[WEBAPP:${scope}]`, payload); sendClientLog('info', scope, '', payload); };
const logError = (scope, error, payload = {}) => {
    const message = error?.message || String(error);
    console.error(`[WEBAPP:${scope}]`, { message, ...payload, raw: error });
    sendClientLog('error', scope, message, { ...payload, stack: error?.stack || null });
};

// ════════════════════════════════════════
// STATE
// ════════════════════════════════════════
let transactions  = [];
let allCats       = { income: [], expense: [] };
let pin           = storage.get('pin');
let bioEnabled    = storage.get('bio') === 'true';
let exchangeRate  = Number(storage.get('exchangeRate') || 12850);
let activeType    = 'all';
let activeDate    = 'all';
let draft         = { receipt: null, rawFile: null };
let selId         = null;
let selIcon       = 'circle';
let pinInput      = '';
let pinStep       = 'unlock';
let tempPin       = '';
let selCatIndex   = null;
let selCatType    = null;
let isBiometricAvailable = false;
let dashboardCurrency = 'UZS';
let inputCurrency     = 'UZS';

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════
function safeCreateIcons() {
    try { window.lucide?.createIcons?.(); } catch (e) { logError('lucide.createIcons', e); }
}

const toIsoString = (value = Date.now()) => new Date(value).toISOString();

const toDateMs = (value) => {
    if (typeof value === 'number') return value;
    const p = new Date(value).getTime();
    return Number.isFinite(p) ? p : Date.now();
};

const normalizeTransactionRecord = (r) => ({
    ...r,
    amount: Number(r.amount) || 0,
    dateMs: toDateMs(r.date),
    receipt_url: r.receipt_url || null,
});

const normalizeTransactions = (rows = []) => rows.map(normalizeTransactionRecord);

function formatNumber(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return '0';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(num);
}

function vibrate(style = 'light') {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

// ════════════════════════════════════════
// SHELL REVEAL
// ════════════════════════════════════════
function revealAppShell() {
    const skeleton  = document.getElementById('dashboard-skeleton');
    const dashboard = document.getElementById('view-dashboard');
    if (skeleton)  skeleton.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
}

async function detectBiometricAvailability() {
    try {
        if (!window.isSecureContext) return false;
        if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
        return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { return false; }
}

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    try {
        safeCreateIcons();
        isBiometricAvailable = await detectBiometricAvailability();

        if (pin) showPinScreen('unlock');
        if (storage.get('theme') === 'light') toggleTheme(true);

        // Populate icon selector
        const ic = document.getElementById('icon-selector');
        if (ic) {
            ICONS.forEach(i => {
                const d = document.createElement('div');
                d.className = 'p-2 rounded-lg bg-slate-700 flex items-center justify-center cursor-pointer icon-opt transition-all';
                d.innerHTML = `<i data-lucide="${i}" class="w-5 h-5 text-slate-300 pointer-events-none"></i>`;
                d.onclick = () => {
                    document.querySelectorAll('.icon-opt').forEach(e => e.classList.remove('selected'));
                    d.classList.add('selected');
                    selIcon = i;
                };
                ic.appendChild(d);
            });
            safeCreateIcons();
        }

        window.addEventListener('click', () => {
            document.getElementById('cat-context-menu')?.classList.add('hidden');
        });

        if (!supabase)       throw new Error('SUPABASE_URL yoki SUPABASE_ANON_KEY sozlanmagan.');
        if (!currentUserId)  throw new Error("Telegram user_id topilmadi. URLga ?user_id=123 qo'shing.");

        await fetchInitialData();

        logInfo('boot-ready', { currentUserId, transactions: transactions.length });

    } catch (e) {
        logError('boot-failed', e, { currentUserId });
    } finally {
        revealAppShell();
        try { updateUI(); } catch (e) { logError('updateUI-after-boot', e); }
        try { updateSettingsUI(); } catch (e) { logError('updateSettingsUI-after-boot', e); }
        document.getElementById('nav-dashboard')?.classList.add('active');
        safeCreateIcons();
    }

    // ── Swipe on balance card ──
    const card = document.getElementById('balance-card');
    if (card) {
        let startX = 0;
        const onStart = x => { startX = x; };
        const onEnd   = x => handleBalanceSwipe(startX, x);

        card.addEventListener('touchstart',  e => onStart(e.changedTouches[0].screenX), { passive: true });
        card.addEventListener('touchend',    e => onEnd(e.changedTouches[0].screenX), { passive: true });
        card.addEventListener('mousedown',   e => onStart(e.clientX));
        card.addEventListener('mouseup',     e => onEnd(e.clientX));
    }
});

function handleBalanceSwipe(start, end) {
    const diff = start - end;
    if (Math.abs(diff) < 50) return;
    if (diff > 0 && dashboardCurrency === 'UZS') setDashboardCurrency('USD');
    if (diff < 0 && dashboardCurrency === 'USD') setDashboardCurrency('UZS');
}

function setDashboardCurrency(curr) {
    if (curr === dashboardCurrency) return;
    dashboardCurrency = curr;
    vibrate('medium');
    const swiper = document.getElementById('balance-swiper');
    if (swiper) {
        swiper.style.transform = curr === 'USD' ? 'translateX(-10px)' : 'translateX(10px)';
        setTimeout(() => { swiper.style.transform = 'translateX(0)'; }, 150);
    }
    document.getElementById('dot-uzs')?.classList.toggle('active', curr === 'UZS');
    document.getElementById('dot-usd')?.classList.toggle('active', curr === 'USD');
    updateUI();
}

// ════════════════════════════════════════
// BACKEND / SUPABASE
// ════════════════════════════════════════
async function ensureUserProfile() {
    const { error } = await supabase.from('users').upsert({
        user_id: currentUserId,
        full_name: [tg.initDataUnsafe?.user?.first_name, tg.initDataUnsafe?.user?.last_name]
            .filter(Boolean).join(' ').trim() || `User ${currentUserId}`,
        exchange_rate: Number(exchangeRate) || 12850,
    }, { onConflict: 'user_id' });
    if (error) throw error;
}

async function fetchInitialData() {
    await ensureUserProfile();

    // Fetch exchange rate from DB
    const { data: userData, error: uError } = await supabase
        .from('users').select('exchange_rate').eq('user_id', currentUserId).maybeSingle();
    if (uError) logError('fetch-user', uError, { currentUserId });
    if (userData?.exchange_rate) {
        exchangeRate = Number(userData.exchange_rate) || exchangeRate;
        storage.set('exchangeRate', String(exchangeRate));
    }

    // Fetch transactions
    const { data: tData, error: tError } = await supabase
        .from('transactions').select('*').eq('user_id', currentUserId).order('date', { ascending: false });
    if (tError) throw tError;
    transactions = normalizeTransactions(tData || []);

    // Fetch categories
    const { data: cData, error: cError } = await supabase
        .from('categories').select('*').eq('user_id', currentUserId).order('name', { ascending: true });
    if (cError) throw cError;

    if (!cData || cData.length === 0) {
        await initDefaultCategories();
    } else {
        allCats.income  = cData.filter(c => c.type === 'income');
        allCats.expense = cData.filter(c => c.type === 'expense');
    }

    logInfo('fetchInitialData', {
        currentUserId,
        transactions: transactions.length,
        incomeCategories:  allCats.income.length,
        expenseCategories: allCats.expense.length,
        exchangeRate,
    });
}

async function initDefaultCategories() {
    const defaults = [
        { name: 'Oylik',      icon: 'banknote',      type: 'income'  },
        { name: 'Bonus',      icon: 'gift',           type: 'income'  },
        { name: 'Sotuv',      icon: 'shopping-bag',   type: 'income'  },
        { name: 'Oziq-ovqat', icon: 'shopping-cart',  type: 'expense' },
        { name: 'Transport',  icon: 'bus',             type: 'expense' },
        { name: 'Kafe',       icon: 'coffee',          type: 'expense' },
    ].map(c => ({ ...c, user_id: currentUserId }));

    const { data, error } = await supabase.from('categories').insert(defaults).select();
    if (error) throw error;
    allCats.income  = (data || []).filter(c => c.type === 'income');
    allCats.expense = (data || []).filter(c => c.type === 'expense');
}

// ════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════
function switchTab(t) {
    vibrate('light');
    ['dashboard', 'bot', 'history'].forEach(v => {
        document.getElementById(`view-${v}`)?.classList.add('hidden');
    });
    document.getElementById(`view-${t}`)?.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

    const botBtn = document.getElementById('nav-bot');
    if (botBtn) {
        botBtn.classList.remove('active');
        const icon = botBtn.querySelector('i');
        if (icon) { icon.classList.remove('text-blue-500'); icon.classList.add('text-white'); }
    }

    if (t === 'bot') {
        botBtn?.classList.add('active');
        const icon = botBtn?.querySelector('i');
        if (icon) { icon.classList.remove('text-white'); icon.classList.add('text-blue-500'); }
    } else {
        document.getElementById(`nav-${t}`)?.classList.add('active');
    }

    if (t === 'dashboard') updateUI();
    safeCreateIcons();
}

// ════════════════════════════════════════
// CATEGORIES
// ════════════════════════════════════════
let longPressTimer;
function handleCatPressStart(e, idx, type) { longPressTimer = setTimeout(() => showCatOptions(e, idx, type), 500); }
function handleCatPressEnd() { clearTimeout(longPressTimer); }

function showCatOptions(e, idx, type) {
    e.preventDefault();
    selCatIndex = idx; selCatType = type;
    const menu = document.getElementById('cat-context-menu');
    if (!menu) return;
    const x = e.clientX || e.touches?.[0]?.clientX || 0;
    const y = e.clientY || e.touches?.[0]?.clientY || 0;
    menu.style.left = `${Math.min(x, window.innerWidth  - 170)}px`;
    menu.style.top  = `${Math.min(y, window.innerHeight - 100)}px`;
    menu.classList.remove('hidden');
}

function editCatFromMenu() {
    const cat = allCats[selCatType]?.[selCatIndex];
    if (!cat) return;
    const inp = document.getElementById('edit-cat-name-input');
    if (inp) inp.value = cat.name;
    document.getElementById('edit-cat-modal')?.classList.remove('hidden');
    document.getElementById('cat-context-menu')?.classList.add('hidden');
}

async function confirmEditCat() {
    const newName = document.getElementById('edit-cat-name-input')?.value.trim();
    if (!newName) return;
    const cat = allCats[selCatType]?.[selCatIndex];
    if (!cat) return;

    allCats[selCatType][selCatIndex] = { ...cat, name: newName };
    renderBotCats(selCatType);
    closeModal('edit-cat-modal');

    const q = supabase.from('categories').update({ name: newName }).eq('user_id', currentUserId);
    const { error } = cat.id ? await q.eq('id', cat.id) : await q.eq('name', cat.name).eq('type', selCatType);
    if (error) logError('confirmEditCat', error);
}

async function deleteCatFromMenu() {
    if (!confirm("Bu kategoriyani o'chirasizmi?")) return;
    const cat = allCats[selCatType]?.[selCatIndex];
    if (!cat) return;

    allCats[selCatType].splice(selCatIndex, 1);
    renderBotCats(selCatType);
    document.getElementById('cat-context-menu')?.classList.add('hidden');

    const q = supabase.from('categories').delete().eq('user_id', currentUserId);
    const { error } = cat.id ? await q.eq('id', cat.id) : await q.eq('name', cat.name).eq('type', selCatType);
    if (error) logError('deleteCatFromMenu', error);
}

// ════════════════════════════════════════
// PIN SYSTEM
// ════════════════════════════════════════
function showPinScreen(step) {
    pinStep  = step;
    pinInput = '';
    updatePinDots();
    document.getElementById('pin-screen')?.classList.remove('hidden');

    const t        = document.getElementById('pin-title');
    const s        = document.getElementById('pin-subtitle');
    const cancel   = document.getElementById('cancel-pin-setup');
    const bioBtn   = document.getElementById('bio-btn');
    const bioPlace = document.getElementById('bio-placeholder');

    if (step === 'unlock') {
        if (t) t.innerText = 'PIN Kod';
        if (s) s.innerText = 'Kirish uchun';
        cancel?.classList.add('hidden');
        if (bioEnabled && isBiometricAvailable) {
            bioBtn?.classList.remove('hidden');
            bioPlace?.classList.add('hidden');
            setTimeout(triggerBiometric, 300);
        } else {
            bioBtn?.classList.add('hidden');
            bioPlace?.classList.remove('hidden');
        }
    } else if (step === 'setup_old') {
        if (t) t.innerText = 'Eski PIN';
        if (s) s.innerText = 'Tasdiqlash uchun';
        cancel?.classList.remove('hidden');
        bioBtn?.classList.add('hidden');
        bioPlace?.classList.remove('hidden');
    } else if (step === 'setup_new') {
        if (t) t.innerText = 'Yangi PIN';
        if (s) s.innerText = "4 xonali kod o'rnating";
        cancel?.classList.remove('hidden');
        bioBtn?.classList.add('hidden');
        bioPlace?.classList.remove('hidden');
    } else if (step === 'setup_confirm') {
        if (t) t.innerText = 'Qayta kiritish';
        if (s) s.innerText = 'Yangi PINni tasdiqlang';
        cancel?.classList.remove('hidden');
    }
}

function handlePinInput(n) {
    vibrate('medium');
    if (pinInput.length < 4) {
        pinInput += n;
        updatePinDots();
        if (pinInput.length === 4) setTimeout(checkPin, 200);
    }
}

function handlePinDelete() {
    pinInput = pinInput.slice(0, -1);
    updatePinDots();
}

function updatePinDots() {
    document.querySelectorAll('.pin-dot').forEach((d, i) => {
        if (i < pinInput.length) {
            d.classList.add('bg-blue-500', 'active', 'scale-110');
        } else {
            d.classList.remove('bg-blue-500', 'active', 'scale-110');
        }
    });
}

function checkPin() {
    const dots = document.getElementById('pin-dots');
    const shake = () => {
        dots?.classList.add('shake');
        setTimeout(() => { dots?.classList.remove('shake'); pinInput = ''; updatePinDots(); }, 450);
    };

    if (pinStep === 'unlock') {
        if (pinInput === pin) document.getElementById('pin-screen')?.classList.add('hidden');
        else shake();
    } else if (pinStep === 'setup_old') {
        if (pinInput === pin) showPinScreen('setup_new');
        else shake();
    } else if (pinStep === 'setup_new') {
        tempPin = pinInput;
        showPinScreen('setup_confirm');
    } else if (pinStep === 'setup_confirm') {
        if (pinInput === tempPin) {
            pin = tempPin;
            localStorage.setItem('pin', pin);
            document.getElementById('pin-screen')?.classList.add('hidden');
            updateSettingsUI();
            alert("PIN o'zgartirildi! ✅");
            closeModal('settings-modal');
        } else {
            alert('Mos kelmadi!');
            showPinScreen('setup_new');
        }
    }
}

async function triggerBiometric() {
    if (!isBiometricAvailable) return;
    try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        await navigator.credentials.get({ publicKey: { challenge, timeout: 60000, userVerification: 'required' } });
        document.getElementById('pin-screen')?.classList.add('hidden');
    } catch { /* user cancelled */ }
}

function startPinSetup() { pin ? showPinScreen('setup_old') : showPinScreen('setup_new'); }
function cancelPinSetup() { document.getElementById('pin-screen')?.classList.add('hidden'); }
function toggleBiometric(el) { bioEnabled = el.checked; storage.set('bio', bioEnabled); }

function removePin() {
    if (!confirm("PIN kodni olib tashlaysizmi?")) return;
    storage.remove('pin');
    pin = null;
    updateSettingsUI();
    alert('PIN kod olib tashlandi.');
    closeModal('settings-modal');
}

// ════════════════════════════════════════
// RECEIPT UPLOAD
// ════════════════════════════════════════
function handleReceiptUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    draft.rawFile = file;
    const reader = new FileReader();
    reader.onload = (ev) => {
        const img = new Image();
        img.src = ev.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx    = canvas.getContext('2d');
            const maxW   = 800;
            const scale  = Math.min(1, maxW / img.width);
            canvas.width  = img.width  * scale;
            canvas.height = img.height * scale;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            draft.receipt = canvas.toDataURL('image/jpeg', 0.7);
            const prev = document.getElementById('receipt-img-preview');
            const area = document.getElementById('receipt-preview-area');
            if (prev) prev.src = draft.receipt;
            area?.classList.remove('hidden');
        };
    };
    reader.readAsDataURL(file);
}

async function uploadReceipt(file) {
    const fileName = `${currentUserId}/${Date.now()}-${file.name || 'receipt'}.jpg`;
    const { error } = await supabase.storage
        .from('receipts').upload(fileName, file, { upsert: false, contentType: file.type || 'image/jpeg' });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
    return publicUrl;
}

function clearReceipt() {
    draft.receipt = null;
    draft.rawFile = null;
    const fu = document.getElementById('file-upload');
    if (fu) fu.value = '';
    document.getElementById('receipt-preview-area')?.classList.add('hidden');
}

function viewReceipt(src) {
    const img = document.getElementById('full-receipt-image');
    if (img) img.src = src;
    document.getElementById('receipt-modal')?.classList.remove('hidden');
}

function closeReceiptModal() {
    document.getElementById('receipt-modal')?.classList.add('hidden');
}

// ════════════════════════════════════════
// CORE UI
// ════════════════════════════════════════
function updateUI() {
    const { s, e } = getDateRange();
    transactions = normalizeTransactions(transactions).sort((a, b) => b.dateMs - a.dateMs);

    const dateFiltered = transactions.filter(t => t.dateMs >= s && t.dateMs <= e);
    const filtered     = activeType === 'all' ? dateFiltered : dateFiltered.filter(t => t.type === activeType);

    const incBase = filtered.filter(t => t.type === 'income' ).reduce((a, b) => a + b.amount, 0);
    const expBase = filtered.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const balBase = incBase - expBase;

    if (dashboardCurrency === 'USD' && exchangeRate > 0) {
        document.getElementById('total-balance').innerText = `$ ${formatNumber(balBase / exchangeRate)}`;
        document.getElementById('total-income' ).innerText = `+$ ${formatNumber(incBase / exchangeRate)}`;
        document.getElementById('total-expense').innerText = `-$ ${formatNumber(expBase / exchangeRate)}`;
        const badge = document.getElementById('currency-badge');
        if (badge) { badge.innerText = 'USD'; badge.className = 'text-[10px] bg-blue-500 px-2 py-0.5 rounded-full text-white font-mono tracking-wider'; }
    } else {
        document.getElementById('total-balance').innerText = `${formatNumber(balBase)} so'm`;
        document.getElementById('total-income' ).innerText = `+${formatNumber(incBase)}`;
        document.getElementById('total-expense').innerText = `-${formatNumber(expBase)}`;
        const badge = document.getElementById('currency-badge');
        if (badge) { badge.innerText = 'UZS'; badge.className = 'text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-white font-mono tracking-wider'; }
    }

    // Type filter card highlight
    document.getElementById('card-income').className  =
        `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'income' ? 'bg-emerald-500/20 border-emerald-500' : 'hover:bg-emerald-500/10'}`;
    document.getElementById('card-expense').className =
        `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'expense' ? 'bg-rose-500/20 border-rose-500' : 'hover:bg-rose-500/10'}`;

    updateTrendWidgets();
    renderCharts(filtered);
    renderHistory();
}

function updateTrendWidgets() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const lastMonthEnd   = thisMonthStart - 1;

    const group = arr => arr.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + t.amount;
        return acc;
    }, {});

    const curr = group(transactions.filter(t => t.dateMs >= thisMonthStart && t.type === 'expense'));
    const prev = group(transactions.filter(t => t.dateMs >= lastMonthStart && t.dateMs <= lastMonthEnd && t.type === 'expense'));

    const cats = [...new Set([...Object.keys(curr), ...Object.keys(prev)])];
    const container = document.getElementById('trend-container');
    const list      = document.getElementById('trend-list');
    if (!list) return;

    let html = '';
    cats.forEach(c => {
        const cVal = curr[c] || 0;
        const pVal = prev[c] || 0;
        if (pVal > 0 && cVal > 0) {
            const pct = ((cVal - pVal) / pVal) * 100;
            if (Math.abs(pct) > 5) {
                const isBad  = pct > 0;
                const color  = isBad ? 'text-rose-400' : 'text-emerald-400';
                const icon   = isBad ? 'trending-up' : 'trending-down';
                html += `<div class="glass-panel p-3 rounded-xl flex justify-between items-center">
                    <div>
                        <div class="text-xs text-slate-400">${c}</div>
                        <div class="font-bold text-sm text-white">${formatNumber(cVal)}</div>
                    </div>
                    <div class="text-right">
                        <div class="${color} font-bold text-xs flex items-center gap-1 justify-end">
                            <i data-lucide="${icon}" class="w-3 h-3"></i> ${Math.round(Math.abs(pct))}%
                        </div>
                        <div class="text-xs text-slate-500">o'tgan oy</div>
                    </div>
                </div>`;
            }
        }
    });

    container?.classList.toggle('hidden', !html);
    list.innerHTML = html || `<div class="col-span-2 text-center text-xs text-slate-500 py-2">Trendlar uchun ma'lumot yetarli emas</div>`;
    if (html) safeCreateIcons();
}

function renderCharts(data) {
    const canvas  = document.getElementById('categoryChart');
    const noData  = document.getElementById('no-data-msg');
    const list    = document.getElementById('top-transaction-list');

    if (!canvas || typeof window.Chart === 'undefined') {
        noData?.classList.remove('hidden');
        if (list) list.innerHTML = '';
        return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) { noData?.classList.remove('hidden'); return; }

    const source = activeType === 'income'
        ? data.filter(x => x.type === 'income')
        : data.filter(x => x.type === 'expense');

    noData?.classList.toggle('hidden', source.length > 0);

    const cats = {};
    source.forEach(x => { cats[x.category] = (cats[x.category] || 0) + x.amount; });

    if (window.myChart) { window.myChart.destroy(); window.myChart = null; }

    if (source.length === 0) { if (list) list.innerHTML = ''; return; }

    window.myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(cats),
            datasets: [{
                data: Object.values(cats),
                backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4'],
                borderWidth: 0,
                hoverOffset: 4,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: { legend: { display: false } },
        },
    });

    if (!list) return;
    list.innerHTML = Object.entries(cats)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([c, a]) => `
            <tr>
                <td class="py-2 text-slate-300 capitalize pl-1 text-sm">${c}</td>
                <td class="text-right font-bold pr-1 text-sm ${activeType === 'income' ? 'text-emerald-400' : 'text-rose-400'}">${formatNumber(a)}</td>
            </tr>`)
        .join('');
}

function renderHistory() {
    const list       = document.getElementById('history-list');
    const emptyState = document.getElementById('empty-history');
    if (!list) return;

    list.innerHTML = '';
    emptyState?.classList.toggle('hidden', transactions.length > 0);

    transactions.forEach(t => {
        const isInc      = t.type === 'income';
        const hasReceipt = t.receipt || t.receipt_url;
        const badge      = hasReceipt
            ? `<span class="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 inline-flex items-center gap-0.5">
                   <i data-lucide="paperclip" class="w-2 h-2"></i> Chek
               </span>`
            : '';
        list.innerHTML += `
            <div onclick="openActionSheet(event,${t.id})"
                class="glass-panel p-4 rounded-2xl flex justify-between items-center cursor-pointer active:scale-95 transition-transform hover:bg-slate-800/50">
                <div class="flex items-center gap-3">
                    <div class="p-2.5 rounded-full flex-none ${isInc ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}">
                        <i data-lucide="${isInc ? 'arrow-down-left' : 'arrow-up-right'}" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <div class="font-semibold text-sm text-white capitalize flex items-center flex-wrap gap-1">
                            ${t.category}${badge}
                        </div>
                        <div class="text-xs text-slate-400 mt-0.5">
                            ${new Date(t.dateMs).toLocaleDateString()} &bull;
                            ${new Date(t.dateMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>
                <div class="font-bold ${isInc ? 'text-emerald-400' : 'text-rose-400'} text-base flex-none">
                    ${isInc ? '+' : '-'}${formatNumber(t.amount)}
                </div>
            </div>`;
    });
    safeCreateIcons();
}

// ════════════════════════════════════════
// BOT FLOW
// ════════════════════════════════════════
function startBotFlow(type) {
    draft = { type, category: '', amount: 0, receipt: null, rawFile: null };
    clearReceipt();
    document.getElementById('bot-start-actions')?.classList.add('hidden');
    document.getElementById('category-selector')?.classList.remove('hidden');
    renderBotCats(type);
}

function renderBotCats(type) {
    const grid = document.getElementById('category-grid');
    if (!grid) return;
    grid.innerHTML = '';
    allCats[type].forEach((c, idx) => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn flex flex-col items-center justify-center p-3 rounded-2xl bg-slate-800 border border-slate-700 hover:border-blue-500 transition-all active:scale-95';
        btn.innerHTML = `
            <i data-lucide="${c.icon}" class="w-6 h-6 mb-1 ${type === 'income' ? 'text-emerald-400' : 'text-rose-400'} pointer-events-none"></i>
            <span class="text-[10px] text-slate-300 truncate w-full text-center pointer-events-none">${c.name}</span>`;
        btn.onclick = () => {
            vibrate('light');
            draft.category = c.name;
            document.getElementById('category-selector')?.classList.add('hidden');
            document.getElementById('bot-input-container')?.classList.remove('hidden');
            document.getElementById('bot-input')?.focus();
        };
        btn.oncontextmenu = e => { e.preventDefault(); showCatOptions(e, idx, type); };
        btn.ontouchstart  = e => handleCatPressStart(e, idx, type);
        btn.ontouchend    = () => handleCatPressEnd();
        grid.appendChild(btn);
    });
    safeCreateIcons();
}

// ════════════════════════════════════════
// CURRENCY TOGGLE (BOT INPUT)
// ════════════════════════════════════════
function toggleInputCurrency() {
    vibrate('light');
    const btn = document.getElementById('currency-toggle');
    const inp = document.getElementById('bot-input');
    if (inputCurrency === 'UZS') {
        inputCurrency = 'USD';
        if (btn) { btn.innerText = 'USD'; btn.classList.replace('text-emerald-400', 'text-blue-400'); btn.classList.replace('border-emerald-500/30', 'border-blue-500/30'); }
        if (inp) inp.placeholder = 'Necha dollar?';
    } else {
        inputCurrency = 'UZS';
        if (btn) { btn.innerText = 'UZS'; btn.classList.replace('text-blue-400', 'text-emerald-400'); btn.classList.replace('border-blue-500/30', 'border-emerald-500/30'); }
        if (inp) inp.placeholder = 'Summani kiriting...';
    }
}

// ════════════════════════════════════════
// SUBMIT TRANSACTION
// ════════════════════════════════════════
async function submitBotInput() {
    vibrate('heavy');
    const raw = document.getElementById('bot-input')?.value || '';
    const val = parseFloat(raw.replace(/[^0-9.]/g, ''));
    if (!val) return;

    let finalAmount = val;
    let note = '';
    if (inputCurrency === 'USD') {
        finalAmount = Math.round(val * exchangeRate);
        note = ` ($${val})`;
    }

    let finalReceiptUrl = null;
    if (draft.rawFile) {
        try { finalReceiptUrl = await uploadReceipt(draft.rawFile); }
        catch { alert('Rasm yuklanmadi, lekin tranzaksiya saqlanadi.'); }
    }

    const newTrans = {
        user_id:     currentUserId,
        amount:      Math.round(finalAmount),
        category:    `${draft.category}${note}`,
        type:        draft.type,
        date:        toIsoString(),
        receipt_url: finalReceiptUrl,
    };

    const tempId = Date.now();
    transactions.unshift(normalizeTransactionRecord({ ...newTrans, id: tempId, receipt: draft.receipt }));
    updateUI();

    const botInput = document.getElementById('bot-input');
    if (botInput) botInput.value = '';
    if (inputCurrency === 'USD') toggleInputCurrency();
    cancelBotFlow();

    const chat = document.getElementById('chat-messages');
    if (chat) {
        chat.innerHTML += `
            <div class="msg-wrapper ai fade-in">
                <div class="msg-bubble ai border-l-4 ${draft.type === 'income' ? 'border-l-emerald-500' : 'border-l-rose-500'}">
                    ✅ Saqlandi: <b>${formatNumber(finalAmount)} so'm</b>${draft.receipt ? ' 📎' : ''}<br>
                    <span class="text-xs opacity-60">${draft.category}${note}</span>
                </div>
            </div>`;
        setTimeout(() => { chat.scrollTop = chat.scrollHeight; }, 100);
    }

    const localReceipt = draft.receipt;
    draft = { receipt: null, rawFile: null };

    const { data, error } = await supabase.from('transactions').insert([newTrans]).select().single();
    if (error) {
        transactions = transactions.filter(t => t.id !== tempId);
        updateUI();
        logError('submitBotInput', error, { currentUserId, amount: newTrans.amount });
        alert("Saqlashda xatolik bo'ldi.");
        return;
    }

    const idx = transactions.findIndex(t => t.id === tempId);
    if (idx !== -1) transactions[idx] = normalizeTransactionRecord({ ...transactions[idx], ...data, receipt: localReceipt });
    logInfo('submitBotInput', { currentUserId, transactionId: data.id, amount: data.amount });
}

function cancelBotFlow() {
    document.getElementById('bot-input-container')?.classList.add('hidden');
    document.getElementById('category-selector')?.classList.add('hidden');
    document.getElementById('bot-start-actions')?.classList.remove('hidden');
    clearReceipt();
}

// ════════════════════════════════════════
// FILTERS
// ════════════════════════════════════════
function toggleTypeFilter(t) {
    vibrate('soft');
    activeType = activeType === t ? 'all' : t;
    updateUI();
}

function setDateFilter(f) {
    vibrate('soft');
    activeDate = f;
    document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('filter-active'));
    document.querySelector(`[data-filter="${f}"]`)?.classList.add('filter-active');
    updateUI();
}

function getDateRange() {
    const now = new Date();
    let s = 0;
    let e = new Date().setHours(23, 59, 59, 999);
    if (activeDate === 'week')  s = now.getTime() - 7 * 86400000;
    else if (activeDate === 'month') s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    else if (activeDate === 'custom') {
        s = new Date(document.getElementById('start-date')?.value || 0).getTime();
        e = new Date(document.getElementById('end-date')?.value  || Date.now()).getTime() + 86400000;
    }
    return { s, e };
}

function openDateRangeModal() { activeDate = 'custom'; document.getElementById('date-range-modal')?.classList.remove('hidden'); }
function applyDateRange() { updateUI(); closeModal('date-range-modal'); }

// ════════════════════════════════════════
// MODALS
// ════════════════════════════════════════
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function openActionSheet(e, id) {
    if (e) e.stopPropagation();
    selId = id;
    const t = transactions.find(x => x.id === id);
    if (!t) return;
    const c = document.getElementById('action-sheet-content');
    if (!c) return;
    c.innerHTML = '';
    if (t.receipt_url || t.receipt) {
        c.innerHTML += `<button onclick="viewCurrentReceipt()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-emerald-400 font-medium">
            <i data-lucide="file-text" class="w-5 h-5"></i> Chekni ko'rish</button>`;
    }
    c.innerHTML += `
        <button onclick="handleEdit()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-blue-400 font-medium">
            <i data-lucide="edit-3" class="w-5 h-5"></i> Tahrirlash</button>
        <button onclick="handleDeleteConfirm()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-rose-400 font-medium">
            <i data-lucide="trash-2" class="w-5 h-5"></i> O'chirish</button>`;
    document.getElementById('action-sheet')?.classList.remove('hidden');
    safeCreateIcons();
}

function viewCurrentReceipt() {
    const t = transactions.find(x => x.id === selId);
    if (t) viewReceipt(t.receipt_url || t.receipt);
    closeActionSheet(null);
}

function closeActionSheet(e) {
    if (e && !e.target.closest('.bg-slate-800') && e.target.id !== 'action-sheet') return;
    document.getElementById('action-sheet')?.classList.add('hidden');
}

function handleDeleteConfirm() { closeActionSheet(null); document.getElementById('delete-modal')?.classList.remove('hidden'); }

async function confirmDelete() {
    const id = selId;
    transactions = transactions.filter(t => t.id !== id);
    updateUI();
    closeModal('delete-modal');
    const { error } = await supabase.from('transactions').delete().eq('id', id).eq('user_id', currentUserId);
    if (error) logError('confirmDelete', error, { currentUserId, id });
}

function handleEdit() {
    closeActionSheet(null);
    const t = transactions.find(x => x.id === selId);
    if (!t) return;
    const cat = document.getElementById('edit-category');
    const amt = document.getElementById('edit-amount');
    const typ = document.getElementById('edit-type');
    if (cat) cat.value = t.category;
    if (amt) amt.value = t.amount;
    if (typ) typ.value = t.type;
    document.getElementById('edit-modal')?.classList.remove('hidden');
}

async function saveEdit() {
    const c  = document.getElementById('edit-category')?.value;
    const a  = Number(document.getElementById('edit-amount')?.value);
    const tp = document.getElementById('edit-type')?.value;
    if (c && a) {
        const i = transactions.findIndex(x => x.id === selId);
        if (i !== -1) {
            transactions[i] = { ...transactions[i], category: c, amount: a, type: tp };
            updateUI();
            const { error } = await supabase.from('transactions')
                .update({ category: c, amount: a, type: tp })
                .eq('id', selId).eq('user_id', currentUserId);
            if (error) logError('saveEdit', error, { currentUserId, selId });
        }
    }
    closeModal('edit-modal');
}

// ════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════
function openSettings() { updateSettingsUI(); document.getElementById('settings-modal')?.classList.remove('hidden'); }

function updateSettingsUI() {
    const pinText  = document.getElementById('pin-status-text');
    const bioTog   = document.getElementById('bio-toggle');
    const removeBtn = document.getElementById('btn-remove-pin');
    const bioRow   = document.getElementById('bio-row');
    const rateInp  = document.getElementById('exchange-rate-input');

    if (pinText)  pinText.innerText = pin ? 'Faol ✅' : "O'rnatilmagan";
    if (bioTog)   bioTog.checked = bioEnabled;
    if (removeBtn) removeBtn.classList.toggle('hidden', !pin);
    if (bioRow)   bioRow.classList.toggle('hidden', !isBiometricAvailable);
    if (rateInp)  rateInp.value = exchangeRate;
}

async function saveExchangeRate(val) {
    const num = Number(val);
    if (!num || num <= 0) return;
    exchangeRate = num;
    storage.set('exchangeRate', String(exchangeRate));
    vibrate('light');
    const { error } = await supabase.from('users')
        .upsert({ user_id: currentUserId, exchange_rate: exchangeRate }, { onConflict: 'user_id' });
    if (error) logError('saveExchangeRate', error, { currentUserId, exchangeRate });
    else logInfo('saveExchangeRate', { currentUserId, exchangeRate });
}

// ════════════════════════════════════════
// THEME
// ════════════════════════════════════════
function toggleTheme(forceValue) {
    const isLight = typeof forceValue === 'boolean' ? forceValue : !document.body.classList.contains('light-mode');
    document.body.classList.toggle('light-mode', isLight);
    storage.set('theme', isLight ? 'light' : 'dark');
    safeCreateIcons();
}

// ════════════════════════════════════════
// CATEGORY MODAL
// ════════════════════════════════════════
function openAddCategoryModal() { document.getElementById('add-cat-modal')?.classList.remove('hidden'); }

async function saveNewCategory() {
    const n = document.getElementById('new-cat-name')?.value.trim();
    if (!n || !draft.type) return;

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
    const inp = document.getElementById('new-cat-name');
    if (inp) inp.value = '';
    selIcon = 'circle';
}

// ════════════════════════════════════════
// EXPORT / IMPORT
// ════════════════════════════════════════
function exportData() {
    const blob = new Blob([JSON.stringify({ transactions, allCats, pin, bio: bioEnabled }, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `backup_kassa_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const backup = JSON.parse(ev.target.result);
            if (backup.pin) storage.set('pin', backup.pin);
            if (backup.bio !== undefined) storage.set('bio', backup.bio);

            if (Array.isArray(backup.transactions) && backup.transactions.length > 0) {
                const newTrans = backup.transactions.map(({ id, dateMs, receipt, ...rest }) => ({
                    ...rest,
                    user_id: currentUserId,
                    date: toIsoString(rest.date || dateMs || Date.now()),
                }));
                const { error } = await supabase.from('transactions').insert(newTrans);
                if (error) throw error;
            }

            if (backup.allCats) {
                const cats = [
                    ...(backup.allCats.income  || []),
                    ...(backup.allCats.expense || []),
                ].map(({ id, created_at, ...rest }) => ({ ...rest, user_id: currentUserId }));
                if (cats.length > 0) {
                    await supabase.from('categories').upsert(cats, { onConflict: 'user_id,name,type' });
                }
            }

            alert('Muvaffaqiyatli! Dastur qayta yuklanmoqda...');
            location.reload();
        } catch (err) {
            logError('importData', err, { currentUserId });
            alert('Importda xatolik yuz berdi.');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
}

function confirmResetData() {
    if (!confirm("DIQQAT! Barcha ma'lumotlar BAZADAN o'chib ketadi. Davom etasizmi?")) return;
    transactions = [];
    updateUI();
    closeModal('settings-modal');
    supabase.from('transactions').delete().eq('user_id', currentUserId)
        .then(() => alert('Tozalandi!'));
}

// ════════════════════════════════════════
// PDF EXPORT
// ════════════════════════════════════════
function openExportModal() {
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const startEl  = document.getElementById('export-start-date');
    const endEl    = document.getElementById('export-end-date');
    if (startEl) startEl.valueAsDate = firstDay;
    if (endEl)   endEl.valueAsDate   = now;
    updateExportPreview();
    document.getElementById('export-modal')?.classList.remove('hidden');
    if (startEl) startEl.onchange = updateExportPreview;
    if (endEl)   endEl.onchange   = updateExportPreview;
}

function updateExportPreview() {
    const s = new Date(document.getElementById('export-start-date')?.value || 0).getTime();
    const e = new Date(document.getElementById('export-end-date')?.value   || Date.now()).getTime() + 86400000;
    const data     = transactions.filter(t => t.dateMs >= s && t.dateMs < e);
    const receipts = data.filter(t => t.receipt || t.receipt_url).length;
    const countEl  = document.getElementById('export-count');
    const recEl    = document.getElementById('export-receipts');
    if (countEl) countEl.innerText = `${data.length} ta operatsiya`;
    if (recEl)   recEl.innerText   = `${receipts} ta rasm`;
}

async function generatePDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) { alert('PDF kutubxonalari yuklanmagan!'); return; }

    const sStr = document.getElementById('export-start-date')?.value;
    const eStr = document.getElementById('export-end-date')?.value;
    if (!sStr || !eStr) return;

    const s    = new Date(sStr).getTime();
    const e    = new Date(eStr).getTime() + 86400000;
    const data = transactions.filter(t => t.dateMs >= s && t.dateMs < e).sort((a, b) => a.dateMs - b.dateMs);

    if (data.length === 0) { alert("Tanlangan davrda ma'lumot yo'q."); return; }

    const doc       = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageWidth, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('Mening Kassam', 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(200, 200, 200);
    doc.text('Moliyaviy hisobot', 14, 28);
    doc.text(`${sStr} — ${eStr}`, pageWidth - 14, 28, { align: 'right' });

    // Summary
    const inc = data.filter(t => t.type === 'income' ).reduce((a, b) => a + b.amount, 0);
    const exp = data.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const bal = inc - exp;
    let yPos  = 52;

    doc.setTextColor(0);
    doc.setFontSize(10);
    doc.text('Jami Kirim:',  14,  yPos); doc.setTextColor(16, 185, 129); doc.setFont('helvetica', 'bold'); doc.text(`+${formatNumber(inc)} so'm`, 42, yPos);
    doc.setTextColor(0);     doc.setFont('helvetica', 'normal');
    doc.text('Jami Chiqim:', 85,  yPos); doc.setTextColor(239, 68, 68);   doc.setFont('helvetica', 'bold'); doc.text(`-${formatNumber(exp)} so'm`, 115, yPos);
    doc.setTextColor(0);     doc.setFont('helvetica', 'normal');
    doc.text('Sof Qoldiq:',  155, yPos); doc.setTextColor(59, 130, 246);  doc.setFont('helvetica', 'bold'); doc.text(`${formatNumber(bal)} so'm`, 178, yPos);
    doc.setFont('helvetica', 'normal');

    // Table
    const tableData = data.map(t => [
        new Date(t.dateMs).toLocaleDateString(),
        t.category,
        t.type === 'income' ? 'Kirim' : 'Chiqim',
        (t.type === 'income' ? '+' : '-') + formatNumber(t.amount),
    ]);

    doc.autoTable({
        startY: yPos + 10,
        head: [['Sana', 'Kategoriya', 'Tur', 'Summa']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] },
        styles: { fontSize: 9 },
        columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
        didParseCell(data) {
            if (data.section === 'body' && data.column.index === 3) {
                const raw = tableData[data.row.index][3];
                data.cell.styles.textColor = raw.startsWith('+') ? [16, 185, 129] : [239, 68, 68];
            }
        },
    });

    // Receipts page
    const receipts = data.filter(t => t.receipt || t.receipt_url);
    if (receipts.length > 0) {
        doc.addPage();
        let rY = 20;
        doc.setFontSize(16); doc.setTextColor(0); doc.setFont('helvetica', 'bold');
        doc.text('Biriktirilgan Cheklar', 14, rY);
        rY += 12;
        doc.setDrawColor(200); doc.line(14, rY, pageWidth - 14, rY);
        rY += 8;
        receipts.forEach(t => {
            if (rY > 250) { doc.addPage(); rY = 20; }
            doc.setFontSize(10); doc.setTextColor(50); doc.setFont('helvetica', 'normal');
            doc.text(`${new Date(t.dateMs).toLocaleDateString()} — ${t.category}: ${formatNumber(t.amount)}`, 14, rY);
            if (t.receipt) {
                try { doc.addImage(t.receipt, 'JPEG', 14, rY + 4, 40, 50, undefined, 'FAST'); rY += 60; }
                catch { rY += 10; }
            } else if (t.receipt_url) {
                doc.setTextColor(59, 130, 246);
                doc.textWithLink("Chekni ko'rish (link)", 14, rY + 8, { url: t.receipt_url });
                rY += 18;
            }
        });
    }

    doc.save(`Hisobot_${sStr}_${eStr}.pdf`);
    closeModal('export-modal');
}

// ════════════════════════════════════════
// GLOBAL ERROR HANDLERS
// ════════════════════════════════════════
window.addEventListener('error', ev => {
    logError('window-error', ev.error || ev.message, { filename: ev.filename, lineno: ev.lineno });
});
window.addEventListener('unhandledrejection', ev => {
    logError('unhandledrejection', ev.reason);
});
