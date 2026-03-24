export const ROUTE_TABLE = [
  { tab: 'dash', path: '/', name: 'dashboard' },
  { tab: 'debt', path: '/debts', name: 'debts' },
  { tab: 'add', path: '/add', name: 'add' },
  { tab: 'plan', path: '/plan', name: 'plan' },
  { tab: 'hist', path: '/history', name: 'history' },
]

export const TAB_TO_PATH = Object.fromEntries(ROUTE_TABLE.map(route => [route.tab, route.path]))
export const PATH_TO_TAB = Object.fromEntries(ROUTE_TABLE.map(route => [route.path, route.tab]))

export function normalizePath(pathname = '/') {
  if (!pathname) return '/'
  const path = pathname.replace(/\+$/, '') || '/'
  return PATH_TO_TAB[path] ? path : '/'
}

export function getTabByPath(pathname = '/') {
  return PATH_TO_TAB[normalizePath(pathname)] || 'dash'
}

export function getPathByTab(tab = 'dash') {
  return TAB_TO_PATH[tab] || '/'
}
