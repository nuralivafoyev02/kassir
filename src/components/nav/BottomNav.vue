<template>
    <nav id="nav">
      <button :class="['nb', { active: activeTab === 'dash' }]" id="nb-dash" onclick="goTab('dash')"><svg viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg><span data-i18n="nav_home">Bosh</span></button>
      <button :class="['nb', { active: activeTab === 'add' }]" id="nb-add" onclick="goTab('add')">
        <div class="add-ring"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round"
            stroke-linejoin="round" style="width:22px;height:22px;">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg></div>
        <p class="add-btn-txt" data-i18n="nav_add">Qo'shish</p>
      </button>
      <button :class="['nb', { active: activeTab === 'hist' }]" id="nb-hist" onclick="goTab('hist')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg><span data-i18n="nav_history">Tarix</span></button>
    </nav>
</template>

<script setup>
defineProps({
  activeTab: { type: String, default: 'dash' }
})
</script>
