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
            <button
              type="button"
              class="header-plan-indicator"
              id="dash-plan-indicator"
              data-state="free"
              onclick="openSubscriptionPanel('dashboard')"
              aria-live="polite"
              aria-label="Bepul tarif"
              title="Bepul tarif"
            >
              <span class="header-plan-icon" id="dash-plan-indicator-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="7"></circle>
                  <path d="M12 8v8"></path>
                  <path d="M8 12h8"></path>
                </svg>
              </span>
            </button>
          </div>
        </div>

        <div class="balance-card" id="bc">
          <div class="bc-head">
            <div class="bc-label" data-i18n="balance_title">Umumiy Qoldiq</div>
            <div class="bc-tools">
              <button
                type="button"
                class="bc-tool-btn"
                onclick="openBalanceConverter('UZS','USD')"
                data-i18n-title="balance_convert_open_uzs_usd"
                data-i18n-aria-label="balance_convert_open_uzs_usd"
                title="UZS → USD"
                aria-label="UZS → USD"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7h11"></path>
                  <path d="M11 4l4 3-4 3"></path>
                  <path d="M20 17H9"></path>
                  <path d="M13 14l-4 3 4 3"></path>
                </svg>
                <span>UZS</span>
              </button>
              <button
                type="button"
                class="bc-tool-btn"
                onclick="openBalanceConverter('USD','UZS')"
                data-i18n-title="balance_convert_open_usd_uzs"
                data-i18n-aria-label="balance_convert_open_usd_uzs"
                title="USD → UZS"
                aria-label="USD → UZS"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7h11"></path>
                  <path d="M11 4l4 3-4 3"></path>
                  <path d="M20 17H9"></path>
                  <path d="M13 14l-4 3 4 3"></path>
                </svg>
                <span>USD</span>
              </button>
            </div>
          </div>
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
        <div class="dash-widget-section">
          <div class="panel-head-inline">
            <div>
              <div class="panel-ttl" data-i18n="dashboard_widgets_title">Tezkor vidjetlar</div>
              <div class="dash-panel-sub" data-i18n="dashboard_widgets_sub">Bir qarashda eng muhim raqamlar</div>
            </div>
          </div>
          <div class="dash-widget-grid" id="dash-overview-grid"></div>
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
        <div class="panel dash-analytics-panel" id="dash-analytics-panel">
          <div class="panel-head-inline">
            <div>
              <div class="panel-ttl" data-i18n="dashboard_premium_title">Premium dashboard</div>
              <div class="dash-panel-sub" id="dash-analytics-subtitle" data-i18n="dashboard_premium_sub">Pul holati, xavf va prognozlar bir joyda</div>
            </div>
            <button type="button" class="dash-panel-chip" id="dash-analytics-action" onclick="handleDashboardAnalyticsAction()">Premium</button>
          </div>
          <div class="dash-analytics-grid" id="dash-analytics-grid"></div>
        </div>
      </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
