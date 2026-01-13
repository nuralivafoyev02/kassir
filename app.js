// --- CONFIG ---
// const SUPABASE_URL = "https://maahdpuwvaugqjfnihbu.supabase.co";
// const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hYWhkcHV3dmF1Z3FqZm5paGJ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM4ODM4NTEsImV4cCI6MjA3OTQ1OTg1MX0.ILp0bW01IMLydAuXcYXQSM6NORGG5yjJt367JsFyDm4";
// const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const tg = window.Telegram.WebApp;
tg.expand();
const currentUserId = tg.initDataUnsafe?.user?.id || 123456;
const icons = ['shopping-cart', 'zap', 'wifi', 'smartphone', 'car', 'home', 'gift', 'coffee', 'music', 'book', 'heart', 'smile', 'star', 'briefcase', 'credit-card', 'monitor', 'tool', 'truck', 'shopping-bag', 'banknote', 'pill', 'shirt'];

// --- STATE ---
let transactions = [];
let allCats = { income: [], expense: [] };
let pin = localStorage.getItem('pin');
let bioEnabled = localStorage.getItem('bio') === 'true';
// O'ZGARISH: exchangeRate shu yerda e'lon qilindi
let exchangeRate = localStorage.getItem('exchangeRate') || 12850; 
let activeType = 'all', activeDate = 'all', botState = 'idle', draft = { receipt: null, rawFile: null }, selId = null, selIcon = 'circle';
let pinInput = "", pinStep = 'unlock', tempPin = "";
let selCatIndex = null, selCatType = null;
let isBiometricAvailable = false;
let dashboardCurrency = 'UZS';
let inputCurrency = 'UZS'; // Bot uchun

