<template>
      <div id="view-hist" :class="['view', { active }]">
        <div class="view-hist-hdr">
          <div class="vh-top">
            <h2 data-i18n="hist_title">Tarix</h2>
            <button class="header-btn" onclick="openExport()" data-i18n-title="pdf_title" title="PDF Hisobot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          </div>
          <div class="hist-filter-row">
            <div class="fp on" data-hf="all" onclick="setHistFilter('all')" data-i18n="hist_all">Barchasi</div>
            <div class="fp" data-hf="income" onclick="setHistFilter('income')" data-i18n="income">Kirim</div>
            <div class="fp" data-hf="expense" onclick="setHistFilter('expense')" data-i18n="expense">Chiqim</div>
          </div>
        </div>
        <div id="tx-list"></div>
        <div id="empty-s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
            stroke-linecap="round">
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
          </svg>
          <p data-i18n="hist_empty">Hali operatsiyalar yo'q</p><small data-i18n="hist_empty_sub">Qo'shish tabidan
            boshlang</small>
        </div>
      </div>
</template>

<script setup>
defineProps({
  active: { type: Boolean, default: false }
})
</script>
