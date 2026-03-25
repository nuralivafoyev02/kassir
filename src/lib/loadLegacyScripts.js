export const CRITICAL_CDN_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://telegram.org/js/telegram-web-app.js',
]

export const DEFERRED_CDN_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js',
]

let legacyBootPromise = null
let deferredWarmupStarted = false

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

export function ensureChartLib() {
  return loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')
}

export async function ensurePdfLibs() {
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js')
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/vfs_fonts.min.js')
}

function warmDeferredVendors() {
  if (deferredWarmupStarted) return
  deferredWarmupStarted = true
  const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1))
  idle(() => {
    ensureChartLib()
      .then(() => {
        if (typeof window.renderAll === 'function') window.renderAll()
      })
      .catch(() => {})
    ensurePdfLibs().catch(() => {})
  })
}

export async function bootLegacyBundle() {
  if (window.__kassaLegacyBooted) return legacyBootPromise || Promise.resolve()
  if (legacyBootPromise) return legacyBootPromise

  window.__kassaEnsureChartLib = ensureChartLib
  window.__kassaEnsurePdfLibs = ensurePdfLibs

  legacyBootPromise = (async () => {
    await Promise.all(CRITICAL_CDN_SCRIPTS.map((src) => loadScript(src)))
    await loadScript('/theme.config.js')
    await loadScript('/app.js')
    await loadScript('/app.features.js')
    window.__kassaLegacyBooted = true
    warmDeferredVendors()
  })()

  return legacyBootPromise
}
