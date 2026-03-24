import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"

export default defineConfig(async () => {
  const plugins = [vue()]
  try {
    const { cloudflare } = await import("@cloudflare/vite-plugin")
    plugins.push(cloudflare())
  } catch (_error) {
    // Wrangler / Cloudflare plugin hali o‘rnatilmagan bo‘lsa, oddiy Vite rejimida davom etadi.
  }

  return {
    plugins,
    server: {
      host: "0.0.0.0",
      port: 3000,
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
    },
  }
})
