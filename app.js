'use strict';

// ─── TELEGRAM ───────────────────────────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.expand();
  tg.ready();

  // Telegram ranglarini sozlash
  tg.setHeaderColor?.('#050508');
  tg.setBackgroundColor?.('#050508');

  // Viewport o'zgarganda xavfsiz masofani qayta hisoblash
  const updateSafeArea = () => {
    // Agar Telegram headeri bo'lsa, uning balandligini hisobga olish
    const offset = (tg.viewportHeight - tg.viewportStableHeight) > 0
      ? (tg.viewportHeight - tg.viewportStableHeight)
      : 0;
    document.documentElement.style.setProperty('--tg-header-offset', offset + 'px');
  };

  tg.onEvent('viewportChanged', updateSafeArea);
  updateSafeArea();
}

// ─── STORAGE ────────────────────────────────────────────
const store = {
  get: (k, fb = null) => { try { return localStorage.getItem(k) ?? fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch { } },
  del: (k) => { try { localStorage.removeItem(k); } catch { } },
};

// ─── USER ID ────────────────────────────────────────────
function getUserId() {
  const tgId = Number(tg?.initDataUnsafe?.user?.id || 0);
  const qId = Number(new URLSearchParams(location.search).get('user_id') || 0);
  const cached = Number(store.get('uid') || 0);
  const id = tgId || qId || cached || 0;
  if (qId && qId !== cached) store.set('uid', qId);
  return id;
}
const UID = getUserId();

// ─── ICONS LIST ─────────────────────────────────────────
const ICON_NAMES = [
  'shopping-cart', 'coffee', 'car', 'home', 'smartphone', 'bus', 'music', 'book',
  'briefcase', 'credit-card', 'gift', 'heart', 'star', 'zap', 'tool', 'truck',
  'shopping-bag', 'banknote', 'pill', 'shirt', 'wifi', 'monitor', 'smile', 'film',
];

const SVGS = {
  'shopping-cart': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'coffee': '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
  'car': '<rect x="1" y="3" width="15" height="13" rx="2"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  'home': '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  'smartphone': '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>',
  'bus': '<path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  'music': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  'book': '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  'briefcase': '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'credit-card': '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  'gift': '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  'heart': '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  'zap': '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  'tool': '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  'truck': '<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  'shopping-bag': '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  'banknote': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  'pill': '<path d="M10.5 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6.5"/><path d="M8 11h8"/><circle cx="12" cy="16" r="3"/>',
  'shirt': '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.57a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.57a2 2 0 0 0-1.34-2.23z"/>',
  'wifi': '<path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
  'monitor': '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>',
  'smile': '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  'film': '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
};
function svgIcon(name, cls = '') {
  const p = SVGS[name] || SVGS['star'];
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${cls}">${p}</svg>`;
}

// ─── STATE ───────────────────────────────────────────────
let db = null;
let txList = [];
let cats = { income: [], expense: [] };
let pin = store.get('pin');
let bioOn = store.get('bio') === 'true';
let rate = Number(store.get('rate') || 12850);
let currency = 'UZS';
let typeFilt = 'all';
let dateFilt = 'all';
let histFilt = 'all';
let selTxId = null;
let selCatIdx = null;
let selCatType = null;
let selIcon = 'star';
let draft = {};
let inputCur = 'UZS';
let pinMode = 'unlock';
let pinBuf = '';
let pinTemp = '';
/** PIN oqimi sozlamalardan boshlanganida bekor qilganda asosiy sahifa yopilmasin */
let pinContext = null;
/** USD kursi tahriri — bekor qilishda qayta tiklash */
let rateDraftStg = null;
let bioAvail = false;
let myChart = null;
let histOffset = 0;
let hasMoreTx = true;
let loadingMore = false;

// ─── HELPERS ────────────────────────────────────────────
const fmt = n => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(v);
};
const isoNow = (ms = Date.now()) => new Date(ms).toISOString();
const toMs = v => {
  if (typeof v === 'number') return v;
  const p = new Date(v).getTime();
  return Number.isFinite(p) ? p : Date.now();
};
const normTx = r => ({ ...r, amount: Number(r.amount) || 0, ms: toMs(r.date), receipt_url: r.receipt_url || null });
const normAll = rows => (rows || []).map(normTx);
const vib = s => tg?.HapticFeedback?.impactOccurred(s);
const $ = id => document.getElementById(id);
const showOv = id => { const el = $(id); if (el) { el.classList.add('on'); } };
const closeOv = (id, e) => {
  if (e) { const sh = e.currentTarget?.querySelector('.sheet'); if (sh && sh.contains(e.target)) return; }
  $(id)?.classList.remove('on');
};

function showErr(msg, dur = 4000) {
  const el = $('err-bar');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, dur);
}

function addMsg(text, isUser = false) {
  const area = $('chat-area');
  if (!area) return;
  const d = document.createElement('div');
  d.className = 'msg' + (isUser ? ' u' : '');
  d.innerHTML = text;
  area.appendChild(d);
  setTimeout(() => { area.scrollTop = area.scrollHeight; }, 60);
}

// ─── LOADER ─────────────────────────────────────────────
let loaderInterval;
function startLoaderMessages() {
  const msgEl = $('loader-msg');
  if (!msgEl) return;
  const msgs = ['Yuklanyapti...', 'Sozlanyapti...', 'Deyarli tayyor...', 'Yana bir soniya...'];
  let idx = 0;
  loaderInterval = setInterval(() => {
    msgEl.classList.add('fade');
    setTimeout(() => {
      idx = (idx + 1) % msgs.length;
      msgEl.textContent = msgs[idx];
      msgEl.classList.remove('fade');
    }, 300);
  }, 1300);
}

function hideLoader() {
  const el = $('loader');
  if (!el) return;
  clearInterval(loaderInterval);
  el.classList.add('out');
  setTimeout(() => { el.style.display = 'none'; }, 500);
}

// ─── INIT: entry point ──────────────────────────────────
(async () => {
  startLoaderMessages();
  // Avval loader ko'rinsin, faqat hamma narsa tayyor bo'lgach yopiladi

  if (store.get('theme') === 'light') document.body.classList.add('light');

  // Biometrics init
  if (tg?.BiometricManager) {
    tg.BiometricManager.init(() => {
      console.log('Native BiometricManager inited');
      updateSettingsUI();
      if (pin) showPin('unlock');
    });
  } else if (pin) {
    showPin('unlock');
  }

  buildIconGrid();

  await loadConfig();

  if (db && UID) {
    try {
      await ensureUser();
      await loadData();
      initRealtime(); // Real-time ulanishni yoqish
    } catch (e) {
      console.error('[boot]', e);
      showErr('Ma\'lumotlar yuklanmadi: ' + (e?.message || e));
    }
  } else if (!UID) {
    showErr("Telegram user_id topilmadi. URLga ?user_id=123 qo'shing.");
  }

  // i18n tizimini yuklash
  await loadLang(currentLang);
  applyLang();

  renderAll();
  updateSettingsUI();
  initSettingsUI();
  hideLoader();
  initSwipe();
})();

