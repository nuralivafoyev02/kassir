<template>
  <LoaderLayer />
  <PinScreen />

  <div id="app">
    <div id="views">
      <DashboardView :active="activeTab === 'dash'" />
      <DebtsView :active="activeTab === 'debt'" />
      <AddView :active="activeTab === 'add'" />
      <PlanView :active="activeTab === 'plan'" />
      <HistoryView :active="activeTab === 'hist'" />
    </div>

    <BottomNav :active-tab="activeTab" />
  </div>

  <AppOverlays />
</template>

<script setup>
import { computed, nextTick, onMounted } from 'vue'
import LoaderLayer from './components/core/LoaderLayer.vue'
import PinScreen from './components/core/PinScreen.vue'
import BottomNav from './components/nav/BottomNav.vue'
import AppOverlays from './components/overlays/AppOverlays.vue'
import DashboardView from './views/DashboardView.vue'
import AddView from './views/AddView.vue'
import HistoryView from './views/HistoryView.vue'
import DebtsView from './views/DebtsView.vue'
import PlanView from './views/PlanView.vue'
import { bootLegacyBundle } from './lib/loadLegacyScripts'
import { installRouteBridge, useRouteState } from './router/route-store'

installRouteBridge()
const routeState = useRouteState()
const activeTab = computed(() => routeState.tab)

onMounted(async () => {
  await nextTick()
  requestAnimationFrame(() => {
    bootLegacyBundle().then(() => {
      window.__KASSA_ROUTER__?.requestCurrentTab?.()
    }).catch((error) => {
      console.error('[vite-vue-bridge] Legacy boot failed:', error)
      fetch('/api/client-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'error',
          scope: 'legacy-boot',
          message: error?.message || 'Legacy boot failed',
          payload: {
            stack: error?.stack || null,
            url: location.href,
          },
        }),
        keepalive: true,
      }).catch(() => {})
      const bar = document.getElementById('err-bar')
      const loader = document.getElementById('loader')
      if (loader) loader.style.display = 'none'
      if (bar) {
        bar.style.display = 'block'
        bar.textContent = `Legacy boot error: ${error.message}`
      }
    })
  })
})
</script>
