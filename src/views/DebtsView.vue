<template>
  <div id="view-debt" :class="['view', { active }]">
    <div class="section-hero debts-hero debts-hero-v13">
      <div>
        <div class="section-eyebrow" data-i18n="debts_eyebrow">Nazorat</div>
        <h2 data-i18n="debts_title">Qarzlar</h2>
        <p data-i18n="debts_sub">Kimdan olishingiz va kimga berishingiz kerakligini bir joyda ko'ring.</p>
      </div>
      <div class="hero-action-stack">
        <button class="hero-pill hero-pill-strong" type="button" onclick="openDebtForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span data-i18n="debts_add_action">Yangi qarz</span>
        </button>
      </div>
    </div>

    <div class="split-stat-grid compact-two-up">
      <div class="split-stat-card positive compact-stat">
        <div class="split-stat-top">
          <span class="split-dot"></span>
          <span data-i18n="debts_receivable">Olinadigan</span>
        </div>
        <strong id="debt-receivable-total">0 so'm</strong>
        <small data-i18n="debts_receivable_sub">Sizga qaytishi kerak bo'lgan summa</small>
      </div>
      <div class="split-stat-card warning compact-stat">
        <div class="split-stat-top">
          <span class="split-dot"></span>
          <span data-i18n="debts_payable">Beriladigan</span>
        </div>
        <strong id="debt-payable-total">0 so'm</strong>
        <small data-i18n="debts_payable_sub">Siz to'lashingiz kerak bo'lgan summa</small>
      </div>
    </div>

    <div class="mini-stats-grid debt-mini-stats">
      <div class="mini-stat-card">
        <span>Bugun</span>
        <strong id="debt-due-today-count">0</strong>
      </div>
      <div class="mini-stat-card danger">
        <span>Muddati o'tgan</span>
        <strong id="debt-overdue-count">0</strong>
      </div>
      <div class="mini-stat-card accent wide">
        <span>Eng yaqin qaytarish</span>
        <strong id="debt-next-due">—</strong>
      </div>
    </div>

    <div class="debt-toolkit">
      <div class="debt-search-shell">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.5-3.5"></path>
        </svg>
        <input
          id="debt-search"
          type="search"
          autocomplete="off"
          placeholder="Ism, izoh yoki summa bo'yicha qidiring"
          oninput="setDebtSearch(this.value)"
        >
        <button type="button" class="debt-search-clear" onclick="clearDebtSearch()">✕</button>
      </div>

      <div class="debt-filter-shell">
        <div class="filter-row route-filters">
          <div class="fp on" id="debt-filter-all" onclick="setDebtFilter('all')">Hammasi</div>
          <div class="fp" id="debt-filter-open" onclick="setDebtFilter('open')">Ochiq</div>
          <div class="fp" id="debt-filter-overdue" onclick="setDebtFilter('overdue')">Kechikkan</div>
          <div class="fp" id="debt-filter-paid" onclick="setDebtFilter('paid')">Yopilgan</div>
        </div>
        <div class="filter-row route-filters muted-row">
          <div class="fp on" id="debt-dir-all" onclick="setDebtDirectionFilter('all')">Hammasi</div>
          <div class="fp" id="debt-dir-receivable" onclick="setDebtDirectionFilter('receivable')">Olinadi</div>
          <div class="fp" id="debt-dir-payable" onclick="setDebtDirectionFilter('payable')">Beriladi</div>
        </div>
      </div>
    </div>

    <div class="panel route-panel route-panel-tight debt-route-panel">
      <div class="panel-head-inline debt-panel-head">
        <div>
          <div class="panel-ttl" data-i18n="debts_list_title">Qarzlar ro'yxati</div>
          <div class="panel-head-sub">Ro'yxatda faqat ism va summa ko'rinadi, ustiga bossangiz to'liq ma'lumot ochiladi.</div>
        </div>
        <div class="panel-head-meta" id="debt-list-meta">0 yozuv</div>
      </div>
      <div id="debt-list" class="route-list debt-list-v2"></div>
      <div id="debt-empty" class="empty-route-state">
        <div class="empty-route-ico">🤝</div>
        <h3 data-i18n="debts_empty">Hozircha qarz yozuvlari yo'q</h3>
        <p data-i18n="debts_empty_sub">Yangi qarz qo'shing, muddati kelsa bot va mini app eslatadi.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