// ─── REALTIME ───────────────────────────────────────────
function initRealtime() {
  if (!db || !UID) return;

  // Tranzaksiyalar uchun realtime
  db.channel('tx-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${UID}` },
      payload => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT') {
          const tx = normTx(newRow);
          if (!txList.some(t => t.id === tx.id)) txList.unshift(tx);
        } else if (eventType === 'UPDATE') {
          const tx = normTx(newRow);
          const i = txList.findIndex(t => t.id === tx.id);
          if (i !== -1) txList[i] = tx;
        } else if (eventType === 'DELETE') {
          txList = txList.filter(t => t.id !== oldRow.id);
        }
        renderAll();
        renderHistory();
      }
    )
    .subscribe();

  // Kategoriyalar uchun realtime
  db.channel('cat-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'categories', filter: `user_id=eq.${UID}` },
      payload => {
        const { eventType, new: newRow, old: oldRow } = payload;
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          const list = cats[newRow.type];
          if (list) {
            const i = list.findIndex(c => c.id === newRow.id);
            if (i !== -1) list[i] = newRow; else list.push(newRow);
            list.sort((a, b) => a.name.localeCompare(b.name));
          }
        } else if (eventType === 'DELETE') {
          cats.income = cats.income.filter(c => c.id !== oldRow.id);
          cats.expense = cats.expense.filter(c => c.id !== oldRow.id);
        }
        if ($('flow-cats').style.display === 'flex') buildCatGrid(draft.type);
        renderAll();
      }
    )
    .subscribe();
}

// ─── CONFIG LOAD ────────────────────────────────────────
async function loadConfig() {
  try {
    const res = await fetch('/api/config.js', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text();
    new Function(txt)();
  } catch (e) {
    console.warn('[config] fetch failed:', e.message);
  }

  const cfg = window.__APP_CONFIG__ || {};
  const url = cfg.SUPABASE_URL || '';
  const key = cfg.SUPABASE_ANON_KEY || '';

  if (url && key && window.supabase?.createClient) {
    try { db = window.supabase.createClient(url, key); }
    catch (e) { console.warn('[supabase] init failed:', e.message); }
  }
}

// ─── SUPABASE CALLS ─────────────────────────────────────
async function ensureUser() {
  const name = [tg?.initDataUnsafe?.user?.first_name, tg?.initDataUnsafe?.user?.last_name]
    .filter(Boolean).join(' ').trim() || `User ${UID}`;
  const { error } = await db.from('users').upsert(
    { user_id: UID, full_name: name },
    { onConflict: 'user_id' }
  );
  if (error) throw error;
}

async function loadData() {
  const { data: u } = await db.from('users').select('exchange_rate').eq('user_id', UID).maybeSingle();
  if (u?.exchange_rate) { rate = Number(u.exchange_rate) || rate; store.set('rate', rate); }

  const { data: tx, error: te } = await db.from('transactions').select('*')
    .eq('user_id', UID).order('date', { ascending: false }).range(0, 19);
  if (te) throw te;
  txList = normAll(tx);
  histOffset = txList.length;
  hasMoreTx = txList.length === 20;

  const { data: cd, error: ce } = await db.from('categories').select('*')
    .eq('user_id', UID).order('name');
  if (ce) throw ce;

  if (!cd || cd.length === 0) await seedCats();
  else {
    cats.income = cd.filter(c => c.type === 'income');
    cats.expense = cd.filter(c => c.type === 'expense');
  }
}

async function seedCats() {
  const defs = [
    { name: 'Oylik', icon: 'banknote', type: 'income' },
    { name: 'Bonus', icon: 'gift', type: 'income' },
    { name: 'Sotuv', icon: 'shopping-bag', type: 'income' },
    { name: 'Ovqat', icon: 'shopping-cart', type: 'expense' },
    { name: 'Transport', icon: 'bus', type: 'expense' },
    { name: 'Kafe', icon: 'coffee', type: 'expense' },
  ].map(c => ({ ...c, user_id: UID }));

  const { data, error } = await db.from('categories').insert(defs).select();
  if (error) throw error;
  cats.income = (data || []).filter(c => c.type === 'income');
  cats.expense = (data || []).filter(c => c.type === 'expense');
}

// ─── NAVIGATION ─────────────────────────────────────────
function goTab(tab) {
  try {
    vib('light');
    console.log('[goTab]', tab);
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));

    const v = $('view-' + tab);
    const n = $('nb-' + tab);
    if (v) v.classList.add('active');
    if (n) n.classList.add('active');

    if (tab === 'dash') renderAll();
    if (tab === 'hist') {
      renderHistory();
      initHistScroll();
    }
  } catch (e) {
    console.error('[goTab] Error:', e);
  }
}

async function loadMore() {
  if (!hasMoreTx || loadingMore || !db) return;
  loadingMore = true;
  const loader = document.createElement('div');
  loader.className = 'load-more-s';
  loader.innerHTML = '<div class="spin small"></div>';
  $('tx-list')?.appendChild(loader);

  try {
    const { data, error } = await db.from('transactions').select('*')
      .eq('user_id', UID).order('date', { ascending: false })
      .range(histOffset, histOffset + 19);

    if (error) throw error;
    const items = normAll(data);
    if (items.length > 0) {
      txList = [...txList, ...items];
      histOffset += items.length;
      hasMoreTx = items.length === 20;
      renderHistory();
    } else {
      hasMoreTx = false;
    }
  } catch (e) {
    console.error('[loadMore]', e);
  } finally {
    loadingMore = false;
    loader.remove();
  }
}

function initHistScroll() {
  const v = $('view-hist');
  if (!v || v.dataset.scrollInited) return;
  v.dataset.scrollInited = '1';
  v.onscroll = () => {
    if (v.scrollTop + v.clientHeight >= v.scrollHeight - 100) {
      loadMore();
    }
  };
}

