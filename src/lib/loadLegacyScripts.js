const CRITICAL_CDN_SCRIPTS = {
  supabase: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  telegram: 'https://telegram.org/js/telegram-web-app.js',
}

const OPTIONAL_CDN_SCRIPTS = {
  chart: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  pdfmake: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js',
  pdfFonts: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js',
}

function isFinanceTab(tab) {
  return tab === 'debt' || tab === 'plan'
}

function deferTask(task, timeout = 0) {
  if (typeof window === 'undefined') return

  const runTask = () => {
    Promise.resolve()
      .then(task)
      .catch((error) => {
        console.warn('[legacy-assets] background load failed', error)
      })
  }

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(() => runTask(), { timeout: Math.max(timeout, 500) })
    return
  }

  window.setTimeout(runTask, timeout)
}

function installLegacyAssetBridge() {
  if (typeof window === 'undefined') return null
  if (window.__KASSA_LEGACY_ASSETS__) return window.__KASSA_LEGACY_ASSETS__

  const bridge = {
    ensureCharts: () => loadScript(OPTIONAL_CDN_SCRIPTS.chart),
    ensurePdf: async () => {
      await loadScript(OPTIONAL_CDN_SCRIPTS.pdfmake)
      await loadScript(OPTIONAL_CDN_SCRIPTS.pdfFonts)
    },
    ensureFeatures: () => loadScript('/app.features.js'),
    warmOptionalAssets: (tab = 'dash') => {
      deferTask(() => bridge.ensureFeatures(), 0)
      if (tab === 'dash') deferTask(() => bridge.ensureCharts(), 200)
      deferTask(() => bridge.ensurePdf(), 1200)
    },
  }

  window.__KASSA_LEGACY_ASSETS__ = bridge
  return bridge
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-kassa-src="${src}"]`)
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve()
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error(`Script load failed: ${src}`)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = false
    script.dataset.kassaSrc = src
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true'
      resolve()
    }, { once: true })
    script.addEventListener('error', () => reject(new Error(`Script load failed: ${src}`)), { once: true })
    document.body.appendChild(script)
  })
}

export async function bootLegacyBundle(options = {}) {
  if (window.__kassaLegacyBooted) return
  if (window.__kassaLegacyBootPromise) return window.__kassaLegacyBootPromise

  const initialTab = String(
    options.initialTab || window.__KASSA_ROUTER__?.getCurrentTab?.() || 'dash'
  ).trim()
  const assets = installLegacyAssetBridge()

  window.__kassaLegacyBootPromise = (async () => {
    await Promise.all([
      loadScript(CRITICAL_CDN_SCRIPTS.supabase),
      loadScript(CRITICAL_CDN_SCRIPTS.telegram),
    ])

    await Promise.all([
      loadScript('/theme.config.js'),
      loadScript('/kassa.subscription.js'),
    ])

    await loadScript('/app.js')

    if (isFinanceTab(initialTab)) {
      await assets?.ensureFeatures?.()
      deferTask(() => assets?.ensureCharts?.(), 200)
      deferTask(() => assets?.ensurePdf?.(), 1200)
    } else {
      assets?.warmOptionalAssets?.(initialTab)
    }

    window.__kassaLegacyBooted = true
  })()

  return window.__kassaLegacyBootPromise
}
