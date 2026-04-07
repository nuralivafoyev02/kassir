<template>
  <nav id="nav" class="nav-five">
    <button :class="['nb', 'nb-compact', { active: activeTab === 'dash' }]" id="nb-dash" onpointerdown="warmViewChunk('dash')" onclick="goTab('dash')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
      </svg>
      <span data-i18n="nav_home">Bosh</span>
    </button>

    <button :class="['nb', 'nb-compact', { active: activeTab === 'debt' || activeTab === 'plan' }]" id="nb-finance" onpointerdown="warmViewChunk('debt')" onclick="openFinanceSection()">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1v22" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
      <span data-i18n="nav_finance">Reja/Qarz</span>
    </button>

    <button :class="['nb', 'nb-add-main', { active: activeTab === 'add' }]" id="nb-add" onpointerdown="warmViewChunk('add')" onclick="goTab('add')">
      <div class="add-ring add-ring-smaller">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" style="width:20px;height:20px;">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>
      <p class="add-btn-txt add-btn-txt-five" data-i18n="nav_add">Qo'shish</p>
    </button>

    <button :class="['nb', 'nb-compact', { active: activeTab === 'hist' }]" id="nb-hist" onpointerdown="warmViewChunk('hist')" onclick="goTab('hist')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <span data-i18n="nav_history">Tarix</span>
    </button>

    <button :class="['nb', 'nb-compact', { active: activeTab === 'profile' }]" id="nb-profile" onpointerdown="warmViewChunk('profile')" onclick="goTab('profile')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span data-i18n="nav_profile">Profil</span>
    </button>
  </nav>
</template>

<script setup>
defineProps({
  activeTab: { type: String, default: 'dash' }
})
</script>