// ─── RENDER ALL ─────────────────────────────────────────
function renderAll() {
  try {
    const { s, e } = getRange();
    const sorted = [...txList].sort((a, b) => b.ms - a.ms);
    const ranged = sorted.filter(t => t.ms >= s && t.ms <= e);
    const shown = typeFilt === 'all' ? ranged : ranged.filter(t => t.type === typeFilt);

    const inc = shown.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const exp = shown.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const bal = inc - exp;

    const balEl = $('total-bal');
    const incEl = $('total-inc');
    const expEl = $('total-exp');

    if (balEl) {
      balEl.classList.remove('loading');
      let txt = '';
      if (currency === 'USD' && rate > 0) {
        txt = `$${fmt(bal / rate)}`;
        incEl.textContent = `+$${fmt(inc / rate)}`;
        expEl.textContent = `-$${fmt(exp / rate)}`;
      } else {
        txt = `${fmt(bal)} ${t('suffix_uzs')}`;
        incEl.textContent = `+${fmt(inc)}`;
        expEl.textContent = `-${fmt(exp)}`;
      }
      balEl.textContent = txt;
      updateBalSize(txt);
    }

    const tci = $('tc-i'), tce = $('tc-e');
    if (tci) { tci.classList.toggle('on-i', typeFilt === 'income'); }
    if (tce) { tce.classList.toggle('on-e', typeFilt === 'expense'); }

    renderChart(shown);
    renderTrends();
  } catch (e) {
    console.error('[renderAll] Error:', e);
  }
}

function updateBalSize(txt) {
  const el = $('total-bal');
  if (!el) return;
  el.classList.remove('sm', 'xs', 'xxs');
  const len = txt.length;
  if (len > 18) el.classList.add('xxs');
  else if (len > 14) el.classList.add('xs');
  else if (len > 10) el.classList.add('sm');
}

function renderChart(data) {
  const canvas = $('myChart');
  const noData = $('no-data');
  const table = $('cat-table');
  if (!canvas) return;

  const src = typeFilt === 'income'
    ? data.filter(x => x.type === 'income')
    : data.filter(x => x.type === 'expense');

  if (noData) noData.style.display = src.length === 0 ? 'flex' : 'none';

  const grouped = {};
  src.forEach(t => { grouped[t.category] = (grouped[t.category] || 0) + t.amount; });
  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);

  if (myChart) { myChart.destroy(); myChart = null; }

  if (src.length > 0 && window.Chart) {
    const ctx = canvas.getContext('2d');
    myChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => k),
        datasets: [{
          data: entries.map(([, v]) => v),
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b', '#7c3aed', '#3b82f6', '#ec4899', '#06b6d4', '#84cc16'],
          borderWidth: 0, hoverOffset: 4
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%',
        plugins: { legend: { display: false } }
      },
    });
  }

  if (table) {
    const color = typeFilt === 'income' ? 'var(--green)' : 'var(--red)';
    table.innerHTML = entries.slice(0, 5).map(([k, v]) =>
      `<div class="ctr"><span class="ctr-n">${k}</span><span class="ctr-v" style="color:${color}">${fmt(v)}</span></div>`
    ).join('');
  }
}

function renderTrends() {
  const sec = $('trend-sec');
  const grid = $('trend-grid');
  if (!sec || !grid) return;

  const now = new Date();
  const thisStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
  const lastEnd = thisStart - 1;

  const grp = arr => arr.reduce((acc, t) => {
    acc[t.category] = (acc[t.category] || 0) + t.amount; return acc;
  }, {});

  const curr = grp(txList.filter(t => t.ms >= thisStart && t.type === 'expense'));
  const prev = grp(txList.filter(t => t.ms >= lastStart && t.ms <= lastEnd && t.type === 'expense'));

  let html = '';
  [...new Set([...Object.keys(curr), ...Object.keys(prev)])].forEach(c => {
    const cv = curr[c] || 0, pv = prev[c] || 0;
    if (cv > 0 && pv > 0) {
      const pct = ((cv - pv) / pv) * 100;
      if (Math.abs(pct) > 5) {
        const up = pct > 0;
        html += `<div class="tcard">
          <div><div class="tc-cat">${c}</div><div class="tc-val">${fmt(cv)}</div></div>
          <div class="tc-pct ${up ? 'up' : 'dn'}">${up ? '▲' : '▼'} ${Math.round(Math.abs(pct))}%</div>
        </div>`;
      }
    }
  });

  grid.innerHTML = html;
  sec.style.display = html ? 'flex' : 'none';
}

function renderHistory() {
  try {
    const list = $('tx-list');
    const empty = $('empty-s');
    if (!list) return;

    const sorted = [...txList].sort((a, b) => b.ms - a.ms);
    const filtered = histFilt === 'all' ? sorted : sorted.filter(t => t.type === histFilt);

    if (empty) empty.style.display = filtered.length === 0 ? 'flex' : 'none';

    list.innerHTML = filtered.map(tx => {
      const isI = tx.type === 'income';
      const dt = new Date(tx.ms);
      const dateStr = dt.toLocaleDateString() + ' · ' + dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const chek = (tx.receipt || tx.receipt_url) ? `<span class="chek-b">📎 ${t('hist_receipt')}</span>` : '';
      const arrow = isI
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;
      return `<div class="txi" onclick="openAction(${tx.id})">
      <div class="txi-l">
        <div class="txi-ico ${isI ? 'i' : 'e'}">${arrow}</div>
        <div>
          <div class="txi-cat">${tx.category} ${chek}</div>
          <div class="txi-dt">${dateStr}</div>
        </div>
      </div>
      <div class="txi-amt ${isI ? 'i' : 'e'}">${isI ? '+' : '-'}${fmt(tx.amount)}</div>
    </div>`;
    }).join('');
  } catch (e) {
    console.error('[renderHistory] Error:', e);
  }
}

function setHistFilter(f) {
  histFilt = f;
  document.querySelectorAll('[data-hf]').forEach(b => b.classList.toggle('on', b.dataset.hf === f));
  renderHistory();
}

// ─── DATE RANGE ─────────────────────────────────────────
function getRange() {
  const now = new Date();
  let s = 0, e = new Date().setHours(23, 59, 59, 999);
  if (dateFilt === 'week') s = Date.now() - 7 * 86400000;
  else if (dateFilt === 'month') s = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  else if (dateFilt === 'custom') {
    s = new Date($('d-from')?.value || 0).getTime();
    e = new Date($('d-to')?.value || Date.now()).getTime() + 86400000;
  }
  return { s, e };
}

function setDate(f) {
  vib('soft');
  dateFilt = f;
  document.querySelectorAll('.fp[data-f]').forEach(b => b.classList.toggle('on', b.dataset.f === f));
  renderAll();
}

function toggleType(t) {
  vib('soft');
  typeFilt = typeFilt === t ? 'all' : t;
  renderAll();
}

function openDateMod() { dateFilt = 'custom'; showOv('ov-date'); }
function applyDate() { closeOv('ov-date'); document.querySelector('.fp[data-f="custom"]')?.classList.add('on'); renderAll(); }

