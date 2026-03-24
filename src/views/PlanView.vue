<template>
  <div id="view-plan" :class="['view', { active }]">
    <div class="section-hero plan-hero plan-hero-v12">
      <div>
        <div class="section-eyebrow" data-i18n="plan_eyebrow">Rejalashtirish</div>
        <h2 data-i18n="plan_title">Reja</h2>
        <p data-i18n="plan_sub">Kategoriya bo'yicha limitlarni, ogohlantirishlarni va oy rejangizni shu yerda boshqaring.</p>
      </div>
      <div class="hero-action-stack">
        <button class="hero-pill hero-pill-strong" type="button" onclick="openPlanForm()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          <span data-i18n="plan_add_action">Yangi reja</span>
        </button>
      </div>
    </div>

    <div class="mini-stats-grid plan-mini-stats">
      <div class="mini-stat-card accent">
        <span>Faol reja</span>
        <strong id="plan-active-count">0</strong>
      </div>
      <div class="mini-stat-card">
        <span>Jami limit</span>
        <strong id="plan-total-budget">0 so'm</strong>
      </div>
      <div class="mini-stat-card positive">
        <span>Qoldiq</span>
        <strong id="plan-total-remaining">0 so'm</strong>
      </div>
      <div class="mini-stat-card danger">
        <span>Sarflangan</span>
        <strong id="plan-total-spent">0 so'm</strong>
      </div>
    </div>

    <div class="route-filter-wrap">
      <div class="filter-row route-filters">
        <div class="fp on" id="plan-filter-all" onclick="setPlanFilter('all')">Hammasi</div>
        <div class="fp" id="plan-filter-safe" onclick="setPlanFilter('safe')">Nazoratda</div>
        <div class="fp" id="plan-filter-near" onclick="setPlanFilter('near')">Ogohlantirish</div>
        <div class="fp" id="plan-filter-exceeded" onclick="setPlanFilter('exceeded')">Oshgan</div>
      </div>
    </div>

    <div class="panel route-panel route-panel-tight">
      <div class="panel-head-inline">
        <div class="panel-ttl" data-i18n="plan_current_title">Joriy reja</div>
        <div class="panel-head-meta" id="plan-list-meta">0 reja</div>
      </div>
      <div id="plan-list" class="route-list"></div>
      <div id="plan-empty" class="empty-route-state compact">
        <div class="empty-route-ico">🎯</div>
        <h3 data-i18n="plan_empty">Hali reja tuzilmagan</h3>
        <p data-i18n="plan_empty_sub">Bu bo'limda kategoriya bo'yicha limit belgilab, limit tugashidan oldin ogohlantirish olasiz.</p>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
