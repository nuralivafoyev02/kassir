<template>
  <LoaderLayer />
  <PinScreen />

  <div id="app">
    <div id="views">
      <DashboardView v-if="isViewMounted('dash')" :active="activeTab === 'dash'" />
      <FinanceView v-if="isViewMounted('finance')" :active="activeTab === 'debt' || activeTab === 'plan'"
        :current-tab="activeTab" />
      <AddView v-if="isViewMounted('add')" :active="activeTab === 'add'" />
      <ProfileView v-if="isViewMounted('profile')" :active="activeTab === 'profile'" />
      <HistoryView v-if="isViewMounted('hist')" :active="activeTab === 'hist'" />
    </div>

    <BottomNav :active-tab="activeTab" />
  </div>

  <AppOverlays />
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import LoaderLayer from './components/core/LoaderLayer.vue'
import PinScreen from './components/core/PinScreen.vue'
import BottomNav from './components/nav/BottomNav.vue'
import AppOverlays from './components/overlays/AppOverlays.vue'
import { bootLegacyBundle } from './lib/loadLegacyScripts'
import { installRouteBridge, useRouteState } from './router/route-store'

const viewLoaders = {
  dash: () => import('./views/DashboardView.vue'),
  finance: () => import('./views/FinanceView.vue'),
  add: () => import('./views/AddView.vue'),
  profile: () => import('./views/ProfileView.vue'),
  hist: () => import('./views/HistoryView.vue'),
}

const DashboardView = defineAsyncComponent(viewLoaders.dash)
const AddView = defineAsyncComponent(viewLoaders.add)
const HistoryView = defineAsyncComponent(viewLoaders.hist)
const FinanceView = defineAsyncComponent(viewLoaders.finance)
const ProfileView = defineAsyncComponent(viewLoaders.profile)

installRouteBridge()
const routeState = useRouteState()
const activeTab = computed(() => routeState.tab)
const mountedViews = reactive({
  dash: false,
  finance: false,
  add: false,
  profile: false,
  hist: false,
})
const viewPreloadState = reactive({
  dash: null,
  finance: null,
  add: null,
  profile: null,
  hist: null,
})

function resolveViewKey(tab) {
  if (tab === 'debt' || tab === 'plan') return 'finance'
  if (tab === 'dash' || tab === 'add' || tab === 'profile' || tab === 'hist') return tab
  return 'dash'
}

function markViewMounted(tab) {
  const key = resolveViewKey(tab)
  mountedViews[key] = true
  return key
}

function isViewMounted(key) {
  return !!mountedViews[key]
}

function resolveViewId(tab) {
  const key = resolveViewKey(tab)
  return key === 'finance' ? 'view-finance' : `view-${key}`
}

function preloadView(tab) {
  const key = resolveViewKey(tab)
  if (!viewLoaders[key]) return Promise.resolve()
  if (!viewPreloadState[key]) {
    viewPreloadState[key] = viewLoaders[key]().catch((error) => {
      console.warn('[view-bridge] preload failed', key, error)
      viewPreloadState[key] = null
      throw error
    })
  }
  return viewPreloadState[key]
}

function preloadAllViews() {
  return Promise.allSettled(Object.keys(viewLoaders).map((key) => preloadView(key)))
}

async function waitForViewElement(tab, attempts = 40) {
  if (typeof document === 'undefined') return
  const id = resolveViewId(tab)
  for (let index = 0; index < attempts; index += 1) {
    await nextTick()
    if (document.getElementById(id)) return
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }
}

async function ensureViewMounted(tab) {
  await preloadView(tab)
  markViewMounted(tab)
  await waitForViewElement(tab)
  if (typeof window !== 'undefined' && typeof window.applyLang === 'function') {
    window.applyLang()
  }
}

watch(activeTab, (tab) => {
  markViewMounted(tab)
}, { immediate: true })

onMounted(async () => {
  if (typeof window !== 'undefined') {
    window.__KASSA_VIEW_BRIDGE__ = {
      ensureViewMounted,
      preloadView,
      preloadAllViews,
      isViewMounted: (tab) => !!mountedViews[resolveViewKey(tab)],
      resolveViewKey,
    }
  }
  await nextTick()
  setTimeout(() => {
    preloadAllViews().catch(() => { })
  }, 0)
  requestAnimationFrame(() => {
    bootLegacyBundle().then(() => {
      window.__KASSA_ROUTER__?.requestCurrentTab?.()
    }).catch((error) => {
      console.error('[vite-vue-bridge] Legacy boot failed:', error)
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

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && window.__KASSA_VIEW_BRIDGE__) {
    delete window.__KASSA_VIEW_BRIDGE__
  }
})
</script>