// ─── CURRENCY ────────────────────────────────────────────
function setCur(c) {
  currency = c;
  $('pill-uzs')?.classList.toggle('on', c === 'UZS');
  $('pill-usd')?.classList.toggle('on', c === 'USD');
  vib('medium');

  const bc = $('bc');
  if (bc) {
    bc.style.transform = c === 'USD' ? 'translateX(-6px)' : 'translateX(6px)';
    setTimeout(() => { bc.style.transform = ''; }, 150);
  }
  renderAll();
}

function initSwipe() {
  const card = $('bc');
  if (!card) return;
  let sx = 0;
  card.addEventListener('touchstart', e => { sx = e.changedTouches[0].screenX; }, { passive: true });
  card.addEventListener('touchend', e => { const dx = sx - e.changedTouches[0].screenX; if (Math.abs(dx) > 50) setCur(dx > 0 ? 'USD' : 'UZS'); }, { passive: true });
  card.addEventListener('mousedown', e => { sx = e.clientX; });
  card.addEventListener('mouseup', e => { const dx = sx - e.clientX; if (Math.abs(dx) > 50) setCur(dx > 0 ? 'USD' : 'UZS'); });
}

// ─── INPUT FORMAT ────────────────────────────────────────
// Raqam kiritishda bo'shliq bilan formatlash (type="text" bilan ishlaydi)
function formatInputAmount(e) {
  const input = e.target;
  const cursorPos = input.selectionStart;
  const oldLen = input.value.length;

  // Faqat raqam va nuqtani qoldirish
  let rawVal = input.value.replace(/[^\d.]/g, '');

  // Bir nechta nuqtaga yo'l qo'ymaslik
  const dotIdx = rawVal.indexOf('.');
  if (dotIdx !== -1) {
    rawVal = rawVal.slice(0, dotIdx + 1) + rawVal.slice(dotIdx + 1).replace(/\./g, '');
  }

  // Integer qismini formatlash
  const parts = rawVal.split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const formatted = parts.length > 1 ? intPart + '.' + parts[1] : intPart;

  input.value = formatted;

  // Cursor pozitsiyasini saqlash
  const newLen = input.value.length;
  const diff = newLen - oldLen;
  try {
    input.setSelectionRange(cursorPos + diff, cursorPos + diff);
  } catch (_) { }
}

// Bo'shliqlarni olib tashlash va sof raqam olish
function getCleanAmount(val) {
  if (!val && val !== 0) return 0;
  let s = String(val).trim();
  // Minglik ajratuvchi (nuqta yoki bo'shliq)ni olib tashlash: 500.000 -> 500000
  s = s.replace(/[. ](?=\d{3}(?:\D|$))/g, '');
  // Vergulni nuqtaga almashtirish (decimal separator): 1,5 -> 1.5
  s = s.replace(/,/g, '.');
  // Qolgan bo'shliqlarni olib tashlash
  s = s.replace(/\s/g, '');
  return parseFloat(s) || 0;
}

// Settings rate inputi uchun
function handleRateInput(input) {
  const rawVal = input.value.replace(/[^\d]/g, '');
  const formatted = rawVal.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cursor = input.selectionStart;
  const oldLen = input.value.length;
  input.value = formatted;
  const diff = formatted.length - oldLen;
  try { input.setSelectionRange(cursor + diff, cursor + diff); } catch (_) { }
}

// ─── BOT FLOW ────────────────────────────────────────────
function startFlow(type) {
  draft = { type, category: '', receipt: null, rawFile: null };
  $('flow-start').style.display = 'none';
  $('flow-cats').style.display = 'flex';
  $('flow-input').style.display = 'none';
  buildCatGrid(type);
  vib('light');
}

function buildCatGrid(type) {
  const grid = $('cat-grid');
  if (!grid) return;
  grid.innerHTML = '';
  (cats[type] || []).forEach((c, idx) => {
    const btn = document.createElement('div');
    btn.className = `ci ci-${type === 'income' ? 'i' : 'e'}`;
    btn.innerHTML = svgIcon(c.icon) + `<span>${c.name}</span>`;
    btn.onclick = () => {
      draft.category = c.name;
      $('flow-cats').style.display = 'none';
      $('flow-input').style.display = 'flex';
      const amtIn = $('amt-in');
      if (amtIn) { amtIn.value = ''; amtIn.focus(); }
      vib('light');
    };
    btn.oncontextmenu = e => { e.preventDefault(); showCtxMenu(e, idx, type); };
    let lpt;
    btn.ontouchstart = e => { lpt = setTimeout(() => showCtxMenu(e.touches[0], idx, type), 500); };
    btn.ontouchend = () => clearTimeout(lpt);
    grid.appendChild(btn);
  });
}

function cancelFlow() {
  $('flow-start').style.display = 'grid';
  $('flow-cats').style.display = 'none';
  $('flow-input').style.display = 'none';
  clearRec();
}

function toggleCur() {
  inputCur = inputCur === 'UZS' ? 'USD' : 'UZS';
  const btn = $('cur-btn');
  if (!btn) return;
  btn.textContent = inputCur;
  btn.className = 'cur-btn' + (inputCur === 'USD' ? ' usd' : '');
  $('amt-in').placeholder = inputCur === 'USD' ? 'Necha dollar?' : 'Summani kiriting...';
  vib('light');
}

function handleFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  draft.rawFile = file;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.src = ev.target.result;
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(1, 800 / img.width);
      c.width = img.width * s; c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      draft.receipt = c.toDataURL('image/jpeg', 0.7);
      const ra = $('rec-area'), th = $('rec-thumb');
      if (ra) ra.style.display = 'flex';
      if (th) th.src = draft.receipt;
    };
  };
  reader.readAsDataURL(file);
}

function clearRec() {
  draft.receipt = null; draft.rawFile = null;
  const ra = $('rec-area');
  if (ra) ra.style.display = 'none';
}

