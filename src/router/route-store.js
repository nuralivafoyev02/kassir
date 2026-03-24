import { reactive, readonly } from 'vue'
import { getPathByTab, getTabByPath, normalizePath } from './routes'

const routeState = reactive({
  path: '/',
  tab: 'dash',
})

function applyPath(pathname) {
  const normalized = normalizePath(pathname)
  routeState.path = normalized
  routeState.tab = getTabByPath(normalized)
  return routeState.tab
}

function consumeFallbackRoute() {
  if (typeof window === 'undefined') return normalizePath('/')
  const url = new URL(window.location.href)
  const fallbackPath = url.searchParams.get('__kassa_route')
  if (!fallbackPath) return normalizePath(window.location.pathname)

  url.searchParams.delete('__kassa_route')
  const normalized = normalizePath(fallbackPath)
  const cleanSearch = url.searchParams.toString()
  const nextUrl = `${normalized}${cleanSearch ? `?${cleanSearch}` : ''}${url.hash || ''}`
  window.history.replaceState({}, '', nextUrl)
  return normalized
}

function dispatchRouteRequest(tab, meta = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('kassa:route-request', {
    detail: {
      tab,
      path: getPathByTab(tab),
      ...meta,
    },
  }))
}

export function syncRouteFromLocation(meta = {}) {
  if (typeof window === 'undefined') return 'dash'
  const tab = applyPath(consumeFallbackRoute())
  dispatchRouteRequest(tab, { source: 'location', ...meta })
  return tab
}

export function navigateToTab(tab, options = {}) {
  if (typeof window === 'undefined') return 'dash'
  const nextPath = getPathByTab(tab)
  const currentPath = normalizePath(window.location.pathname)
  if (nextPath !== currentPath) {
    const method = options.replace ? 'replaceState' : 'pushState'
    window.history[method]({}, '', nextPath)
  }
  applyPath(nextPath)
  if (!options.silent) dispatchRouteRequest(routeState.tab, { source: options.source || 'app' })
  return routeState.tab
}

export function installRouteBridge() {
  if (typeof window === 'undefined' || window.__KASSA_ROUTER_INSTALLED__) return
  window.__KASSA_ROUTER_INSTALLED__ = true
  applyPath(consumeFallbackRoute())
  window.__KASSA_ROUTER__ = {
    navigateToTab,
    syncFromLocation: syncRouteFromLocation,
    getCurrentTab: () => routeState.tab,
    getCurrentPath: () => routeState.path,
    requestCurrentTab: () => dispatchRouteRequest(routeState.tab, { source: 'bridge' }),
  }
  window.addEventListener('popstate', () => {
    syncRouteFromLocation({ source: 'popstate' })
  })
}

export function useRouteState() {
  return readonly(routeState)
}