// --- INIT ---
document.addEventListener('DOMContentLoaded', async () => {
    lucide.createIcons();
    isBiometricAvailable = window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    if (pin) showPinScreen('unlock');
    if (localStorage.getItem('theme') === 'light') toggleTheme(true);
    console.log("Ma'lumotlar yuklanmoqda...");
    const ic = document.getElementById('icon-selector');
    if (ic) {
        icons.forEach(i => {
            const d = document.createElement('div');
            d.className = "p-2 rounded-lg bg-slate-700 flex items-center justify-center cursor-pointer icon-opt transition-all";
            d.innerHTML = `<i data-lucide="${i}" class="w-5 h-5 text-slate-300 pointer-events-none"></i>`;
            d.onclick = () => { document.querySelectorAll('.icon-opt').forEach(e => e.classList.remove('selected')); d.classList.add('selected'); selIcon = i; };
            ic.appendChild(d);
        });
    }
    window.addEventListener('click', () => { const menu = document.getElementById('cat-context-menu'); if (menu) menu.classList.add('hidden'); });
    // Skeleton va Yuklash
    try {
        await fetchInitialData();
    } catch (e) {
        console.error("Xato:", e);
    } finally {
        setTimeout(() => {
            const skeleton = document.getElementById('dashboard-skeleton');
            const dashboard = document.getElementById('view-dashboard');
            if (skeleton) skeleton.classList.add('hidden');
            if (dashboard) {
                dashboard.classList.remove('hidden');
                updateUI();
                const navDash = document.getElementById('nav-dashboard');
                if (navDash) navDash.classList.add('active');
            }
            updateSettingsUI();
        }, 500);
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
async function fetchInitialData() {
    const { data: userData, error: uError } = await supabase
        .from('users')
        .select('exchange_rate')
        .eq('user_id', currentUserId)
        .single();
    
    if (userData && userData.exchange_rate) {
        exchangeRate = userData.exchange_rate;
        // Lokal xotirani ham yangilab qo'yamiz (zaxira uchun)
        localStorage.setItem('exchangeRate', exchangeRate); 
    }
    
    // ... Qolgan ma'lumotlarni yuklash ...
    const { data: tData, error: tError } = await supabase.from('transactions').select('*').eq('user_id', currentUserId).order('date', { ascending: false });
    if (!tError && tData) transactions = tData;

    const { data: cData, error: cError } = await supabase.from('categories').select('*').eq('user_id', currentUserId);
    if (!cData || cData.length === 0) await initDefaultCategories();
    else {
        allCats.income = cData.filter(c => c.type === 'income');
        allCats.expense = cData.filter(c => c.type === 'expense');
    }
}

async function initDefaultCategories() {
    const default_income = [
        { name: "Oylik", icon: "banknote", type: "income" }, 
        { name: "Bonus", icon: "gift", type: "income" }, 
        { name: "Sotuv", icon: "shopping-bag", type: "income" }];
    const default_expense = [
        { name: "Oziq-ovqat", icon: "shopping-cart", type: "expense" }, 
        { name: "Transport", icon: "bus", type: "expense" }, 
        { name: "Kafe", icon: "coffee", type: "expense" }];
    const all = [...default_income, ...default_expense].map(c => ({ ...c, user_id: currentUserId }));
    const { error } = await supabase.from('categories').insert(all);
    if (!error) { allCats.income = default_income; allCats.expense = default_expense; }
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
    lucide.createIcons();
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
    const newName = document.getElementById('edit-cat-name-input').value;
    if (newName) {
        const cat = allCats[selCatType][selCatIndex]; const oldName = cat.name;
        allCats[selCatType][selCatIndex].name = newName; renderBotCats(selCatType); closeModal('edit-cat-modal');
        await supabase.from('categories').update({ name: newName }).eq('user_id', currentUserId).eq('name', oldName).eq('type', selCatType);
    }
}
async function deleteCatFromMenu() {
    if (confirm("Bu kategoriyani o'chirasizmi?")) {
        const catToDelete = allCats[selCatType][selCatIndex];
        allCats[selCatType].splice(selCatIndex, 1); renderBotCats(selCatType); document.getElementById('cat-context-menu').classList.add('hidden');
        await supabase.from('categories').delete().eq('user_id', currentUserId).eq('name', catToDelete.name).eq('type', selCatType);
    }
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
function toggleBiometric(el) { bioEnabled = el.checked; localStorage.setItem('bio', bioEnabled); }
function removePin() { if (confirm("PIN kodni olib tashlaysizmi?")) { localStorage.removeItem('pin'); pin = null; updateSettingsUI(); alert("PIN kod olib tashlandi."); closeModal('settings-modal'); } }

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
    const fileName = `${currentUserId}/${Date.now()}.jpg`;
    const { data, error } = await supabase.storage.from('receipts').upload(fileName, file);
    if (error) { console.error("Rasm xatolik:", error); throw error; }
    const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(fileName);
    return publicUrl;
}
function clearReceipt() { draft.receipt = null; draft.rawFile = null; document.getElementById('file-upload').value = ''; document.getElementById('receipt-preview-area').classList.add('hidden'); }
function viewReceipt(src) { document.getElementById('full-receipt-image').src = src; document.getElementById('receipt-modal').classList.remove('hidden'); }
function closeReceiptModal() { document.getElementById('receipt-modal').classList.add('hidden'); }

// --- CORE UI ---
function updateUI() {
    const { s, e } = getDateRange();
    transactions.sort((a, b) => b.date - a.date);
    const f = transactions.filter(t => t.date >= s && t.date <= e);

    // Asosiy hisob (Doim UZS da hisoblanadi)
    const incBase = f.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const expBase = f.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0);
    const balBase = incBase - expBase;

    // Ko'rsatish uchun konvertatsiya (VIEW LAYER)
    let displayBal, displayInc, displayExp, suffix;

    if (dashboardCurrency === 'USD' && exchangeRate > 0) {
        // Dollarga o'girib ko'rsatish
        displayBal = (balBase / exchangeRate).toFixed(2);
        displayInc = (incBase / exchangeRate).toFixed(2);
        displayExp = (expBase / exchangeRate).toFixed(2);
        suffix = "$";

        // UI elementlarini yangilash
        document.getElementById('total-balance').innerText = `$ ${formatNumber(displayBal)}`;
        document.getElementById('total-income').innerText = `+$ ${formatNumber(displayInc)}`;
        document.getElementById('total-expense').innerText = `-$ ${formatNumber(displayExp)}`;
        document.getElementById('currency-badge').innerText = "USD";
        document.getElementById('currency-badge').className = "text-[10px] bg-blue-500 px-1.5 py-0.5 rounded text-white font-mono";
    } else {
        // So'mda ko'rsatish (Default)
        document.getElementById('total-balance').innerText = `${formatNumber(balBase)} so'm`;
        document.getElementById('total-income').innerText = `+${formatNumber(incBase)}`;
        document.getElementById('total-expense').innerText = `-${formatNumber(expBase)}`;
        document.getElementById('currency-badge').innerText = "UZS";
        document.getElementById('currency-badge').className = "text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white font-mono";
    }

    // Trendlar va Diagrammalar (Bular foizda bo'lgani uchun o'zgartirish shart emas, lekin diagramma UZS da qoladi)
    updateTrendWidgets();

    const ci = document.getElementById('card-income'), ce = document.getElementById('card-expense');
    ci.className = `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'income' ? 'bg-emerald-500/20 border-emerald-500' : 'hover:bg-emerald-500/10'}`;
    ce.className = `glass-panel p-3 rounded-2xl flex items-center gap-3 cursor-pointer transition-all ${activeType === 'expense' ? 'bg-rose-500/20 border-rose-500' : 'hover:bg-rose-500/10'}`;

    renderCharts(f);
    renderHistory(); // Tarix o'zgarishsiz qoladi (Siz so'ragandek)
}

function updateTrendWidgets() {
    const now = new Date(); const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(); const lastMonthEnd = thisMonthStart - 1;
    const thisMonthTrans = transactions.filter(t => t.date >= thisMonthStart && t.type === 'expense');
    const lastMonthTrans = transactions.filter(t => t.date >= lastMonthStart && t.date <= lastMonthEnd && t.type === 'expense');
    const group = (arr) => arr.reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + (Number(t.amount) || 0); return acc; }, {});
    const curr = group(thisMonthTrans); const prev = group(lastMonthTrans);
    let html = ''; const cats = [...new Set([...Object.keys(curr), ...Object.keys(prev)])];
    if (cats.length > 0) {
        document.getElementById('trend-container').classList.remove('hidden');
        cats.forEach(c => {
            const cVal = curr[c] || 0; const pVal = prev[c] || 0;
            if (pVal > 0 && cVal > 0) {
                const pct = ((cVal - pVal) / pVal) * 100;
                if (Math.abs(pct) > 5) {
                    const isBad = pct > 0; const color = isBad ? 'text-rose-400' : 'text-emerald-400'; const icon = isBad ? 'trending-up' : 'trending-down';
                    html += `<div class="glass-panel p-3 rounded-xl flex justify-between items-center"><div><div class="text-xs text-slate-400">${c}</div><div class="font-bold text-sm text-white">${formatNumber(cVal)}</div></div><div class="text-right"><div class="${color} font-bold text-xs flex items-center gap-1 justify-end"><i data-lucide="${icon}" class="w-3 h-3"></i> ${Math.round(Math.abs(pct))}%</div><div class="text-xs text-slate-500">o'tgan oy</div></div></div>`;
                }
            }
        });
    }
    document.getElementById('trend-list').innerHTML = html || '<div class="col-span-2 text-center text-xs text-slate-500 py-2">Trendlar uchun ma\'lumot yetarli emas</div>';
}
function renderCharts(data) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    let t = activeType === 'income' ? data.filter(x => x.type === 'income') : data.filter(x => x.type === 'expense');
    if (activeType === 'all') t = data.filter(x => x.type === 'expense');
    document.getElementById('no-data-msg').classList.toggle('hidden', t.length > 0);
    const cats = {}; t.forEach(x => cats[x.category] = (cats[x.category] || 0) + (Number(x.amount) || 0));
    if (window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } } });
    const list = document.getElementById('top-transaction-list'); list.innerHTML = '';
    Object.entries(cats).sort(([, a], [, b]) => b - a).slice(0, 5).forEach(([c, a]) => { list.innerHTML += `<tr><td class="py-2.5 text-slate-300 capitalize pl-2">${c}</td><td class="text-right font-bold pr-2 ${activeType === 'income' ? 'text-emerald-400' : 'text-rose-400'}">${formatNumber(a)}</td></tr>`; });
}
function renderHistory() {
    const list = document.getElementById('history-list'); list.innerHTML = '';
    document.getElementById('empty-history').classList.toggle('hidden', transactions.length > 0);
    transactions.forEach(t => {
        const isInc = t.type === 'income';
        const hasReceipt = t.receipt || t.receipt_url;
        const receiptBadge = hasReceipt ? `<span class="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-0.5"><i data-lucide="paperclip" class="w-2 h-2"></i> Chek</span>` : '';
        list.innerHTML += `<div onclick="openActionSheet(event, ${t.id})" class="glass-panel p-4 rounded-2xl flex justify-between items-center cursor-pointer active:scale-95 transition-transform hover:bg-slate-800/50"><div class="flex items-center gap-4"><div class="p-3 rounded-full ${isInc ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}"><i data-lucide="${isInc ? 'arrow-down-left' : 'arrow-up-right'}" class="w-5 h-5"></i></div><div><div class="font-bold text-sm text-white capitalize flex items-center">${t.category} ${receiptBadge}</div><div class="text-xs text-slate-400 mt-0.5">${new Date(t.date).toLocaleDateString()} • ${new Date(t.date).toLocaleTimeString().slice(0, 5)}</div></div></div><div class="font-bold ${isInc ? 'text-emerald-400' : 'text-rose-400'} text-base">${isInc ? '+' : '-'}${formatNumber(t.amount)}</div></div>`;
    });
    lucide.createIcons();
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
    lucide.createIcons();
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
    let rawVal = document.getElementById('bot-input').value;
    // Faqat raqamlarni ajratib olish
    let val = parseFloat(rawVal.replace(/[^0-9.]/g, ''));
    
    if (!val) return;

    // AGAR VALYUTA USD BO'LSA:
    let finalAmount = val;
    let note = "";
    
    if (inputCurrency === 'USD') {
        finalAmount = Math.round(val * exchangeRate);
        note = ` ($${val})`; // Izohga dollar qiymatini qo'shib qo'yamiz
    }

    let finalReceiptUrl = null;
    if (draft.rawFile) { try { finalReceiptUrl = await uploadReceipt(draft.rawFile); } catch (e) { alert("Rasm yuklanmadi, lekin tranzaksiya saqlanadi."); } }
    
    const newTrans = { 
        user_id: currentUserId, 
        amount: finalAmount, 
        category: draft.category + note, 
        type: draft.type, 
        date: Date.now(), 
        receipt_url: finalReceiptUrl 
    };
    
    const tempId = Date.now();
    transactions.unshift({ ...newTrans, id: tempId, receipt: draft.receipt });
    updateUI();
    document.getElementById('bot-input').value = ''; 
    
    // Reset Currency to UZS after submit
    if(inputCurrency === 'USD') toggleInputCurrency();
    
    cancelBotFlow();
    
    const icon = draft.receipt ? '📎' : '';
    const chat = document.getElementById('chat-messages');
    chat.innerHTML += `<div class="msg-wrapper ai fade-in"><div class="msg-bubble ai border-l-4 ${draft.type === 'income' ? 'border-l-emerald-500' : 'border-l-rose-500'}">Saqlandi: <b>${formatNumber(finalAmount)} so'm</b> ${icon} <br><span class="text-xs opacity-70">${draft.category}${note}</span></div></div>`;
    setTimeout(() => chat.scrollTop = chat.scrollHeight, 100);
    
    draft = { receipt: null, rawFile: null };
    const { data, error } = await supabase.from('transactions').insert([newTrans]).select();
    if (error) console.error("Save error:", error);
    else { const idx = transactions.findIndex(t => t.id === tempId); if (idx !== -1) transactions[idx].id = data[0].id; }
}