async function submitFlow() {
  vib('heavy');
  // Bo'shliqli formatlangan qiymatdan sof raqam olish
  const raw = getCleanAmount($('amt-in')?.value || '');
  if (!raw || !draft.category) {
    showErr('Summa kiritilmagan!');
    return;
  }

  let amount = Math.round(raw);
  let note = '';
  if (inputCur === 'USD') { amount = Math.round(raw * rate); note = ` ($${raw})`; }

  let recUrl = null;
  if (draft.rawFile && db) {
    try { recUrl = await uploadReceipt(draft.rawFile); }
    catch { /* continue without receipt */ }
  }

  const newTx = {
    user_id: UID, amount, category: draft.category + note,
    type: draft.type, date: isoNow(), receipt_url: recUrl,
  };

  const tempId = Date.now();
  txList.unshift(normTx({ ...newTx, id: tempId, receipt: draft.receipt }));
  renderAll();

  const amtStr = inputCur === 'USD' ? `$${raw} → ${fmt(amount)} so'm` : `${fmt(amount)} so'm`;
  addMsg(`✅ <b>Saqlandi:</b> ${amtStr}<br><small style="opacity:.6">${draft.category}${note}</small>`);

  $('amt-in').value = '';
  if (inputCur === 'USD') toggleCur();
  const localReceipt = draft.receipt;
  cancelFlow();

  if (db) {
    const { data, error } = await db.from('transactions').insert([newTx]).select().single();
    if (error) {
      txList = txList.filter(t => t.id !== tempId);
      renderAll();
      showErr('Saqlashda xatolik: ' + error.message);
      return;
    }
    const i = txList.findIndex(t => t.id === tempId);
    if (i !== -1) txList[i] = normTx({ ...txList[i], ...data, receipt: localReceipt });
  }
}

async function uploadReceipt(file) {
  const name = `${UID}/${Date.now()}.jpg`;
  const { error } = await db.storage.from('receipts').upload(name, file, { contentType: 'image/jpeg' });
  if (error) throw error;
  const { data: { publicUrl } } = db.storage.from('receipts').getPublicUrl(name);
  return publicUrl;
}

// ─── CATEGORIES ─────────────────────────────────────────
function buildIconGrid() {
  const grid = $('icon-grid');
  if (!grid) return;
  grid.innerHTML = '';
  ICON_NAMES.forEach(name => {
    const d = document.createElement('div');
    d.className = 'io';
    d.dataset.icon = name;
    d.innerHTML = svgIcon(name);
    d.onclick = () => {
      grid.querySelectorAll('.io').forEach(x => x.classList.remove('on'));
      d.classList.add('on');
      selIcon = name;
    };
    grid.appendChild(d);
  });
}

function openAddCat() {
  $('nc-name').value = '';
  selIcon = 'star';
  buildIconGrid();
  const grid = $('icon-grid');
  if (grid) {
    grid.querySelectorAll('.io').forEach(el => {
      el.classList.toggle('on', el.dataset.icon === 'star');
    });
  }
  showOv('ov-addcat');
  setTimeout(() => { $('nc-name')?.focus(); }, 100);
}

async function saveNewCat() {
  const name = $('nc-name')?.value.trim();
  if (!name) {
    showErr(t('err_cat_name_required'));
    return;
  }
  if (!draft.type) {
    showErr(t('err_cat_type_missing'));
    return;
  }
  const payload = { user_id: UID, name, icon: selIcon, type: draft.type };

  if (db) {
    // .single() RLS yoki 0 qator qaytishi bilan PGRST116 beradi; insert bo‘lsa ham xato ko‘rinadi
    const { data, error } = await db.from('categories').insert([payload]).select();
    if (error) {
      console.warn('[saveNewCat]', error);
      showErr(t('err_cat_save') + (error.message ? ': ' + error.message : ''));
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) {
      cats[draft.type].push(row);
    } else {
      const { data: cd, error: ce } = await db.from('categories').select('*')
        .eq('user_id', UID).order('name');
      if (ce) {
        console.warn('[saveNewCat] refetch', ce);
        showErr(t('err_cat_save'));
        return;
      }
      if (cd?.length) {
        cats.income = cd.filter(c => c.type === 'income');
        cats.expense = cd.filter(c => c.type === 'expense');
      }
    }
  } else {
    cats[draft.type].push({ ...payload, id: Date.now() });
  }
  cats[draft.type].sort((a, b) => a.name.localeCompare(b.name));
  buildCatGrid(draft.type);
  if ($('stg-sub-cats')?.classList.contains('on')) renderStgCats();
  closeOv('ov-addcat');
  vib('light');
}

let ctxTimer;
function showCtxMenu(pos, idx, type) {
  selCatIdx = idx; selCatType = type;
  const m = $('ctx-menu');
  if (!m) return;
  m.style.left = Math.min((pos.clientX || 0), innerWidth - 160) + 'px';
  m.style.top = Math.min((pos.clientY || 0), innerHeight - 100) + 'px';
  m.style.display = 'block';
}
document.addEventListener('click', () => { const m = $('ctx-menu'); if (m) m.style.display = 'none'; });

function ctxEdit() {
  const cat = cats[selCatType]?.[selCatIdx];
  if (!cat) return;
  $('ec-name').value = cat.name;
  showOv('ov-editcat');
}
async function saveEditCat() {
  const n = $('ec-name')?.value.trim();
  if (!n) return;
  const cat = cats[selCatType]?.[selCatIdx];
  if (!cat) return;
  cats[selCatType][selCatIdx] = { ...cat, name: n };
  buildCatGrid(selCatType);
  closeOv('ov-editcat');
  if (db && cat.id) {
    const { error } = await db.from('categories').update({ name: n }).eq('id', cat.id).eq('user_id', UID);
    if (error) showErr('Yangilashda xatolik');
  }
}
async function ctxDel() {
  if (!confirm("Bu kategoriyani o'chirasizmi?")) return;
  const cat = cats[selCatType]?.[selCatIdx];
  if (!cat) return;
  cats[selCatType].splice(selCatIdx, 1);
  buildCatGrid(selCatType);
  if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
}

// ─── TRANSACTION ACTIONS ─────────────────────────────────
function openAction(id) {
  selTxId = id;
  const t = txList.find(x => x.id === id);
  if (!t) return;
  const btns = $('action-btns');
  if (!btns) return;
  btns.innerHTML = '';

  if (t.receipt || t.receipt_url) {
    const b = document.createElement('button');
    b.className = 'as-b green';
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Chekni ko'rish`;
    b.onclick = () => { const src = t.receipt_url || t.receipt; $('rec-img').src = src; $('rec-view').classList.add('on'); closeOv('ov-action'); };
    btns.appendChild(b);
  }

  const editB = document.createElement('button');
  editB.className = 'as-b blue';
  editB.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>Tahrirlash`;
  editB.onclick = () => { openEdit(); closeOv('ov-action'); };
  btns.appendChild(editB);

  const delB = document.createElement('button');
  delB.className = 'as-b red';
  delB.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>O'chirish`;
  delB.onclick = () => { closeOv('ov-action'); showOv('ov-delete'); };
  btns.appendChild(delB);

  showOv('ov-action');
}

function openEdit() {
  const t = txList.find(x => x.id === selTxId);
  if (!t) return;
  $('ed-cat').value = t.category;
  // Formatlangan ko'rinishda ko'rsatish
  $('ed-amt').value = fmt(t.amount).replace(/\s/g, ' ');
  $('ed-type').value = t.type;
  showOv('ov-edit');
}

