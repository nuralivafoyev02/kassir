<template>
      <div id="view-dash" :class="['view', 'with-app-header', { active }]">
        <!-- Header -->
        <div class="app-header">
          <div class="header-left">
            <div class="header-logo" id="dash-avatar">💰</div>
            <div class="header-user">
              <div class="header-title" id="dash-user-name" data-i18n="app_name">Kassa</div>
              <div class="header-sub" id="dash-user-sub" data-i18n="app_sub">Moliyaviy boshqaruv</div>
            </div>
          </div>
          <div class="header-actions">
            <button class="header-btn settings-btn" onclick="openSettings()" data-i18n-title="settings_title"
              title="Sozlamalar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="balance-card" id="bc">
          <div class="bc-label" data-i18n="balance_title">Umumiy Qoldiq</div>
          <div class="bc-amount loading" id="total-bal">— so'm</div>
          <div class="bc-pills">
            <div class="cpill on" id="pill-uzs" onclick="setCur('UZS')">UZS</div>
            <div class="cpill" id="pill-usd" onclick="setCur('USD')">USD</div>
          </div>
          <div class="bc-row">
            <div class="bcs">
              <div class="bcs-ico i"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"
                  stroke-linejoin="round">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg></div>
              <div>
                <div class="bcs-lbl" data-i18n="income">Kirim</div>
                <div class="bcs-val i" id="total-inc">+0</div>
              </div>
            </div>
            <div class="bcs">
              <div class="bcs-ico e"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round"
                  stroke-linejoin="round">
                  <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                  <polyline points="17 18 23 18 23 12" />
                </svg></div>
              <div>
                <div class="bcs-lbl" data-i18n="expense">Chiqim</div>
                <div class="bcs-val e" id="total-exp">-0</div>
              </div>
            </div>
          </div>
        </div>
        <div class="type-cards">
          <div class="tc" id="tc-i" onclick="toggleType('income')">
            <div class="tc-ico i"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg></div>
            <div>
              <div class="tc-ttl" data-i18n="filter_income">Kirimlar</div>
              <div class="tc-sub i" data-i18n="filter_label">Filtrlash</div>
            </div>
          </div>
          <div class="tc" id="tc-e" onclick="toggleType('expense')">
            <div class="tc-ico e"><svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
                <polyline points="17 18 23 18 23 12" />
              </svg></div>
            <div>
              <div class="tc-ttl" data-i18n="filter_expense">Chiqimlar</div>
              <div class="tc-sub e" data-i18n="filter_label">Filtrlash</div>
            </div>
          </div>
        </div>
        <div class="filter-row">
          <div class="fp on" data-f="all" onclick="setDate('all')" data-i18n="filter_all">Hammasi</div>
          <div class="fp" data-f="week" onclick="setDate('week')" data-i18n="filter_week">Hafta</div>
          <div class="fp" data-f="month" onclick="setDate('month')" data-i18n="filter_month">Oy</div>
          <div class="fp" data-f="custom" onclick="openDateMod()">📅 <span data-i18n="filter_custom">Maxsus</span></div>
        </div>
        <div class="panel">
          <div class="panel-ttl" data-i18n="categories">Kategoriyalar</div>
          <div id="chart-wrap"><canvas id="myChart"></canvas>
            <div id="no-data"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                <path d="M22 12A10 10 0 0 0 12 2v10z" />
              </svg><span data-i18n="no_data">Hozircha ma'lumot yo'q</span></div>
          </div>
          <div id="cat-table"></div>
        </div>
        <div id="trend-sec">
          <div class="panel-ttl" style="padding-left:2px">📈 <span data-i18n="trends">Trendlar</span></div>
          <div class="tgrid" id="trend-grid"></div>
        </div>
      </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