function cancelBotFlow() { document.getElementById('bot-input-container').classList.add('hidden'); document.getElementById('category-selector').classList.add('hidden'); document.getElementById('bot-start-actions').classList.remove('hidden'); clearReceipt(); }
// --- HELPER FUNCTIONS ---
function toggleTheme(f) { const l = f || document.body.classList.toggle('light-mode'); localStorage.setItem('theme', l ? 'light' : 'dark'); lucide.createIcons(); }
function openAddCategoryModal() { document.getElementById('add-cat-modal').classList.remove('hidden'); }
async function saveNewCategory() {
    const n = document.getElementById('new-cat-name').value;
    if (n && draft.type) {
        const newCat = { user_id: currentUserId, name: n, icon: selIcon, type: draft.type };
        allCats[draft.type].push(newCat); renderBotCats(draft.type); closeModal('add-cat-modal');
        await supabase.from('categories').insert([newCat]);
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
function formatNumber(n) { return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " "); }
function toggleTypeFilter(t) { vibrate('soft'); activeType = activeType === t ? 'all' : t; updateUI(); }
function setDateFilter(f) { vibrate('soft'); activeDate = f; document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('filter-active')); document.querySelector(`[data-filter="${f}"]`).classList.add('filter-active'); updateUI(); }
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
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
        try {
            const backup = JSON.parse(event.target.result);
            if (backup.pin) localStorage.setItem('pin', backup.pin);
            if (backup.bio !== undefined) localStorage.setItem('bio', backup.bio);
            if (backup.transactions && Array.isArray(backup.transactions) && backup.transactions.length > 0) {
                const newTrans = backup.transactions.map(t => { const { id, ...rest } = t; return { ...rest, user_id: currentUserId }; });
                const { error } = await supabase.from('transactions').insert(newTrans);
                if (error) throw error;
            }
            alert("Muvaffaqiyatli! Dastur qayta yuklanmoqda..."); location.reload();
        } catch (err) { alert("Xatolik!"); }
    }; reader.readAsText(file); e.target.value = '';
}
function confirmResetData() { if (confirm("DIQQAT! Barcha ma'lumotlar BAZADAN o'chib ketadi. Davom etasizmi?")) { transactions = []; updateUI(); closeModal('settings-modal'); supabase.from('transactions').delete().eq('user_id', currentUserId).then(() => alert("Tozalandi!")); } }
// --- MODALS ACTIONS (Tahrirlash va O'chirish qaytarildi) ---
function openActionSheet(e, id) {
    if (e) e.stopPropagation(); selId = id; const t = transactions.find(x => x.id === id);
    const c = document.getElementById('action-sheet-content'); c.innerHTML = '';
    const hasReceipt = t.receipt_url || t.receipt;
    if (hasReceipt) { c.innerHTML += `<button onclick="viewCurrentReceipt()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-emerald-400 font-medium"><i data-lucide="file-text" class="w-5 h-5"></i> Chekni ko'rish</button>`; }
    c.innerHTML += `<button onclick="handleEdit()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-blue-400 font-medium"><i data-lucide="edit-3" class="w-5 h-5"></i> Tahrirlash</button><button onclick="handleDeleteConfirm()" class="w-full flex items-center gap-3 p-3.5 bg-slate-900/50 rounded-xl hover:bg-slate-900 text-rose-400 font-medium"><i data-lucide="trash-2" class="w-5 h-5"></i> O'chirish</button>`;
    document.getElementById('action-sheet').classList.remove('hidden'); lucide.createIcons();
}
function viewCurrentReceipt() { const t = transactions.find(x => x.id === selId); if (t) { const src = t.receipt_url || t.receipt; viewReceipt(src); } closeActionSheet(null); }
function closeActionSheet(e) { if (e && !e.target.closest('.bg-slate-800') && e.target.id !== 'action-sheet') return; document.getElementById('action-sheet').classList.add('hidden'); }
function handleDeleteConfirm() { closeActionSheet(null); document.getElementById('delete-modal').classList.remove('hidden'); }
async function confirmDelete() { const idToDelete = selId; transactions = transactions.filter(t => t.id !== idToDelete); updateUI(); closeModal('delete-modal'); await supabase.from('transactions').delete().eq('id', idToDelete).eq('user_id', currentUserId); }
function handleEdit() { closeActionSheet(null); const t = transactions.find(x => x.id === selId); if (!t) return; document.getElementById('edit-category').value = t.category; document.getElementById('edit-amount').value = t.amount; document.getElementById('edit-type').value = t.type; document.getElementById('edit-modal').classList.remove('hidden'); }
async function saveEdit() {
    const c = document.getElementById('edit-category').value, a = parseInt(document.getElementById('edit-amount').value), tp = document.getElementById('edit-type').value;
    if (c && a) {
        const i = transactions.findIndex(x => x.id === selId);
        if (i !== -1) { transactions[i].category = c; transactions[i].amount = a; transactions[i].type = tp; updateUI(); await supabase.from('transactions').update({ category: c, amount: a, type: tp }).eq('id', selId).eq('user_id', currentUserId); }
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
    const data = transactions.filter(t => t.date >= s && t.date < e); const receipts = data.filter(t => t.receipt || t.receipt_url).length;
    document.getElementById('export-count').innerText = data.length + " ta operatsiya"; document.getElementById('export-receipts').innerText = receipts + " ta rasm";
}
async function generatePDF() {
    const { jsPDF } = window.jspdf; if (!jsPDF) { alert("PDF kutubxonalari yuklanmagan!"); return; }
    const sStr = document.getElementById('export-start-date').value; const eStr = document.getElementById('export-end-date').value;
    const s = new Date(sStr).getTime(); const e = new Date(eStr).getTime() + 86400000;
    const data = transactions.filter(t => t.date >= s && t.date < e).sort((a, b) => a.date - b.date);
    if (data.length === 0) { alert("Tanlangan davrda ma'lumot yo'q."); return; }
    const doc = new jsPDF(); const pageWidth = doc.internal.pageSize.width;
    doc.setFillColor(30, 41, 59); doc.rect(0, 0, pageWidth, 40, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(22); doc.text("Mening Kassam", 14, 18); doc.setFontSize(10); doc.setTextColor(200, 200, 200); doc.text("Moliyaviy hisobot", 14, 26); doc.text(`${sStr} dan ${eStr} gacha`, pageWidth - 14, 26, { align: 'right' });
    const inc = data.filter(t => t.type === 'income').reduce((a, b) => a + (Number(b.amount) || 0), 0); const exp = data.filter(t => t.type === 'expense').reduce((a, b) => a + (Number(b.amount) || 0), 0); const bal = inc - exp;
    let yPos = 50; doc.setTextColor(0); doc.setFontSize(10); doc.text("Jami Kirim:", 14, yPos); doc.setTextColor(16, 185, 129); doc.setFont("helvetica", "bold"); doc.text(`+${formatNumber(inc)} so'm`, 40, yPos); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Jami Chiqim:", 80, yPos); doc.setTextColor(239, 68, 68); doc.setFont("helvetica", "bold"); doc.text(`-${formatNumber(exp)} so'm`, 110, yPos); doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.text("Sof Qoldiq:", 150, yPos); doc.setTextColor(59, 130, 246); doc.setFont("helvetica", "bold"); doc.text(`${formatNumber(bal)} so'm`, 175, yPos);
    const tableData = data.map(t => [new Date(t.date).toLocaleDateString(), t.category, t.type === 'income' ? 'Kirim' : 'Chiqim', (t.type === 'income' ? '+' : '-') + formatNumber(t.amount),]);
    doc.autoTable({ startY: yPos + 10, head: [['Sana', 'Kategoriya', 'Tur', 'Summa']], body: tableData, theme: 'striped', headStyles: { fillColor: [30, 41, 59] }, styles: { fontSize: 9 }, columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }, didParseCell: function (data) { if (data.section === 'body' && data.column.index === 3) { const raw = tableData[data.row.index][3]; data.cell.styles.textColor = raw.startsWith('+') ? [16, 185, 129] : [239, 68, 68]; } } });
    const receipts = data.filter(t => t.receipt || t.receipt_url);
    if (receipts.length > 0) {
        doc.addPage(); let rY = 20; doc.setFontSize(16); doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.text("Biriktirilgan Cheklar", 14, rY); rY += 15; doc.setDrawColor(200); doc.line(14, rY - 5, pageWidth - 14, rY - 5);
        receipts.forEach(t => {
            if (rY > 250) { doc.addPage(); rY = 20; }
            doc.setFontSize(10); doc.setTextColor(50); doc.text(`${new Date(t.date).toLocaleDateString()} - ${t.category}: ${formatNumber(t.amount)}`, 14, rY);
            if (t.receipt) { try { doc.addImage(t.receipt, 'JPEG', 14, rY + 5, 40, 50, undefined, 'FAST'); rY += 60; } catch (e) { } } else if (t.receipt_url) { doc.setTextColor(59, 130, 246); doc.textWithLink("Chekni ko'rish (Browser)", 14, rY + 10, { url: t.receipt_url }); rY += 20; }
        });
    }
    doc.save(`Hisobot_${sStr}_${eStr}.pdf`); closeModal('export-modal');
}

async function saveExchangeRate(val) {
    if(val && val > 0) {
        exchangeRate = val;
        // 1. Lokal saqlash (tezkor ishlash uchun)
        localStorage.setItem('exchangeRate', val);
        vibrate('light');

        // 2. Backendga (Supabase) saqlash
        const { error } = await supabase
            .from('users')
            .update({ exchange_rate: val })
            .eq('user_id', currentUserId);
            
        if (error) console.error("Kursni saqlashda xatolik:", error);
    }
}