async function saveEdit() {
  const cat = $('ed-cat')?.value.trim();
  const amt = getCleanAmount($('ed-amt')?.value);
  const typ = $('ed-type')?.value;
  if (!cat || !amt) return;

  const i = txList.findIndex(x => x.id === selTxId);
  if (i !== -1) txList[i] = { ...txList[i], category: cat, amount: amt, type: typ };
  closeOv('ov-edit');
  renderAll();
  renderHistory();

  if (db) {
    const { error } = await db.from('transactions').update({ category: cat, amount: amt, type: typ })
      .eq('id', selTxId).eq('user_id', UID);
    if (error) showErr('Yangilashda xatolik');
  }
}

async function confirmDel() {
  txList = txList.filter(t => t.id !== selTxId);
  closeOv('ov-delete');
  renderAll();
  renderHistory();
  if (db) await db.from('transactions').delete().eq('id', selTxId).eq('user_id', UID);
}

// ─── PIN ─────────────────────────────────────────────────
async function checkBioAvail() {
  return tg?.BiometricManager?.isBiometricAvailable || false;
}

function refreshPinIfOpen() {
  if (!$('pin-screen')?.classList.contains('on')) return;
  showPin(pinMode);
}

function showPin(mode) {
  pinMode = mode; pinBuf = '';
  updatePinDots();
  $('pin-screen')?.classList.add('on');
  const ttl = $('pin-ttl'), sub = $('pin-sub'), c = $('pin-cancel-b'), bio = $('pin-bio-b');

  const msgs = {
    unlock: [t('pin_title'), t('pin_enter')],
    setup_new: [t('pin_new'), t('pin_new_sub')],
    setup_confirm: [t('pin_confirm'), t('pin_confirm_sub')],
    change_old: [t('pin_old'), t('pin_old_sub')],
  };
  const [tt, ss] = msgs[mode] || msgs.unlock;
  if (ttl) ttl.textContent = tt;
  if (sub) sub.textContent = ss;
  if (c) {
    c.style.display = mode !== 'unlock' ? 'block' : 'none';
    c.textContent = t('pin_cancel');
  }
  const canBio = tg?.BiometricManager?.isBiometricAvailable && tg?.BiometricManager?.isAccessGranted;
  if (bio) bio.style.display = (mode === 'unlock' && canBio) ? 'flex' : 'none';
  const bioTxt = $('pin-bio-txt');
  if (bioTxt) bioTxt.textContent = t('pin_bio_btn');
  if (mode === 'unlock' && tg?.BiometricManager?.isBiometricTokenSaved) setTimeout(triggerBio, 300);
}

function pp(n) {
  vib('medium');
  if (pinBuf.length >= 4) return;
  pinBuf += n;
  updatePinDots();
  if (pinBuf.length === 4) setTimeout(checkPin, 200);
}
function pd() { pinBuf = pinBuf.slice(0, -1); updatePinDots(); }

function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    $('pd' + i)?.classList.toggle('on', i < pinBuf.length);
  }
}

function checkPin() {
  const shake = () => {
    $('pin-dots')?.classList.add('shk');
    setTimeout(() => { $('pin-dots')?.classList.remove('shk'); pinBuf = ''; updatePinDots(); }, 420);
  };

  if (pinMode === 'unlock') {
    if (pinBuf === pin) hidePinScreen();
    else shake();
  } else if (pinMode === 'change_old') {
    if (pinBuf === pin) showPin('setup_new');
    else shake();
  } else if (pinMode === 'setup_new') {
    pinTemp = pinBuf;
    showPin('setup_confirm');
  } else if (pinMode === 'setup_confirm') {
    if (pinBuf === pinTemp) {
      pin = pinTemp;
      store.set('pin', pin);
      hidePinScreen();
      updateSettingsUI();
      showErr('PIN o\'rnatildi ✅');
    } else {
      shake();
      setTimeout(() => showPin('setup_new'), 500);
    }
  }
}

async function triggerBio() {
  if (!tg?.BiometricManager?.isBiometricAvailable) return;
  tg.BiometricManager.authenticate({ reason: 'Kassa-ga xavfsiz kirish' }, (success, token) => {
    if (success) {
      hidePinScreen();
    }
  });
}

function hidePinScreen() {
  $('pin-screen')?.classList.remove('on');
  pinContext = null;
}

function cancelPin() {
  $('pin-screen')?.classList.remove('on');
  if (pinContext === 'settings') {
    showOv('ov-settings');
    updateSettingsUI();
  }
  pinContext = null;
}

function setupPin() {
  pinContext = 'settings';
  pin ? showPin('change_old') : showPin('setup_new');
}

function removePin() {
  if (!confirm('PIN kodni o\'chirasizmi?')) return;
  store.del('pin');
  pin = null;
  updateSettingsUI();
}

function toggleBio(ev) {
  ev?.stopPropagation?.();
  const bm = tg?.BiometricManager;
  if (!bm?.isBiometricAvailable) {
    showErr('Biometrika qurilmangizda mavjud emas');
    return;
  }

  if (bm.isAccessRequested && !bm.isAccessGranted) {
    bm.openSettings();
    return;
  }

  const tokenLabel = 'kassa-token';

  const afterTokenUpdate = (updated) => {
    if (!updated) showErr('Biometrika holati yangilanmadi. Qayta urinib ko‘ring.');
    else vib('light');
    updateSettingsUI();
  };

  if (!bm.isAccessRequested) {
    bm.requestAccess({ reason: 'Xavfsizlik uchun biometrikadan foydalanish' }, (granted) => {
      if (!granted) return;
      bm.updateBiometricToken(tokenLabel, afterTokenUpdate);
    });
  } else {
    const newToken = bm.isBiometricTokenSaved ? '' : tokenLabel;
    bm.updateBiometricToken(newToken, afterTokenUpdate);
  }
}

// ─── SETTINGS ────────────────────────────────────────────
function openSettings() { updateSettingsUI(); showOv('ov-settings'); }

