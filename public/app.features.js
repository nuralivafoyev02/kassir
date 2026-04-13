
'use strict';

(() => {
  let debtList = [];
  let planList = [];
  let debtTableAvailable = null;
  let planTableAvailable = null;
  let categoryKeywordsSupported = null;
  let planNameColumnSupported = null;
  let featureBooted = false;
  let debtRealtimeBound = false;
  let planRealtimeBound = false;
  let debtDataReady = false;
  let planDataReady = false;
  let debtFilterStatus = 'all';
  let debtFilterDirection = 'all';
  let debtSearchQuery = '';
  let planFilterState = 'all';
  let planAppNotifyReady = false;
  const lastFeatureRefreshAt = {
    all: 0,
    debt: 0,
    plan: 0,
  };
  const planNotifyState = new Map();
  const getSubscriptionSnapshot = () => (
    typeof window.getSubscriptionSnapshot === 'function'
      ? window.getSubscriptionSnapshot()
      : null
  );
  const getFeatureGate = (featureKey, context = {}) => (
    typeof window.getFeatureGateResult === 'function'
      ? window.getFeatureGateResult(featureKey, context)
      : { allowed: true, featureKey, snapshot: getSubscriptionSnapshot(), degraded: true }
  );
  const openFeaturePaywall = (featureKey, options = {}) => {
    if (typeof window.openUpgradePaywall === 'function') {
      return window.openUpgradePaywall(featureKey, options);
    }
    showErr(currentLang === 'ru' ? 'Premium тариф talab qilinadi' : currentLang === 'en' ? 'Premium required' : 'Premium tarif talab qilinadi');
    return false;
  };
  const handleFeatureGateError = (error, fallbackFeatureKey, source = 'feature') => (
    typeof window.handleUpgradeRequiredError === 'function'
      ? window.handleUpgradeRequiredError(error, fallbackFeatureKey, source)
      : false
  );

  const debtStoreKey = () => `kassa_debts_${UID}`;
  const planStoreKey = () => `kassa_plans_${UID}`;

  const readJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const writeJson = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
  };

  const fmtMoney = (amount) => `${fmt(amount)} ${tt('suffix_uzs', "so'm")}`;
  const fmtDateTimeShort = (value) => {
    if (!value) return '—';
    try {
      return new Date(value).toLocaleString(localeTag(), { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return String(value);
    }
  };
  const fmtForInput = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = v => String(v).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const pad2 = (value) => String(value).padStart(2, '0');
  const setDateInputParts = (prefix, value) => {
    const dateEl = $(`${prefix}-date`);
    const timeEl = $(`${prefix}-time`);
    if (!dateEl || !timeEl) return;
    if (!value) {
      dateEl.value = '';
      timeEl.value = '';
      return;
    }
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return;
    dateEl.value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    timeEl.value = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const combineDateTimeParts = (prefix) => {
    const dateValue = String($(`${prefix}-date`)?.value || '');
    const timeValue = String($(`${prefix}-time`)?.value || '');
    if (!dateValue) return null;
    const raw = `${dateValue}T${timeValue || '09:00'}`;
    const stamp = new Date(raw);
    return Number.isNaN(stamp.getTime()) ? null : stamp.toISOString();
  };
  const computeReminderByPreset = (dueAt, mode = 'same') => {
    if (!dueAt) return null;
    const due = new Date(dueAt);
    if (Number.isNaN(due.getTime())) return null;
    const remind = new Date(due);
    if (mode === '30m') remind.setMinutes(remind.getMinutes() - 30);
    else if (mode === '1h') remind.setHours(remind.getHours() - 1);
    else if (mode === '1d') remind.setDate(remind.getDate() - 1);
    return remind.toISOString();
  };
  const detectReminderPreset = (dueAt, remindAt) => {
    if (!dueAt || !remindAt) return 'same';
    const due = new Date(dueAt).getTime();
    const remind = new Date(remindAt).getTime();
    const diff = due - remind;
    if (Math.abs(diff) < 60 * 1000) return 'same';
    if (Math.abs(diff - 30 * 60 * 1000) < 60 * 1000) return '30m';
    if (Math.abs(diff - 60 * 60 * 1000) < 60 * 1000) return '1h';
    if (Math.abs(diff - 24 * 60 * 60 * 1000) < 60 * 1000) return '1d';
    return 'custom';
  };
  const setDebtDirectionButtons = (mode = 'receivable') => {
    const normalized = mode === 'payable' ? 'payable' : 'receivable';
    const input = $('debt-direction');
    if (input) input.value = normalized;
    $('debt-dir-receivable-btn')?.classList.toggle('active', normalized === 'receivable');
    $('debt-dir-payable-btn')?.classList.toggle('active', normalized === 'payable');
  };
  const updateDebtReminderPresetUI = (mode = 'same') => {
    const wrap = $('debt-reminder-presets');
    if (!wrap) return;
    wrap.dataset.mode = mode;
    wrap.querySelectorAll('.quick-chip').forEach((el) => el.classList.toggle('active', el.dataset.mode === mode));
    const customWrap = $('debt-remind-custom-wrap');
    if (customWrap) customWrap.style.display = mode === 'custom' ? 'grid' : 'none';
    const hint = $('debt-remind-hint');
    if (hint) {
      const textMap = {
        same: currentLang === 'ru' ? 'Бот напомнит точно в указанное время.' : currentLang === 'en' ? 'The bot will remind exactly at the due time.' : "Bot aynan belgilangan vaqtda eslatadi.",
        '30m': currentLang === 'ru' ? 'Бот напомнит за 30 минут до срока.' : currentLang === 'en' ? 'The bot will remind 30 minutes before the due time.' : "Bot muddatdan 30 daqiqa oldin eslatadi.",
        '1h': currentLang === 'ru' ? 'Бот напомнит за 1 час до срока.' : currentLang === 'en' ? 'The bot will remind 1 hour before the due time.' : "Bot muddatdan 1 soat oldin eslatadi.",
        '1d': currentLang === 'ru' ? 'Бот напомнит за 1 день до срока.' : currentLang === 'en' ? 'The bot will remind 1 day before the due time.' : "Bot muddatdan 1 kun oldin eslatadi.",
        custom: currentLang === 'ru' ? 'Укажите отдельную дату и время напоминания вручную.' : currentLang === 'en' ? 'Set a custom reminder date and time manually.' : "Eslatma uchun alohida sana va vaqtni qo'lda belgilang."
      };
      hint.textContent = textMap[mode] || textMap.same;
    }
  };
  const monthKey = (value = Date.now()) => {
    const d = new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const monthLabel = (value) => {
    if (!value) return '—';
    try {
      const [y, m] = String(value).split('-');
      const d = new Date(Number(y), Number(m) - 1, 1);
      return d.toLocaleDateString(localeTag(), { month: 'long', year: 'numeric' });
    } catch {
      return String(value);
    }
  };
  const normalizeWords = (value) => {
    if (Array.isArray(value)) {
      return [...new Set(value.map(v => String(v || '').trim()).filter(Boolean))];
    }
    return [...new Set(String(value || '')
      .split(/[\n,;]+/g)
      .map(v => v.trim())
      .filter(Boolean))];
  };
  const getKeywordsText = (cat) => normalizeWords(cat?.keywords).join(', ');
  const getUsageCount = (name) => txList.filter(tx => baseCategoryName(tx.category) === name).length;
  const baseCategoryName = (name) => String(name || '').replace(/\s*\(\$.*\)\s*$/u, '').trim();
  const normalizeTextForMatch = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʻ’`']/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const relationMissing = (error, table) => {
    const msg = String(error?.message || error?.details || '').toLowerCase();
    return msg.includes(`table '${table}'`) || msg.includes(`relation "public.${table}"`) || (msg.includes(table.toLowerCase()) && msg.includes('schema cache')) || msg.includes('does not exist');
  };
  const missingColumn = (error, column) => {
    const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    const target = String(column || '').toLowerCase();
    return !!target && msg.includes(target) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('unknown column') || msg.includes('could not find the column'));
  };
  const notNullConstraintOn = (error, column) => {
    const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    const target = String(column || '').toLowerCase();
    return !!target && msg.includes('null value') && msg.includes(target) && msg.includes('not-null constraint');
  };
  const duplicateKeyError = (error) => {
    const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
    return msg.includes('duplicate key') || msg.includes('unique constraint') || msg.includes('already exists');
  };
  const featureSnapshot = () => ({
    debtReady: debtDataReady,
    planReady: planDataReady,
    debts: debtList.map((item) => ({ ...item })),
    plans: planList.map((item) => ({ ...item })),
  });
  const publishFeatureSnapshot = () => {
    window.__KASSA_FINANCE_FEATURES__ = {
      getSnapshot: featureSnapshot,
      getPlanStats: (plan) => getPlanStats(plan),
    };
  };
  const refreshDashboardAnalytics = () => {
    publishFeatureSnapshot();
    if (typeof window.renderDashboardAnalytics === 'function') {
      window.renderDashboardAnalytics();
    }
  };
  const featureRefreshKeys = (mode = 'all') => {
    if (mode === 'debt') return ['all', 'debt'];
    if (mode === 'plan') return ['all', 'plan'];
    return ['all', 'debt', 'plan'];
  };
  const shouldSkipFeatureRefresh = (mode = 'all', force = false, now = Date.now()) => {
    if (force) return false;
    return featureRefreshKeys(mode).some((key) => now - (lastFeatureRefreshAt[key] || 0) < 4000);
  };
  const markFeatureRefresh = (mode = 'all', now = Date.now()) => {
    if (mode === 'debt') {
      lastFeatureRefreshAt.debt = now;
      return;
    }
    if (mode === 'plan') {
      lastFeatureRefreshAt.plan = now;
      return;
    }
    lastFeatureRefreshAt.all = now;
    lastFeatureRefreshAt.debt = now;
    lastFeatureRefreshAt.plan = now;
  };
  const normalizePlanName = (row) => String(row?.category_name || row?.name || row?.category || '').trim();
  const normalizePlanMonthKey = (row) => String(row?.month_key || row?.month || '').trim();
  const normalizePlanType = (row) => String(row?.type || 'expense').toLowerCase() === 'income' ? 'income' : 'expense';
  const normalizeCategoryKey = (value) => normalizeTextForMatch(baseCategoryName(value || ''));
  const samePlanCategory = (row, categoryName = '', categoryId = null) => {
    const rowCatId = row?.category_id ? String(row.category_id) : '';
    const nextCatId = categoryId ? String(categoryId) : '';
    if (rowCatId && nextCatId) return rowCatId === nextCatId;
    return normalizeCategoryKey(normalizePlanName(row)) === normalizeCategoryKey(categoryName);
  };
  const planMatchesTarget = (row, categoryName = '', categoryId = null, month = '') => {
    if (!samePlanCategory(row, categoryName, categoryId)) return false;
    const rowMonth = normalizePlanMonthKey(row);
    if (rowMonth && month) return rowMonth === month;
    return true;
  };
  const findExistingPlanLocal = ({ categoryName = '', categoryId = null, month = '' } = {}) => {
    const exact = planList.find((item) => planMatchesTarget(item, categoryName, categoryId, month));
    if (exact) return exact;
    return planList.find((item) => samePlanCategory(item, categoryName, categoryId)) || null;
  };
  const dedupePlanRows = (rows) => {
    const map = new Map();
    (rows || []).forEach((row) => {
      const normalized = normalizePlan(row);
      const key = `${normalized.category_id ? String(normalized.category_id) : normalizeCategoryKey(normalized.category_name)}|${normalizePlanMonthKey(normalized) || 'legacy'}|${normalizePlanType(normalized)}`;
      const prev = map.get(key);
      const prevTs = new Date(prev?.updated_at || prev?.created_at || 0).getTime() || 0;
      const nextTs = new Date(normalized?.updated_at || normalized?.created_at || 0).getTime() || 0;
      if (!prev || nextTs >= prevTs) map.set(key, normalized);
    });
    return Array.from(map.values());
  };
  const planMatchesTransaction = (plan, tx) => normalizeCategoryKey(tx?.category) === normalizeCategoryKey(plan?.category_name);
  const normalizePlanAmount = (row) => Number(row?.amount ?? row?.limit_amount ?? row?.plan_amount ?? row?.limit ?? 0) || 0;
  const normalizePlanAlert = (row) => Number(row?.alert_before ?? row?.alert_amount ?? row?.alert_limit ?? 0) || 0;
  const planNameCol = () => (planNameColumnSupported === 'name' ? 'name' : 'category_name');
  const planDbPayload = (payload) => {
    const next = { ...payload };
    const value = normalizePlanName(next);
    delete next.category_name;
    delete next.name;
    next[planNameCol()] = value;
    return next;
  };

  const debtSettlementSourceRef = (debtId) => `debt:${debtId}`;
  const debtSettlementMeta = (debt) => ({
    type: debt.direction === 'receivable' ? 'income' : 'expense',
    category: debt.direction === 'receivable' ? `Qarz qaytdi · ${debt.person_name}` : `Qarz qaytarildi · ${debt.person_name}`
  });

  async function createDebtSettlementTx(debt) {
    const sourceRef = debtSettlementSourceRef(debt.id);
    const existing = txList.find(tx => Number(tx.id) === Number(debt.settlement_tx_id || 0) || String(tx.source_ref || '') === sourceRef);
    if (existing) return { tx: existing, created: false };

    const meta = debtSettlementMeta(debt);
    const row = {
      user_id: UID,
      amount: Number(debt.amount || 0),
      category: meta.category,
      type: meta.type,
      date: isoNow(),
      source_ref: sourceRef,
    };

    if (!db) {
      const localTx = normTx({ ...row, id: Date.now() + Math.floor(Math.random() * 1000) });
      txList.unshift(localTx);
      return { tx: localTx, created: true };
    }

    const { data, error } = await insertTransactions([row], 'debt_settlement');
    if (error) throw error;
    const saved = normTx(Array.isArray(data) ? data[0] : data);
    if (saved && !txList.some(tx => Number(tx.id) === Number(saved.id))) txList.unshift(saved);
    return { tx: saved, created: true };
  }

  async function removeDebtSettlementTx(debt) {
    const linkedId = Number(debt.settlement_tx_id || 0);
    const sourceRef = debtSettlementSourceRef(debt.id);
    txList = txList.filter(tx => !(linkedId ? Number(tx.id) === linkedId : String(tx.source_ref || '') === sourceRef));

    if (!db) return;

    let query = db.from('transactions').delete().eq('user_id', UID);
    if (linkedId) query = query.eq('id', linkedId);
    else query = query.eq('source_ref', sourceRef);
    const { error } = await query;
    if (error && !isMissingColumnError(error, 'source_ref')) throw error;
  }

  function syncPlanAppNotifications() {
    const seen = new Set();
    for (const plan of planList.filter(item => item.is_active !== false && item.notify_app)) {
      const next = getPlanStats(plan);
      const prev = planNotifyState.get(plan.id);
      if (planAppNotifyReady && prev) {
        const crossedAlert = prev.remaining > Number(plan.alert_before || 0) && next.remaining <= Number(plan.alert_before || 0) && !next.completed;
        const crossedLimit = !prev.completed && next.completed;
        if (crossedLimit) showErr(`${plan.category_name}: reja to'ldi ⚠️`, 3200);
        else if (crossedAlert && Number(plan.alert_before || 0) > 0) showErr(`${plan.category_name}: ${fmtMoney(next.remaining)} qoldi`, 3200);
      }
      planNotifyState.set(plan.id, { remaining: next.remaining, exceeded: next.exceeded, completed: next.completed });
      seen.add(plan.id);
    }

    Array.from(planNotifyState.keys()).forEach((id) => {
      if (!seen.has(id)) planNotifyState.delete(id);
    });
    planAppNotifyReady = true;
  }

  function syncSettingsCategoryEntry() {
    document.querySelectorAll('.stg-item').forEach((el) => {
      if (String(el.getAttribute('onclick') || '').includes("stg-sub-cats")) {
        el.classList.remove('stg-disabled');
        el.classList.add('settings-feature-live');
      }
    });
  }

  function ensureEditIconGrid(selected = 'star') {
    const grid = $('edit-icon-grid');
    if (!grid) return;
    grid.innerHTML = '';
    ICON_NAMES.forEach(name => {
      const d = document.createElement('div');
      d.className = 'io';
      d.dataset.icon = name;
      d.innerHTML = svgIcon(name);
      if (name === selected) d.classList.add('on');
      d.onclick = () => {
        grid.querySelectorAll('.io').forEach(x => x.classList.remove('on'));
        d.classList.add('on');
        window.__EDIT_CAT_ICON__ = name;
      };
      grid.appendChild(d);
    });
    window.__EDIT_CAT_ICON__ = selected || 'star';
  }

  async function insertCategoryEnhanced(payload) {
    if (!db) return { data: [{ ...payload, id: Date.now() }], error: null };
    const enriched = { ...payload, keywords: normalizeWords(payload.keywords) };
    if (categoryKeywordsSupported !== false) {
      const res = await db.from('categories').insert([enriched]).select();
      if (!res.error) {
        categoryKeywordsSupported = true;
        return res;
      }
      if (!isMissingColumnError(res.error, 'keywords')) return res;
      categoryKeywordsSupported = false;
    }
    const fallback = { ...payload };
    delete fallback.keywords;
    return db.from('categories').insert([fallback]).select();
  }

  async function updateCategoryEnhanced(cat, payload) {
    if (!db || !cat?.id) return { error: null };
    const enriched = { ...payload, keywords: normalizeWords(payload.keywords) };
    if (categoryKeywordsSupported !== false) {
      const res = await db.from('categories').update(enriched).eq('id', cat.id).eq('user_id', UID);
      if (!res.error) {
        categoryKeywordsSupported = true;
        return res;
      }
      if (!isMissingColumnError(res.error, 'keywords')) return res;
      categoryKeywordsSupported = false;
    }
    const fallback = { ...payload };
    delete fallback.keywords;
    return db.from('categories').update(fallback).eq('id', cat.id).eq('user_id', UID);
  }

  function renderStgCatsEnhanced() {
    const list = $('stg-cat-list');
    if (!list) return;
    const items = (cats[stgCatType] || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    if (!items.length) {
      list.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px">${tt('no_data', "Ma'lumot yo'q")}</div>`;
      return;
    }
    list.innerHTML = items.map((cat, idx) => `
      <div class="stg-cat-card">
        <div class="stg-cat-row">
          <div class="stg-cat-main">
            <div class="stg-cat-icon">${svgIcon(cat.icon || 'star')}</div>
            <div class="stg-cat-meta">
              <div class="stg-cat-name">${escapeHtml(cat.name)}</div>
              <div class="stg-cat-keywords">${escapeHtml(getKeywordsText(cat) || (currentLang === 'ru' ? 'Ключевые слова не заданы' : currentLang === 'en' ? 'No keywords yet' : "Kalit so'zlar kiritilmagan"))}</div>
              <div class="stg-cat-usage">${getUsageCount(cat.name)} ta tranzaksiya</div>
            </div>
          </div>
          <div class="stg-cat-actions">
            <button class="stg-icon-btn" onclick="editStgCat(${idx})">✏️</button>
            <button class="stg-icon-btn danger" onclick="delStgCat(${idx})">🗑</button>
          </div>
        </div>
      </div>`).join('');
  }

  window.editStgCat = function editStgCat(idx) {
    selCatType = stgCatType;
    selCatIdx = idx;
    const cat = cats[selCatType]?.[selCatIdx];
    if (!cat) return;
    $('ec-name').value = cat.name || '';
    if ($('ec-keywords')) $('ec-keywords').value = getKeywordsText(cat);
    ensureEditIconGrid(cat.icon || 'star');
    showOv('ov-editcat');
  };

  window.renderStgCats = renderStgCatsEnhanced;

  window.saveNewCat = async function saveNewCatEnhanced() {
    const name = $('nc-name')?.value.trim();
    const keywords = normalizeWords($('nc-keywords')?.value || '');
    if (!name) return showErr(tt('err_cat_name_required', 'Kategoriya nomini kiriting'));
    if (!draft.type) return showErr(tt('err_cat_type_missing', 'Tur tanlanmagan'));

    const payload = { user_id: UID, name, icon: selIcon, type: draft.type, keywords };
    const existing = (cats[draft.type] || []).find(c => String(c.name || '').toLowerCase() === name.toLowerCase());
    if (existing) return showErr(currentLang === 'ru' ? "Bu nomdagi kategoriya bor" : currentLang === 'en' ? 'Category already exists' : "Bu nomdagi kategoriya mavjud");

    const { data, error } = await insertCategoryEnhanced(payload);
    if (error) return showErr(tt('err_cat_save', "Saqlab bo'lmadi") + (error.message ? `: ${error.message}` : ''));

    const row = Array.isArray(data) ? data[0] : data;
    cats[draft.type].push(row || { ...payload, id: Date.now() });
    cats[draft.type].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    buildCatGrid(draft.type);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    closeOv('ov-addcat');
    vib('light');
    showErr(currentLang === 'ru' ? 'Категория сохранена ✅' : currentLang === 'en' ? 'Category saved ✅' : 'Kategoriya saqlandi ✅', 2200);
  };

  window.ctxEdit = function ctxEditEnhanced() {
    const cat = cats[selCatType]?.[selCatIdx];
    if (!cat) return;
    $('ec-name').value = cat.name || '';
    if ($('ec-keywords')) $('ec-keywords').value = getKeywordsText(cat);
    ensureEditIconGrid(cat.icon || 'star');
    showOv('ov-editcat');
  };

  window.saveEditCat = async function saveEditCatEnhanced() {
    const n = $('ec-name')?.value.trim();
    const cat = cats[selCatType]?.[selCatIdx];
    if (!n || !cat) return;
    const keywords = normalizeWords($('ec-keywords')?.value || '');
    const icon = window.__EDIT_CAT_ICON__ || cat.icon || 'star';
    const next = { ...cat, name: n, keywords, icon };
    cats[selCatType][selCatIdx] = next;
    buildCatGrid(selCatType);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    closeOv('ov-editcat');
    if (db && cat.id) {
      const { error } = await updateCategoryEnhanced(cat, { name: n, keywords, icon });
      if (error) showErr(tt('err_update_failed', 'Yangilashda xatolik'));
    }
  };

  window.delStgCat = async function delStgCatEnhanced(idx) {
    const cat = cats[stgCatType]?.[idx];
    if (!cat) return;
    if (!confirm(currentLang === 'ru' ? `Удалить категорию "${cat.name}"?` : currentLang === 'en' ? `Delete category "${cat.name}"?` : `"${cat.name}" kategoriyasini o'chirasizmi?`)) return;
    cats[stgCatType].splice(idx, 1);
    buildCatGrid(stgCatType);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
  };

  window.ctxDel = async function ctxDelEnhanced() {
    const cat = cats[selCatType]?.[selCatIdx];
    if (!cat) return;
    if (!confirm(tt('confirm_delete_category', "Bu kategoriyani o'chirasizmi?"))) return;
    cats[selCatType].splice(selCatIdx, 1);
    buildCatGrid(selCatType);
    renderStgCatsEnhanced();
    populatePlanCategoryOptions();
    if (db && cat.id) await db.from('categories').delete().eq('id', cat.id).eq('user_id', UID);
  };

  function normalizeDebt(row) {
    return {
      id: row.id || Date.now(),
      user_id: row.user_id || UID,
      person_name: String(row.person_name || '').trim(),
      amount: Number(row.amount) || 0,
      direction: row.direction === 'payable' ? 'payable' : 'receivable',
      due_at: row.due_at || null,
      remind_at: row.remind_at || row.due_at || null,
      note: String(row.note || '').trim(),
      status: row.status === 'paid' ? 'paid' : 'open',
      paid_at: row.paid_at || null,
      settlement_tx_id: row.settlement_tx_id || null,
      created_at: row.created_at || isoNow(),
      updated_at: row.updated_at || isoNow(),
    };
  }

  function normalizePlan(row) {
    return {
      id: row.id || Date.now(),
      user_id: row.user_id || UID,
      category_id: row.category_id || null,
      category_name: normalizePlanName(row),
      amount: normalizePlanAmount(row),
      alert_before: normalizePlanAlert(row),
      notify_bot: row.notify_bot !== false,
      notify_app: row.notify_app !== false,
      is_active: row.is_active !== false,
      month_key: row.month_key || row.month || monthKey(),
      created_at: row.created_at || isoNow(),
      updated_at: row.updated_at || isoNow(),
    };
  }

  async function loadDebtsData() {
    if (!db || !UID) {
      debtList = (readJson(debtStoreKey(), []) || []).map(normalizeDebt);
      debtDataReady = true;
      refreshDashboardAnalytics();
      return;
    }
    const { data, error } = await db.from('debts').select('*').eq('user_id', UID).order('due_at', { ascending: true });
    if (error) {
      if (relationMissing(error, 'debts')) {
        debtTableAvailable = false;
        debtList = (readJson(debtStoreKey(), []) || []).map(normalizeDebt);
        debtDataReady = true;
        refreshDashboardAnalytics();
        return;
      }
      throw error;
    }
    debtTableAvailable = true;
    debtList = (data || []).map(normalizeDebt);
    debtDataReady = true;
    refreshDashboardAnalytics();
  }

  async function loadPlanData() {
    if (!db || !UID) {
      planList = (readJson(planStoreKey(), []) || []).map(normalizePlan);
      planDataReady = true;
      refreshDashboardAnalytics();
      return;
    }

    let response = await db.from('category_limits').select('*').eq('user_id', UID).order('created_at', { ascending: false });
    if (response.error && missingColumn(response.error, 'created_at')) {
      response = await db.from('category_limits').select('*').eq('user_id', UID);
    }

    const { data, error } = response;
    if (error) {
      if (relationMissing(error, 'category_limits')) {
        planTableAvailable = false;
        planList = (readJson(planStoreKey(), []) || []).map(normalizePlan);
        planDataReady = true;
        refreshDashboardAnalytics();
        return;
      }
      throw error;
    }
    planTableAvailable = true;
    if (Array.isArray(data) && data.some(row => row && typeof row === 'object' && 'name' in row && !('category_name' in row))) planNameColumnSupported = 'name';
    planList = dedupePlanRows(data || [])
      .sort((a, b) => {
        const aTs = new Date(a.updated_at || a.created_at || 0).getTime() || 0;
        const bTs = new Date(b.updated_at || b.created_at || 0).getTime() || 0;
        if (bTs !== aTs) return bTs - aTs;
        return Number(b.id || 0) - Number(a.id || 0);
      });
    planDataReady = true;
    refreshDashboardAnalytics();
  }

  function persistLocalDebts() { writeJson(debtStoreKey(), debtList); }
  function persistLocalPlans() { writeJson(planStoreKey(), planList); }
  const getActiveDebtCount = ({ excludingId = null } = {}) => debtList.filter((item) => (
    item.status === 'open' && (excludingId == null || Number(item.id) !== Number(excludingId))
  )).length;
  const getActivePlanCount = ({ excludingId = null } = {}) => planList.filter((item) => (
    item.is_active !== false && (excludingId == null || Number(item.id) !== Number(excludingId))
  )).length;
  const requireDebtCreateAccess = ({ excludingId = null, source = 'debt' } = {}) => {
    const gate = getFeatureGate('debt_create', { activeDebtsCount: getActiveDebtCount({ excludingId }) });
    if (gate.allowed) return true;
    openFeaturePaywall(gate.featureKey, { gate, source });
    return false;
  };
  const requirePlanCreateAccess = ({ excludingId = null, source = 'plan' } = {}) => {
    const activePlansCount = getActivePlanCount({ excludingId });
    const gate = getFeatureGate('plan_create', {
      activePlansCount,
      activeLimitsCount: activePlansCount,
    });
    if (gate.allowed) return true;
    openFeaturePaywall(gate.featureKey, { gate, source });
    return false;
  };
  const requireCustomReminderAccess = ({ source = 'debt' } = {}) => {
    const gate = getFeatureGate('custom_reminder_time');
    if (gate.allowed) return true;
    openFeaturePaywall(gate.featureKey, { gate, source });
    return false;
  };

  function debtDirectionLabel(direction) {
    return direction === 'payable'
      ? (currentLang === 'ru' ? 'Вы должны' : currentLang === 'en' ? 'You owe' : 'Siz berasiz')
      : (currentLang === 'ru' ? 'Должны вам' : currentLang === 'en' ? 'They owe you' : 'Sizga berishadi');
  }

  function debtStatusLabel(status) {
    return status === 'paid'
      ? (currentLang === 'ru' ? 'Yopilgan' : currentLang === 'en' ? 'Closed' : 'Yopilgan')
      : (currentLang === 'ru' ? 'Kutilmoqda' : currentLang === 'en' ? 'Open' : 'Kutilmoqda');
  }

  function debtDueMeta(item) {
    const target = item.due_at || item.remind_at || item.created_at;
    const ts = target ? new Date(target).getTime() : 0;
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const end = start + 86400000;
    return {
      target,
      ts,
      isToday: !!ts && ts >= start && ts < end,
      isOverdue: item.status === 'open' && !!ts && ts < Date.now(),
      isUpcoming: item.status === 'open' && !!ts && ts >= Date.now(),
    };
  }

  function updateActivePills(prefix, value) {
    document.querySelectorAll(`[id^="${prefix}"]`).forEach((el) => el.classList.remove('on'));
    const active = $(`${prefix}${value}`);
    if (active) active.classList.add('on');
  }

  window.setDebtFilter = function setDebtFilter(mode = 'all') {
    debtFilterStatus = mode;
    updateActivePills('debt-filter-', mode);
    renderDebts();
  };

  window.setDebtDirectionFilter = function setDebtDirectionFilter(mode = 'all') {
    debtFilterDirection = mode;
    updateActivePills('debt-dir-', mode);
    renderDebts();
  };

  window.setDebtSearch = function setDebtSearch(value = '') {
    debtSearchQuery = String(value || '').trim().toLowerCase();
    const clearBtn = $('debt-search')?.parentElement?.querySelector('.debt-search-clear');
    if (clearBtn) clearBtn.style.opacity = debtSearchQuery ? '1' : '.55';
    renderDebts();
  };

  window.clearDebtSearch = function clearDebtSearch() {
    debtSearchQuery = '';
    if ($('debt-search')) $('debt-search').value = '';
    renderDebts();
  };

  function debtMatchesSearch(item) {
    if (!debtSearchQuery) return true;
    const hay = [
      item.person_name,
      item.note,
      item.direction,
      item.status,
      String(item.amount || ''),
      fmt(item.amount || 0),
      fmtMoney(item.amount || 0)
    ].join(' ').toLowerCase();
    return hay.includes(debtSearchQuery);
  }

  function debtReminderLabel(item) {
    if (!item.remind_at) return currentLang === 'ru' ? 'Без напоминания' : currentLang === 'en' ? 'No reminder' : "Eslatma yo'q";
    if (item.due_at && item.remind_at === item.due_at) return currentLang === 'ru' ? 'Точно в срок' : currentLang === 'en' ? 'At due time' : "Muddat vaqtida";
    return fmtDateTimeShort(item.remind_at);
  }

  function debtRelativeLabel(item) {
    const meta = debtDueMeta(item);
    if (!meta.ts) return currentLang === 'ru' ? 'Срок не указан' : currentLang === 'en' ? 'No due date' : 'Muddat belgilanmagan';
    if (item.status === 'paid') return currentLang === 'ru' ? 'Закрыт' : currentLang === 'en' ? 'Closed' : 'Yopilgan';
    const diff = meta.ts - Date.now();
    const abs = Math.abs(diff);
    const mins = Math.round(abs / 60000);
    const hours = Math.round(abs / 3600000);
    const days = Math.round(abs / 86400000);
    const prefix = diff < 0
      ? (currentLang === 'ru' ? 'Kechikdi' : currentLang === 'en' ? 'Late by' : 'Kechikdi')
      : (currentLang === 'ru' ? 'Qoldi' : currentLang === 'en' ? 'Left' : 'Qoldi');
    if (mins < 60) return `${prefix} ${mins} ${currentLang === 'ru' ? 'мин' : currentLang === 'en' ? 'min' : 'daq'}`;
    if (hours < 48) return `${prefix} ${hours} ${currentLang === 'ru' ? 'ч' : currentLang === 'en' ? 'h' : 'soat'}`;
    return `${prefix} ${days} ${currentLang === 'ru' ? 'д' : currentLang === 'en' ? 'd' : 'kun'}`;
  }

  function debtSectionKey(item) {
    const meta = debtDueMeta(item);
    if (item.status === 'paid') return 'paid';
    if (meta.isOverdue) return 'overdue';
    if (meta.isToday) return 'today';
    if (meta.isUpcoming) return 'upcoming';
    return 'nodate';
  }

  function debtSectionLabel(key) {
    const map = {
      overdue: currentLang === 'ru' ? 'Мuddati o‘tganlar' : currentLang === 'en' ? 'Overdue' : "Muddati o'tganlar",
      today: currentLang === 'ru' ? 'Сегодня' : currentLang === 'en' ? 'Today' : 'Bugun',
      upcoming: currentLang === 'ru' ? 'Ближайшие' : currentLang === 'en' ? 'Upcoming' : 'Yaqinlashayotganlar',
      nodate: currentLang === 'ru' ? 'Без срока' : currentLang === 'en' ? 'No due date' : 'Muddat belgilanmaganlar',
      paid: currentLang === 'ru' ? 'Yopilganlar' : currentLang === 'en' ? 'Closed' : 'Yopilganlar'
    };
    return map[key] || key;
  }

  function renderDebtCard(item) {
    const due = debtDueMeta(item);
    const directionClass = item.direction === 'receivable' ? 'good' : 'warn';
    const amountClass = item.direction === 'receivable' ? 'is-positive' : 'is-negative';
    const statusClass = due.isOverdue ? 'danger' : (item.status === 'paid' ? 'good' : 'warn');
    const noteText = item.note || (item.direction === 'receivable'
      ? (currentLang === 'ru' ? 'Вам должны вернуть долг' : currentLang === 'en' ? 'They should pay you back' : "Sizga qaytarilishi kerak")
      : (currentLang === 'ru' ? 'Вы должны вернуть долг' : currentLang === 'en' ? 'You should pay it back' : "Siz qaytarishingiz kerak"));
    return `
      <details class="debt-card debt-card-collapsible ${due.isOverdue ? 'is-overdue' : ''} ${item.status === 'paid' ? 'is-paid' : ''}">
        <summary class="debt-card-summary">
          <div class="debt-card-summary-main">
            <div class="debt-card-person">${escapeHtml(item.person_name || '—')}</div>
            <div class="debt-card-summary-tail"><div class="debt-card-amount ${amountClass}">${fmtMoney(item.amount)}</div><div class="debt-card-chevron">⌄</div></div>
          </div>
        </summary>

        <div class="debt-card-details">
          <div class="debt-card-note">${escapeHtml(noteText)}</div>
          <div class="debt-card-meta-grid">
            <div class="debt-glance-item">
              <span>${currentLang === 'ru' ? 'Тип' : currentLang === 'en' ? 'Type' : 'Turi'}</span>
              <strong>${escapeHtml(debtDirectionLabel(item.direction))}</strong>
            </div>
            <div class="debt-glance-item">
              <span>${currentLang === 'ru' ? 'Срок' : currentLang === 'en' ? 'Due' : 'Muddat'}</span>
              <strong>${escapeHtml(due.target ? fmtDateTimeShort(due.target) : '—')}</strong>
            </div>
            <div class="debt-glance-item">
              <span>${currentLang === 'ru' ? 'Qolgan vaqt' : currentLang === 'en' ? 'Time left' : 'Qolgan vaqt'}</span>
              <strong>${escapeHtml(debtRelativeLabel(item))}</strong>
            </div>
            <div class="debt-glance-item">
              <span>${currentLang === 'ru' ? 'Напоминание' : currentLang === 'en' ? 'Reminder' : 'Eslatma'}</span>
              <strong>${escapeHtml(debtReminderLabel(item))}</strong>
            </div>
          </div>
          <div class="route-badges debt-card-badges">
            <span class="route-badge ${directionClass}">${escapeHtml(debtDirectionLabel(item.direction))}</span>
            <span class="route-badge ${statusClass}">${due.isOverdue ? "Muddati o'tgan" : escapeHtml(debtStatusLabel(item.status))}</span>
          </div>
          <div class="debt-card-actions">
            ${item.status === 'open'
        ? `<button class="route-action primary" onclick="event.stopPropagation(); markDebtPaid(${item.id})">✅ ${currentLang === 'ru' ? 'Qaytdi' : currentLang === 'en' ? 'Paid back' : 'Qaytdi'}</button>`
        : `<button class="route-action" onclick="event.stopPropagation(); reopenDebt(${item.id})">↺ ${currentLang === 'ru' ? 'Qayta ochish' : currentLang === 'en' ? 'Reopen' : 'Qayta ochish'}</button>`}
            <button class="route-action" onclick="event.stopPropagation(); openDebtForm(${item.id})">✏️ ${currentLang === 'ru' ? 'Изменить' : currentLang === 'en' ? 'Edit' : 'Tahrirlash'}</button>
            <button class="route-action danger" onclick="event.stopPropagation(); deleteDebt(${item.id})">🗑 ${currentLang === 'ru' ? 'Удалить' : currentLang === 'en' ? 'Delete' : "O'chirish"}</button>
          </div>
        </div>
      </details>`;
  }

  function renderDebts() {
    const listEl = $('debt-list');
    const emptyEl = $('debt-empty');
    const recEl = $('debt-receivable-total');
    const payEl = $('debt-payable-total');
    const dueTodayEl = $('debt-due-today-count');
    const overdueEl = $('debt-overdue-count');
    const nextDueEl = $('debt-next-due');
    const metaEl = $('debt-list-meta');
    if (!listEl || !recEl || !payEl) return;

    const open = debtList.filter(item => item.status === 'open');
    const receivable = open.filter(item => item.direction === 'receivable').reduce((sum, item) => sum + item.amount, 0);
    const payable = open.filter(item => item.direction === 'payable').reduce((sum, item) => sum + item.amount, 0);
    recEl.textContent = fmtMoney(receivable);
    payEl.textContent = fmtMoney(payable);

    const metas = debtList.map(item => ({ item, meta: debtDueMeta(item) }));
    const dueToday = metas.filter(({ meta, item }) => item.status === 'open' && meta.isToday).length;
    const overdueCount = metas.filter(({ meta }) => meta.isOverdue).length;
    const nextUpcoming = metas.filter(({ meta, item }) => item.status === 'open' && meta.isUpcoming).sort((a, b) => a.meta.ts - b.meta.ts)[0];
    if (dueTodayEl) dueTodayEl.textContent = String(dueToday);
    if (overdueEl) overdueEl.textContent = String(overdueCount);
    if (nextDueEl) nextDueEl.textContent = nextUpcoming ? `${nextUpcoming.item.person_name} · ${fmtDateTimeShort(nextUpcoming.meta.target)}` : '—';

    let items = debtList.slice();
    if (debtFilterStatus === 'open') items = items.filter(item => item.status === 'open');
    else if (debtFilterStatus === 'overdue') items = items.filter(item => debtDueMeta(item).isOverdue);
    else if (debtFilterStatus === 'paid') items = items.filter(item => item.status === 'paid');

    if (debtFilterDirection !== 'all') items = items.filter(item => item.direction === debtFilterDirection);
    items = items.filter(debtMatchesSearch);

    items = items.sort((a, b) => {
      const aMeta = debtDueMeta(a);
      const bMeta = debtDueMeta(b);
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
      if (aMeta.isOverdue !== bMeta.isOverdue) return aMeta.isOverdue ? -1 : 1;
      return (aMeta.ts || 0) - (bMeta.ts || 0);
    });

    if (metaEl) metaEl.textContent = `${items.length} yozuv`;
    emptyEl.style.display = items.length ? 'none' : 'grid';

    const order = ['overdue', 'today', 'upcoming', 'nodate', 'paid'];
    const grouped = order.map(key => ({ key, items: items.filter(item => debtSectionKey(item) === key) })).filter(group => group.items.length);
    listEl.innerHTML = grouped.map(group => `
      <section class="debt-list-section">
        <div class="debt-list-section-head">
          <h3>${escapeHtml(debtSectionLabel(group.key))}</h3>
          <span>${group.items.length}</span>
        </div>
        <div class="debt-card-stack">
          ${group.items.map(renderDebtCard).join('')}
        </div>
      </section>
    `).join('');
  }

  window.setDebtDirectionMode = function setDebtDirectionMode(mode = 'receivable') {
    setDebtDirectionButtons(mode);
  };

  window.applyDebtDuePreset = function applyDebtDuePreset(preset = 'today') {
    const now = new Date();
    const base = new Date();
    if (preset === 'tomorrow') base.setDate(base.getDate() + 1);
    if (preset === 'week') base.setDate(base.getDate() + 7);
    const dueTime = $('debt-due-time')?.value || (preset === 'today' ? `${pad2(Math.max(now.getHours() + 1, 9))}:00` : '18:00');
    const dateEl = $('debt-due-date');
    const timeEl = $('debt-due-time');
    if (dateEl) dateEl.value = `${base.getFullYear()}-${pad2(base.getMonth() + 1)}-${pad2(base.getDate())}`;
    if (timeEl) timeEl.value = dueTime;
    const mode = $('debt-reminder-presets')?.dataset.mode || 'same';
    if (mode !== 'custom') {
      const dueAt = combineDateTimeParts('debt-due');
      setDateInputParts('debt-remind', computeReminderByPreset(dueAt, mode));
    }
  };

  window.setDebtReminderPreset = function setDebtReminderPreset(mode = 'same') {
    if (mode === 'custom' && !requireCustomReminderAccess({ source: 'debt' })) return;
    updateDebtReminderPresetUI(mode);
    if (mode !== 'custom') {
      const dueAt = combineDateTimeParts('debt-due');
      setDateInputParts('debt-remind', computeReminderByPreset(dueAt, mode));
    }
  };

  window.prefillDebtAmount = function prefillDebtAmount(value = 0) {
    const current = Math.round(getCleanAmount($('debt-amount')?.value || ''));
    const next = current > 0 ? current + Number(value || 0) : Number(value || 0);
    if ($('debt-amount')) $('debt-amount').value = fmt(next);
  };

  window.openDebtForm = function openDebtForm(id = null) {
    if (!id && !requireDebtCreateAccess({ source: 'debt' })) return;
    const debt = debtList.find(item => Number(item.id) === Number(id));
    $('debt-id').value = debt?.id || '';
    setDebtDirectionButtons(debt?.direction || 'receivable');
    $('debt-person').value = debt?.person_name || '';
    $('debt-amount').value = debt?.amount ? fmt(debt.amount) : '';
    setDateInputParts('debt-due', debt?.due_at || '');
    const preset = detectReminderPreset(debt?.due_at || '', debt?.remind_at || debt?.due_at || '');
    updateDebtReminderPresetUI(preset);
    setDateInputParts('debt-remind', debt?.remind_at || debt?.due_at || '');
    $('debt-note').value = debt?.note || '';
    const titleEl = $('debt-form-title');
    const badgeEl = $('debt-form-mode-badge');
    const submitEl = $('debt-form-submit');
    if (titleEl) titleEl.textContent = debt ? (currentLang === 'ru' ? 'Qarzni tahrirlash' : currentLang === 'en' ? 'Edit debt' : 'Qarzni tahrirlash') : (currentLang === 'ru' ? "Qarz qo'shish" : currentLang === 'en' ? 'Add debt' : "Qarz qo'shish");
    if (badgeEl) badgeEl.textContent = debt ? (currentLang === 'ru' ? 'Tahrirlash' : currentLang === 'en' ? 'Editing' : 'Tahrirlash') : (currentLang === 'ru' ? 'Yangi' : currentLang === 'en' ? 'New' : 'Yangi');
    if (submitEl) submitEl.textContent = debt ? (currentLang === 'ru' ? 'Saqlash' : currentLang === 'en' ? 'Save' : 'Saqlash') : (currentLang === 'ru' ? 'Yaratish' : currentLang === 'en' ? 'Create' : 'Yaratish');
    showOv('ov-debt-form');
    if (!$('debt-due-date')?.value) window.applyDebtDuePreset('today');
    setTimeout(() => $('debt-person')?.focus(), 40);
  };

  window.saveDebtForm = async function saveDebtForm() {
    const id = $('debt-id').value ? Number($('debt-id').value) : null;
    const person_name = String($('debt-person').value || '').trim();
    const amount = Math.round(getCleanAmount($('debt-amount').value || ''));
    const direction = $('debt-direction').value === 'payable' ? 'payable' : 'receivable';
    const due_at = combineDateTimeParts('debt-due');
    const reminderMode = $('debt-reminder-presets')?.dataset.mode || 'same';
    const remind_at = reminderMode === 'custom' ? combineDateTimeParts('debt-remind') : (computeReminderByPreset(due_at, reminderMode) || due_at || null);
    const note = String($('debt-note').value || '').trim();
    if (!person_name) return showErr(currentLang === 'ru' ? 'Kim bilan ekanini kiriting' : currentLang === 'en' ? 'Enter the person name' : 'Kim bilan ekanini kiriting');
    if (!amount) return showErr(tt('err_amount_required', 'Summani kiriting'));
    if (!due_at) return showErr(currentLang === 'ru' ? 'Qaytarish sanasini tanlang' : currentLang === 'en' ? 'Choose a due date' : 'Qaytarish sanasini tanlang');
    if (reminderMode === 'custom' && !remind_at) return showErr(currentLang === 'ru' ? 'Напоминание uchun sana va vaqtni kiriting' : currentLang === 'en' ? 'Enter the reminder date and time' : 'Eslatma sana va vaqtini kiriting');
    if (!requireDebtCreateAccess({ excludingId: id, source: 'debt' })) return;
    if (reminderMode === 'custom' && !requireCustomReminderAccess({ source: 'debt' })) return;

    const payload = normalizeDebt({ id: id || Date.now(), user_id: UID, person_name, amount, direction, due_at, remind_at, note, status: 'open' });
    if (!db || debtTableAvailable === false) {
      const idx = debtList.findIndex(item => Number(item.id) === Number(payload.id));
      if (idx >= 0) debtList[idx] = payload; else debtList.unshift(payload);
      persistLocalDebts();
      closeOv('ov-debt-form');
      renderDebts();
      refreshDashboardAnalytics();
      return;
    }

    if (id) {
      const { data, error } = await db.from('debts').update({ person_name, amount, direction, due_at, remind_at, note }).eq('id', id).eq('user_id', UID).select().maybeSingle();
      if (error) {
        if (relationMissing(error, 'debts')) { debtTableAvailable = false; return window.saveDebtForm(); }
        if (handleFeatureGateError(error, 'debt_create', 'debt')) return;
        return showErr(error.message || 'Debt update failed');
      }
      const row = normalizeDebt(data || payload);
      const idx = debtList.findIndex(item => Number(item.id) === Number(id));
      if (idx >= 0) debtList[idx] = row;
    } else {
      const { data, error } = await db.from('debts').insert([{ user_id: UID, person_name, amount, direction, due_at, remind_at, note }]).select().maybeSingle();
      if (error) {
        if (relationMissing(error, 'debts')) { debtTableAvailable = false; return window.saveDebtForm(); }
        if (handleFeatureGateError(error, 'debt_create', 'debt')) return;
        return showErr(error.message || 'Debt save failed');
      }
      debtList.unshift(normalizeDebt(data || payload));
    }
    closeOv('ov-debt-form');
    renderDebts();
    refreshDashboardAnalytics();
    vib('light');
  };

  window.markDebtPaid = async function markDebtPaid(id) {
    const debt = debtList.find(item => Number(item.id) === Number(id));
    if (!debt || debt.status === 'paid') return;

    const stamp = isoNow();
    let settlement = null;

    try {
      settlement = await createDebtSettlementTx(debt);
      debt.status = 'paid';
      debt.paid_at = stamp;
      debt.settlement_tx_id = settlement?.tx?.id || debt.settlement_tx_id || null;

      if (!db || debtTableAvailable === false) {
        persistLocalDebts();
        renderDebts();
        renderAll();
        renderHistory();
        refreshDashboardAnalytics();
        return;
      }

      const { error } = await db.from('debts')
        .update({ status: 'paid', paid_at: stamp, settlement_tx_id: debt.settlement_tx_id })
        .eq('id', id)
        .eq('user_id', UID);
      if (error) throw error;

      renderDebts();
      renderAll();
      renderHistory();
      refreshDashboardAnalytics();
    } catch (error) {
      console.warn('[markDebtPaid]', error);
      if (settlement?.created) {
        try {
          await removeDebtSettlementTx({ id: debt.id, settlement_tx_id: settlement.tx?.id || null });
        } catch { }
      }
      debt.status = 'open';
      debt.paid_at = null;
      debt.settlement_tx_id = null;
      showErr(error.message || 'Debt close failed');
    }
  };


  window.reopenDebt = async function reopenDebt(id) {
    const debt = debtList.find(item => Number(item.id) === Number(id));
    if (!debt) return;

    const prevSettlementId = debt.settlement_tx_id || null;
    try {
      if (prevSettlementId) {
        await removeDebtSettlementTx(debt);
      }
      debt.status = 'open';
      debt.paid_at = null;
      debt.settlement_tx_id = null;

      if (!db || debtTableAvailable === false) {
        persistLocalDebts();
        renderDebts();
        renderAll();
        renderHistory();
        refreshDashboardAnalytics();
        return;
      }

      const { error } = await db.from('debts')
        .update({ status: 'open', paid_at: null, settlement_tx_id: null })
        .eq('id', id)
        .eq('user_id', UID);
      if (error) throw error;

      renderDebts();
      renderAll();
      renderHistory();
      refreshDashboardAnalytics();
    } catch (error) {
      debt.status = 'paid';
      debt.settlement_tx_id = prevSettlementId;
      showErr(error.message || 'Debt reopen failed');
    }
  };

  window.deleteDebt = async function deleteDebt(id) {
    const debt = debtList.find(item => Number(item.id) === Number(id));
    if (!debt) return;
    if (!confirm(currentLang === 'ru' ? 'Удалить этот долг?' : currentLang === 'en' ? 'Delete this debt?' : "Bu qarzni o'chirasizmi?")) return;

    try {
      if (debt.settlement_tx_id) {
        await removeDebtSettlementTx(debt);
      }
      debtList = debtList.filter(item => Number(item.id) !== Number(id));
      if (!db || debtTableAvailable === false) {
        persistLocalDebts();
        renderDebts();
        renderAll();
        renderHistory();
        refreshDashboardAnalytics();
        return;
      }
      const { error } = await db.from('debts').delete().eq('id', id).eq('user_id', UID);
      if (error) throw error;
      renderDebts();
      renderAll();
      renderHistory();
      refreshDashboardAnalytics();
    } catch (error) {
      showErr(error.message || 'Debt delete failed');
    }
  };

  function populatePlanCategoryOptions() {
    const sel = $('plan-category');
    if (!sel) return;
    const current = sel.value;
    const items = (cats.expense || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    sel.innerHTML = items.length
      ? items.map(cat => `<option value="${cat.id || ''}" data-name="${escapeHtml(cat.name)}">${escapeHtml(cat.name)}</option>`).join('')
      : `<option value="">${currentLang === 'ru' ? 'Категории пока нет' : currentLang === 'en' ? 'No expense categories yet' : 'Chiqim kategoriyasi topilmadi'}</option>`;
    if (items.some(cat => String(cat.id || '') === String(current))) sel.value = current;
  }

  function getPlanStats(plan) {
    const targetMonth = plan.month_key || monthKey();
    const budget = Number(plan.amount || 0);
    const spent = txList
      .filter(tx => tx.type === 'expense')
      .filter(tx => monthKey(tx.ms) === targetMonth)
      .filter(tx => planMatchesTransaction(plan, tx))
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const rawRemaining = budget - spent;
    const remaining = Math.max(0, rawRemaining);
    const percentRaw = budget > 0 ? Math.round((spent / budget) * 100) : 0;
    const percent = budget > 0 ? Math.max(0, Math.min(100, percentRaw)) : 0;
    const completed = budget > 0 && spent >= budget;
    const exceeded = budget > 0 && spent > budget;
    const overBy = Math.max(0, spent - budget);
    return { spent, remaining, rawRemaining, percent, completed, exceeded, overBy, near: budget > 0 ? remaining <= Number(plan.alert_before || 0) && !completed : false };
  }

  window.setPlanFilter = function setPlanFilter(mode = 'all') {
    planFilterState = mode;
    updateActivePills('plan-filter-', mode);
    renderPlans();
  };

  function renderPlans() {
    const listEl = $('plan-list');
    const emptyEl = $('plan-empty');
    const activeCountEl = $('plan-active-count');
    const totalBudgetEl = $('plan-total-budget');
    const totalRemainingEl = $('plan-total-remaining');
    const totalSpentEl = $('plan-total-spent');
    const metaEl = $('plan-list-meta');
    if (!listEl) return;

    const activePlans = planList.filter(item => item.is_active !== false);
    const aggregate = activePlans.reduce((acc, plan) => {
      const stats = getPlanStats(plan);
      acc.budget += Number(plan.amount || 0);
      acc.spent += Number(stats.spent || 0);
      acc.remaining += Number(stats.remaining || 0);
      return acc;
    }, { budget: 0, spent: 0, remaining: 0 });
    if (activeCountEl) activeCountEl.textContent = String(activePlans.length);
    if (totalBudgetEl) totalBudgetEl.textContent = fmtMoney(aggregate.budget);
    if (totalRemainingEl) totalRemainingEl.textContent = fmtMoney(aggregate.remaining);
    if (totalSpentEl) totalSpentEl.textContent = fmtMoney(aggregate.spent);

    let items = activePlans.slice().sort((a, b) => String(a.category_name || '').localeCompare(String(b.category_name || '')));
    if (planFilterState === 'safe') items = items.filter(plan => { const s = getPlanStats(plan); return !s.near && !s.exceeded; });
    if (planFilterState === 'near') items = items.filter(plan => getPlanStats(plan).near && !getPlanStats(plan).exceeded);
    if (planFilterState === 'exceeded') items = items.filter(plan => getPlanStats(plan).exceeded);

    if (metaEl) metaEl.textContent = `${items.length} reja`;
    emptyEl.style.display = items.length ? 'none' : 'grid';
    listEl.innerHTML = items.map(plan => {
      const stats = getPlanStats(plan);
      const statusText = stats.exceeded
        ? (currentLang === 'ru' ? 'Limitdan oshgan' : currentLang === 'en' ? 'Limit exceeded' : 'Limitdan oshgan')
        : stats.completed
          ? (currentLang === 'ru' ? "To'ldi" : currentLang === 'en' ? 'Completed' : "To'ldi")
          : stats.near
            ? (currentLang === 'ru' ? 'Ogohlantirish' : currentLang === 'en' ? 'Alert threshold' : 'Ogohlantirish')
            : (currentLang === 'ru' ? 'Nazorat ostida' : currentLang === 'en' ? 'On track' : 'Nazorat ostida');
      const statusClass = stats.exceeded ? 'danger' : (stats.completed ? 'accent' : (stats.near ? 'warn' : 'good'));
      const helperText = stats.exceeded
        ? `${fmtMoney(stats.overBy)} oshib ketdi`
        : stats.completed
          ? `Reja to'ldi • ${fmtMoney(stats.spent)} sarflandi`
          : `${fmtMoney(stats.remaining)} qoldi`;
      const percentText = stats.completed ? `100% to'ldi` : `${stats.percent}% to'ldi`;
      return `
        <details class="route-item plan-route-item plan-card-collapsible ${stats.exceeded ? 'plan-route-item-danger' : ''}">
          <summary class="plan-card-summary">
            <div class="route-item-top">
              <div>
                <div class="route-item-title">${escapeHtml(plan.category_name || '—')}</div>
                <div class="route-item-sub">${escapeHtml(monthLabel(plan.month_key || monthKey()))}</div>
              </div>
              <div class="plan-card-summary-tail">
                <div class="route-item-amount">${fmtMoney(plan.amount)}</div>
                <div class="plan-card-chevron">⌄</div>
              </div>
            </div>
            <div class="plan-progress-head">
              <strong>${escapeHtml(percentText)}</strong>
              <span>${escapeHtml(helperText)}</span>
            </div>
            <div class="plan-progress"><span style="width:${Math.min(100, stats.percent)}%"></span></div>
          </summary>
          <div class="plan-card-details">
            <div class="plan-stats compact">
              <div class="plan-stat"><span class="plan-stat-label">Sarflandi</span><span class="plan-stat-value">${fmtMoney(stats.spent)}</span></div>
              <div class="plan-stat"><span class="plan-stat-label">Qoldi</span><span class="plan-stat-value">${stats.exceeded ? fmtMoney(stats.overBy) : fmtMoney(stats.remaining)}</span></div>
              <div class="plan-stat"><span class="plan-stat-label">Ogohlantirish</span><span class="plan-stat-value">${fmtMoney(plan.alert_before)}</span></div>
            </div>
            <div class="route-badges">
              <span class="route-badge ${statusClass}">${escapeHtml(statusText)}</span>
              ${plan.notify_bot ? `<span class="route-badge">Bot</span>` : ''}
              ${plan.notify_app ? `<span class="route-badge good">App</span>` : ''}
            </div>
            <div class="route-actions">
              <button class="route-action" onclick="event.stopPropagation(); openPlanForm(${plan.id})">✏️ ${currentLang === 'ru' ? 'Изменить' : currentLang === 'en' ? 'Edit' : 'Tahrirlash'}</button>
              <button class="route-action danger" onclick="event.stopPropagation(); deletePlan(${plan.id})">🗑 ${currentLang === 'ru' ? 'Удалить' : currentLang === 'en' ? 'Delete' : "O'chirish"}</button>
            </div>
          </div>
        </details>`;
    }).join('');

    syncPlanAppNotifications();
  }

  window.openPlanForm = function openPlanForm(id = null) {
    if (!id && !requirePlanCreateAccess({ source: 'plan' })) return;
    populatePlanCategoryOptions();
    const plan = planList.find(item => Number(item.id) === Number(id));
    $('plan-id').value = plan?.id || '';
    const sel = $('plan-category');
    if (sel) {
      const match = (cats.expense || []).find(cat => (plan && (String(cat.id || '') === String(plan.category_id || '') || cat.name === plan.category_name)));
      sel.value = match ? String(match.id || '') : (sel.options[0]?.value || '');
    }
    $('plan-amount').value = plan?.amount ? fmt(plan.amount) : '';
    $('plan-month-key').value = plan?.month_key || monthKey();
    $('plan-alert-before').value = plan?.alert_before ? fmt(plan.alert_before) : '';
    $('plan-notify-bot').checked = plan?.notify_bot !== false;
    $('plan-notify-app').checked = plan?.notify_app !== false;
    if ($('plan-is-active')) $('plan-is-active').checked = plan?.is_active !== false;
    showOv('ov-plan-form');
  };

  window.savePlanForm = async function savePlanForm() {
    const id = $('plan-id').value ? Number($('plan-id').value) : null;
    const categoryId = $('plan-category').value || null;
    const cat = (cats.expense || []).find(item => String(item.id || '') === String(categoryId));
    const category_name = cat?.name || '';
    const amount = Math.round(getCleanAmount($('plan-amount').value || ''));
    const alert_before = Math.round(getCleanAmount($('plan-alert-before').value || '')) || Math.round(amount * 0.1);
    const notify_bot = !!$('plan-notify-bot').checked;
    const notify_app = !!$('plan-notify-app').checked;
    const is_active = $('plan-is-active') ? !!$('plan-is-active').checked : true;
    const mk = $('plan-month-key')?.value || monthKey();
    if (!category_name) return showErr(currentLang === 'ru' ? 'Kategoriyani tanlang' : currentLang === 'en' ? 'Choose a category' : 'Kategoriyani tanlang');
    if (!amount) return showErr(tt('err_amount_required', 'Summani kiriting'));
    if (is_active && !requirePlanCreateAccess({ excludingId: id, source: 'plan' })) return;

    const localExisting = !id ? findExistingPlanLocal({ categoryName: category_name, categoryId, month: mk }) : null;
    const targetId = id || localExisting?.id || null;
    const payload = normalizePlan({ id: targetId || Date.now(), user_id: UID, category_id: categoryId, category_name, amount, alert_before, notify_bot, notify_app, month_key: mk, is_active, type: 'expense', category: category_name });
    const buildPlanWritePayload = ({ includeMonth = true, includeLegacyCategory = true, includeType = true, includeCategoryId = true } = {}) => {
      const base = planDbPayload({ category_id: categoryId, category_name, amount, alert_before, notify_bot, notify_app, ...(includeMonth ? { month_key: mk } : {}), is_active });
      if (includeLegacyCategory) base.category = category_name;
      if (includeType) base.type = 'expense';
      if (!includeCategoryId) delete base.category_id;
      return base;
    };
    if (!db || planTableAvailable === false) {
      const existing = findExistingPlanLocal({ categoryName: category_name, categoryId, month: mk });
      const idx = existing ? planList.findIndex(item => Number(item.id) === Number(existing.id)) : planList.findIndex(item => Number(item.id) === Number(payload.id));
      if (idx >= 0) planList[idx] = payload; else planList.unshift(payload);
      persistLocalPlans();
      renderPlans();
      closeOv('ov-plan-form');
      refreshDashboardAnalytics();
      return;
    }

    const runPlanMutation = async (mode, rowId = null) => {
      let activePayload = buildPlanWritePayload();
      let activeMode = mode;
      let activeRowId = rowId;
      for (let i = 0; i < 8; i += 1) {
        let result = activeMode === 'update'
          ? await db.from('category_limits').update(activePayload).eq('id', activeRowId).eq('user_id', UID).select().maybeSingle()
          : await db.from('category_limits').insert([{ user_id: UID, ...activePayload }]).select().maybeSingle();

        if (!result.error) return result;

        if (missingColumn(result.error, 'category_name')) {
          planNameColumnSupported = 'name';
          activePayload = buildPlanWritePayload({ includeMonth: 'month_key' in activePayload, includeLegacyCategory: 'category' in activePayload, includeType: 'type' in activePayload, includeCategoryId: 'category_id' in activePayload });
          continue;
        }
        if (missingColumn(result.error, 'month_key')) {
          activePayload = buildPlanWritePayload({ includeMonth: false, includeLegacyCategory: 'category' in activePayload, includeType: 'type' in activePayload, includeCategoryId: 'category_id' in activePayload });
          continue;
        }
        if (notNullConstraintOn(result.error, 'category')) {
          activePayload = buildPlanWritePayload({ includeMonth: 'month_key' in activePayload, includeLegacyCategory: true, includeType: 'type' in activePayload, includeCategoryId: 'category_id' in activePayload });
          continue;
        }
        if (missingColumn(result.error, 'category')) {
          const { category, ...rest } = activePayload;
          activePayload = rest;
          continue;
        }
        if (notNullConstraintOn(result.error, 'type')) {
          activePayload = { ...activePayload, type: 'expense' };
          continue;
        }
        if (missingColumn(result.error, 'type')) {
          const { type, ...rest } = activePayload;
          activePayload = rest;
          continue;
        }
        if (missingColumn(result.error, 'category_id')) {
          const { category_id, ...rest } = activePayload;
          activePayload = rest;
          continue;
        }
        if (activeMode === 'insert' && duplicateKeyError(result.error)) {
          await loadPlanData();
          const existing = findExistingPlanLocal({ categoryName: category_name, categoryId, month: mk });
          if (existing?.id) {
            activeMode = 'update';
            activeRowId = existing.id;
            continue;
          }
        }
        return result;
      }
      return { error: new Error('Plan write fallback exhausted') };
    };

    const mode = targetId ? 'update' : 'insert';
    const result = await runPlanMutation(mode, targetId);
    if (result.error) {
      if (relationMissing(result.error, 'category_limits')) { planTableAvailable = false; return window.savePlanForm(); }
      if (handleFeatureGateError(result.error, 'plan_create', 'plan')) return;
      return showErr(result.error.message || (mode === 'update' ? 'Plan update failed' : 'Plan save failed'));
    }

    const savedPlan = normalizePlan(result.data || payload);
    const existingIdx = planList.findIndex(item => Number(item.id) === Number(savedPlan.id));
    if (existingIdx >= 0) planList[existingIdx] = savedPlan; else planList.unshift(savedPlan);
    await refreshFeatureData('plan', true);
    renderPlans();
    closeOv('ov-plan-form');
    refreshDashboardAnalytics();
    vib('light');
  };

  window.deletePlan = async function deletePlan(id) {
    if (!confirm(currentLang === 'ru' ? 'Удалить эту цель?' : currentLang === 'en' ? 'Delete this plan?' : "Bu rejani o'chirasizmi?")) return;
    planList = planList.filter(item => Number(item.id) !== Number(id));
    if (!db || planTableAvailable === false) { persistLocalPlans(); renderPlans(); refreshDashboardAnalytics(); return; }
    const { error } = await db.from('category_limits').delete().eq('id', id).eq('user_id', UID);
    if (error) return showErr(error.message || 'Plan delete failed');
    renderPlans();
    refreshDashboardAnalytics();
  };

  function snapshotPlanSpend() {
    return Object.fromEntries(planList.map(plan => [plan.id, getPlanStats(plan)]));
  }

  function notifyPlanThresholdCrossing(_before) {
    syncPlanAppNotifications();
  }

  async function refreshFeatureData(mode = 'all', force = false) {
    if (!db || !UID) return;
    const now = Date.now();
    if (shouldSkipFeatureRefresh(mode, force, now)) return;
    markFeatureRefresh(mode, now);
    try {
      if (mode === 'all' || mode === 'debt') await loadDebtsData();
      if (mode === 'all' || mode === 'plan') await loadPlanData();
      if (mode === 'debt') renderDebts();
      if (mode === 'plan') {
        populatePlanCategoryOptions();
        renderPlans();
      }
      if (mode === 'all') {
        populatePlanCategoryOptions();
        renderDebts();
        renderPlans();
      }
    } catch (error) {
      console.warn('[features] refresh failed', error);
    }
  }

  async function syncFeaturesAfterAppReady() {
    if (!db || !UID) return;
    await refreshFeatureData('all', true);
    bindFeatureRealtime();
  }

  function bindFeatureRealtime() {
    if (!db || !UID) return;
    if (!debtRealtimeBound && debtTableAvailable !== false) {
      debtRealtimeBound = true;
      db.channel('debt-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'debts', filter: `user_id=eq.${UID}` }, payload => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === 'INSERT') {
            const next = normalizeDebt(newRow);
            const idx = debtList.findIndex(item => Number(item.id) === Number(next.id));
            if (idx >= 0) debtList[idx] = next; else debtList.unshift(next);
          }
          if (eventType === 'UPDATE') {
            const idx = debtList.findIndex(item => Number(item.id) === Number(newRow.id));
            if (idx >= 0) debtList[idx] = normalizeDebt(newRow);
          }
          if (eventType === 'DELETE') debtList = debtList.filter(item => Number(item.id) !== Number(oldRow.id));
          renderDebts();
          refreshDashboardAnalytics();
        }).subscribe();
    }
    if (!planRealtimeBound && planTableAvailable !== false) {
      planRealtimeBound = true;
      db.channel('plan-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'category_limits', filter: `user_id=eq.${UID}` }, payload => {
          const { eventType, new: newRow, old: oldRow } = payload;
          if (eventType === 'INSERT') {
            const next = normalizePlan(newRow);
            const idx = planList.findIndex(item => Number(item.id) === Number(next.id));
            if (idx >= 0) planList[idx] = next; else planList.unshift(next);
          }
          if (eventType === 'UPDATE') {
            const idx = planList.findIndex(item => Number(item.id) === Number(newRow.id));
            if (idx >= 0) planList[idx] = normalizePlan(newRow);
          }
          if (eventType === 'DELETE') planList = planList.filter(item => Number(item.id) !== Number(oldRow.id));
          renderPlans();
          refreshDashboardAnalytics();
        }).subscribe();
    }
  }

  async function bootstrapFeatures() {
    if (featureBooted) return;
    featureBooted = true;

    syncSettingsCategoryEntry();

    const originalRenderAll = renderAll;
    renderAll = function renderAllEnhanced(...args) {
      const out = originalRenderAll.apply(this, args);
      renderPlans();
      renderStgCatsEnhanced();
      return out;
    };

    const originalGoTab = goTab;
    goTab = function goTabEnhanced(tab, opts = {}) {
      const out = originalGoTab.call(this, tab, opts);
      const afterTabReady = () => {
        if (tab === 'debt') {
          renderDebts();
          refreshFeatureData('debt');
        }
        if (tab === 'plan') {
          renderPlans();
          refreshFeatureData('plan');
        }
      };
      if (out && typeof out.then === 'function') {
        return out.finally(afterTabReady);
      }
      afterTabReady();
      return out;
    };

    const originalOpenStgSub = openStgSub;
    openStgSub = function openStgSubEnhanced(id) {
      originalOpenStgSub(id);
      if (id === 'stg-sub-cats') renderStgCatsEnhanced();
    };

    const originalApplyLang = applyLang;
    applyLang = function applyLangEnhanced() {
      originalApplyLang();
      syncSettingsCategoryEntry();
      updateActivePills('debt-filter-', debtFilterStatus);
      updateActivePills('debt-dir-', debtFilterDirection);
      updateActivePills('plan-filter-', planFilterState);
      renderDebts();
      renderPlans();
      renderStgCatsEnhanced();
      populatePlanCategoryOptions();
    };

    const originalSubmitFlow = submitFlow;
    submitFlow = async function submitFlowEnhanced(...args) {
      const txType = draft?.type || '';
      const before = txType === 'expense' ? snapshotPlanSpend() : null;
      const result = await originalSubmitFlow.apply(this, args);
      if (txType === 'expense') {
        try {
          renderPlans();
          notifyPlanThresholdCrossing(before || {});
        } catch (error) {
          console.warn('[submitFlowEnhanced:plan]', error);
        }
      }
      return result;
    };

    try {
      await loadDebtsData();
      await loadPlanData();
    } catch (error) {
      console.warn('[features] data bootstrap failed', error);
    }
    populatePlanCategoryOptions();
    updateActivePills('debt-filter-', debtFilterStatus);
    updateActivePills('debt-dir-', debtFilterDirection);
    updateActivePills('plan-filter-', planFilterState);
    renderDebts();
    renderPlans();
    renderStgCatsEnhanced();
    bindFeatureRealtime();
    window.addEventListener('kassa:app-ready', () => {
      syncFeaturesAfterAppReady().catch((error) => {
        console.warn('[features] app-ready sync failed', error);
      });
    });
    if (window.__KASSA_LEGACY_APP_READY__) {
      setTimeout(() => {
        syncFeaturesAfterAppReady().catch((error) => {
          console.warn('[features] late ready sync failed', error);
        });
      }, 0);
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshFeatureData('all');
    });
    window.addEventListener('focus', () => {
      refreshFeatureData('all');
    });
    window.addEventListener('pageshow', () => {
      refreshFeatureData('all');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(bootstrapFeatures, 0), { once: true });
  } else {
    setTimeout(bootstrapFeatures, 0);
  }

  publishFeatureSnapshot();
})();