function updateSettingsUI() {
  // Legacy check for old IDs (kept for compatibility)
  const ps = $('pin-status'), rb = $('pin-rm-b'), ri = $('rate-in');
  const br = $('bio-row'), bt = $('bio-tgl');
  if (ps) ps.textContent = pin ? 'Faol ✅' : 'O\'rnatilmagan';
  if (rb) rb.style.display = pin ? 'block' : 'none';
  if (ri) ri.value = rate ? fmt(rate).replace(/\s/g, ' ') : '';
  if (br) br.style.display = tg?.BiometricManager?.isBiometricAvailable ? 'flex' : 'none';
  if (bt) bt.classList.toggle('on', tg?.BiometricManager?.isBiometricTokenSaved);
  // Yangi sozlamalar: toggle holati faqat Telegram API (isBiometricTokenSaved) bo'yicha
  const stgBioTgl = $('stg-bio-tgl');
  const bm = tg?.BiometricManager;
  if (bm?.isBiometricAvailable && stgBioTgl) {
    const saved = !!bm.isBiometricTokenSaved;
    stgBioTgl.classList.toggle('on', saved);
    bioOn = saved;
    store.set('bio', saved ? 'true' : 'false');
  } else if (stgBioTgl && !bm?.isBiometricAvailable) {
    stgBioTgl.classList.remove('on');
  }
  // New settings UI
  updatePinUI();
  updateThemeIcon();
}

async function saveRate(v) {
  const n = Number(v);
  if (!n || n <= 0) {
    showErr(t('err_rate_invalid'));
    return;
  }

  rate = n;
  store.set('rate', rate);

  // Update UI immediately (dashboard balances)
  renderAll();

  if (db) {
    try {
      const { error } = await db.from('users').upsert(
        { user_id: UID, exchange_rate: rate },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      showErr('Kurs saqlandi ✅');
    } catch (e) {
      console.error('[saveRate]', e);
      showErr('Bazaga saqlashda xatolik: ' + (e.message || e));
    }
  } else {
    showErr('Kurs saqlandi (Lokal) ✅');
  }
}

async function saveRateFromStg() {
  const raw = $('stg-rate-in')?.value;
  const n = getCleanAmount(raw);
  if (!n || n <= 0) {
    showErr(t('err_rate_invalid'));
    return;
  }
  await saveRate(n);
  rateDraftStg = fmt(rate);
  closeOv('stg-sub-rate');
}

function closeStgRate(saved) {
  if (!saved) {
    const rateIn = $('stg-rate-in');
    if (rateIn && rateDraftStg !== null) rateIn.value = rateDraftStg;
  }
  closeOv('stg-sub-rate');
}

function closeStgRateBackdrop(e) {
  if (e) { const sh = e.currentTarget?.querySelector('.sheet'); if (sh && sh.contains(e.target)) return; }
  closeStgRate(false);
}

function toggleTheme() {
  document.body.classList.toggle('light');
  store.set('theme', document.body.classList.contains('light') ? 'light' : 'dark');
  updateThemeIcon();
}

// ─── EXPORT / IMPORT ─────────────────────────────────────
function openExport() {
  closeOv('ov-settings');
  const now = new Date(), first = new Date(now.getFullYear(), now.getMonth(), 1);
  $('ex-from').valueAsDate = first;
  $('ex-to').valueAsDate = now;
  updateExportPreview();
  $('ex-from').onchange = updateExportPreview;
  $('ex-to').onchange = updateExportPreview;
  showOv('ov-export');
}

function updateExportPreview() {
  const s = new Date($('ex-from')?.value || 0).getTime();
  const e = new Date($('ex-to')?.value || Date.now()).getTime() + 86400000;
  const d = txList.filter(t => t.ms >= s && t.ms < e);
  const cntEl = $('ex-cnt'), recEl = $('ex-rec');
  if (cntEl) cntEl.textContent = d.length + ' ta';
  if (recEl) recEl.textContent = d.filter(t => t.receipt || t.receipt_url).length + ' ta';
}

async function makePDF() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) { showErr('PDF kutubxonasi yuklanmagan!'); return; }

  const sStr = $('ex-from')?.value, eStr = $('ex-to')?.value;
  if (!sStr || !eStr) return;
  const s = new Date(sStr).getTime(), e = new Date(eStr).getTime() + 86400000;
  const data = txList.filter(t => t.ms >= s && t.ms < e).sort((a, b) => a.ms - b.ms);
  if (!data.length) { showErr("Hozircha ma'lumot yo'q"); return; }

  const doc = new jsPDF(), pw = doc.internal.pageSize.width;
  doc.setFillColor(10, 10, 15); doc.rect(0, 0, pw, 38, 'F');
  doc.setTextColor(255, 255, 255); doc.setFontSize(20); doc.text('Kassa — Moliyaviy Hisobot', 14, 17);
  doc.setFontSize(10); doc.setTextColor(160, 160, 180); doc.text(`${sStr} — ${eStr}`, 14, 28);

  const inc = data.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
  const exp = data.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
  let y = 48;
  doc.setTextColor(0); doc.setFontSize(10);
  doc.text('Kirim:', 14, y); doc.setTextColor(16, 185, 129); doc.setFont('helvetica', 'bold'); doc.text(`+${fmt(inc)} so'm`, 36, y);
  doc.setTextColor(0); doc.setFont('helvetica', 'normal');
  doc.text('Chiqim:', 80, y); doc.setTextColor(239, 68, 68); doc.setFont('helvetica', 'bold'); doc.text(`-${fmt(exp)} so'm`, 103, y);
  doc.setTextColor(0); doc.setFont('helvetica', 'normal');
  doc.text('Qoldiq:', 148, y); doc.setTextColor(124, 58, 237); doc.setFont('helvetica', 'bold'); doc.text(`${fmt(inc - exp)} so'm`, 168, y);
  doc.setFont('helvetica', 'normal');

  doc.autoTable({
    startY: y + 12,
    head: [['Sana', 'Kategoriya', 'Tur', 'Summa']],
    body: data.map(t => [
      new Date(t.ms).toLocaleDateString(), t.category,
      t.type === 'income' ? 'Kirim' : 'Chiqim',
      (t.type === 'income' ? '+' : '-') + fmt(t.amount),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [10, 10, 15] },
    styles: { fontSize: 9 },
    columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    didParseCell(d) {
      if (d.section === 'body' && d.column.index === 3) {
        d.cell.styles.textColor = d.cell.raw.startsWith('+') ? [16, 185, 129] : [239, 68, 68];
      }
    },
  });

  doc.save(`Kassa_${sStr}_${eStr}.pdf`);
  closeOv('ov-export');
}

function doExport() {
  const blob = new Blob([JSON.stringify({ txList, cats, pin, bio: bioOn }, null, 2)], { type: 'application/json' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `kassa_${isoNow().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function doImport(e) {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const bk = JSON.parse(ev.target.result);
      if (bk.pin) store.set('pin', bk.pin);
      if (bk.bio !== undefined) store.set('bio', bk.bio);
      if (Array.isArray(bk.txList) && bk.txList.length && db) {
        const rows = bk.txList.map(({ id, ms, receipt, ...r }) => ({
          ...r, user_id: UID, date: isoNow(r.date || ms || Date.now()),
        }));
        const { error } = await db.from('transactions').insert(rows);
        if (error) throw error;
      }
      showErr('Muvaffaqiyatli import! Qayta yuklanmoqda...');
      setTimeout(() => location.reload(), 1500);
    } catch (err) { showErr('Import xatolik: ' + err.message); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function resetData() {
  if (!confirm("DIQQAT! Barcha tranzaksiyalar o'chadi. Davom etasizmi?")) return;
  txList = [];
  renderAll();
  renderHistory();
  closeOv('ov-settings');
  if (db) db.from('transactions').delete().eq('user_id', UID).then(({ error }) => {
    if (error) showErr('O\'chirishda xatolik');
    else showErr('Tozalandi ✅');
  });
}

// ─── I18N (INTERNATIONALIZATION) ─────────────────────────
let currentLang = store.get('lang') || 'uz';
let T = {};

async function loadLang(lang) {
  try {
    // Vercel / har qanday hostda doim ildizdan: /lang/uz.json (vercel.json static build)
    const url = new URL(`/lang/${lang}.json`, window.location.origin);
    const res = await fetch(url.toString(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Lang file not found');
    T = await res.json();
    currentLang = lang;
    store.set('lang', lang);
  } catch (e) {
    console.warn('[i18n] Failed to load lang:', lang, e);
  }
}

function t(key) {
  return T[key] || key;
}

function applyLang() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (T[key]) el.textContent = T[key];
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (T[key]) el.placeholder = T[key];
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    if (T[key]) el.title = T[key];
  });
  ['uz', 'ru', 'en'].forEach(l => {
    const check = $(`lang-check-${l}`);
    if (check) check.textContent = l === currentLang ? '✓' : '';
  });
  document.documentElement.lang = currentLang === 'ru' ? 'ru' : currentLang === 'en' ? 'en' : 'uz';
}

async function changeLang(lang) {
  await loadLang(lang);
  applyLang();
  refreshPinIfOpen();
  renderAll();
  renderHistory();
  updateSettingsUI();
  initSettingsUI();
  closeOv('stg-sub-lang');
  vib('light');
}

// ─── SETTINGS SUB-PAGES ─────────────────────────────────
function openStgSub(id) {
  showOv(id);
  // Pre-fill data
  if (id === 'stg-sub-profile') {
    const nameIn = $('stg-name-in');
    if (nameIn) nameIn.value = store.get('display_name') || tg?.initDataUnsafe?.user?.first_name || '';
  }
  if (id === 'stg-sub-rate') {
    const rateIn = $('stg-rate-in');
    if (rateIn) {
      rateDraftStg = fmt(rate);
      rateIn.value = rateDraftStg;
    }
  }
  if (id === 'stg-sub-cats') {
    stgCatTab('income');
  }
  if (id === 'stg-sub-terms') {
    const el = $('stg-terms-text');
    if (el) el.textContent = (T.terms_text || '').replace(/\\n/g, '\n');
  }
  if (id === 'stg-sub-privacy') {
    const el = $('stg-privacy-text');
    if (el) el.textContent = (T.privacy_text || '').replace(/\\n/g, '\n');
  }
}

// ─── PROFILE ────────────────────────────────────────────
function saveProfile() {
  const name = $('stg-name-in')?.value.trim();
  if (!name) return;
  store.set('display_name', name);
  const nameEl = $('stg-user-name');
  if (nameEl) nameEl.textContent = name;
  closeOv('stg-sub-profile');
  vib('light');
  if (db) {
    db.from('users').update({ full_name: name }).eq('user_id', UID).then(({ error }) => {
      if (error) console.error('[saveProfile]', error);
    });
  }
}

function initSettingsUI() {
  // User name
  const userName = store.get('display_name') || tg?.initDataUnsafe?.user?.first_name || '—';
  const nameEl = $('stg-user-name');
  if (nameEl) nameEl.textContent = userName;

  // Theme icon
  updateThemeIcon();

  // PIN status
  updatePinUI();

  // Biometrik qatori — toggle holati updateSettingsUI / BiometricManager.init da sinxronlanadi
  const canBio = tg?.BiometricManager?.isBiometricAvailable;
  const bioRow = $('stg-bio-row');
  if (bioRow) bioRow.style.display = canBio ? 'flex' : 'none';
}

function updatePinUI() {
  const status = $('stg-pin-status');
  const rmRow = $('stg-pin-rm-row');
  if (pin) {
    if (status) status.textContent = t('stg_pin_set');
    if (rmRow) rmRow.style.display = 'flex';
  } else {
    if (status) status.textContent = t('stg_pin_not_set');
    if (rmRow) rmRow.style.display = 'none';
  }
}

function updateThemeIcon() {
  const ico = $('stg-theme-ico');
  if (ico) ico.textContent = document.body.classList.contains('light') ? '☀️' : '🌙';
}

// ─── CATEGORIES IN SETTINGS ─────────────────────────────
let stgCatType = 'income';

function stgCatTab(type) {
  stgCatType = type;
  $('stg-cat-inc-tab')?.classList.toggle('active', type === 'income');
  $('stg-cat-exp-tab')?.classList.toggle('active', type === 'expense');
  renderStgCats();
}

function renderStgCats() {
  const list = $('stg-cat-list');
  if (!list) return;
  const items = cats[stgCatType] || [];
  if (items.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">${t('no_data')}</div>`;
    return;
  }
  list.innerHTML = items.map((c, i) => `
    <div class="stg-cat-item">
      <div class="sti-ico">${svgIcon(c.icon || 'star')}</div>
      <div class="sti-name">${esc(c.name)}</div>
      <button class="sti-del" onclick="delStgCat(${i})">✕</button>
    </div>
  `).join('');
}

async function delStgCat(idx) {
  const cat = cats[stgCatType]?.[idx];
  if (!cat || !confirm(`"${cat.name}" ni o'chirasizmi?`)) return;
  cats[stgCatType].splice(idx, 1);
  renderStgCats();
  if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
}

function openAddCatFromStg() {
  draft.type = stgCatType;
  openAddCat();
}

// ─── EXTERNAL LINKS ─────────────────────────────────────
function openTgGroup() {
  const url = 'https://t.me/meningkassam_community';
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}

function openSupport() {
  const url = 'https://t.me/uyqur_nurali';
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(url);
  } else {
    window.open(url, '_blank');
  }
}



// ─── GLOBAL ERROR HANDLER ────────────────────────────────
window.addEventListener('unhandledrejection', e => {
  console.error('[unhandled]', e.reason);
});
window.addEventListener('error', e => {
  console.error('[error]', e.message);
});

