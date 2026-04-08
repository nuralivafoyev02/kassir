import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";

function copyDirContents(sourceDir, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry);
    const targetPath = resolve(targetDir, entry);
    const stats = statSync(sourcePath);
    if (stats.isDirectory()) {
      copyDirContents(sourcePath, targetPath);
      continue;
    }
    cpSync(sourcePath, targetPath);
  }
}

function copyMiniappPublicExtras(appPublicDir, outDir) {
  return {
    name: "copy-miniapp-public-extras",
    closeBundle() {
      if (!existsSync(appPublicDir)) return;
      copyDirContents(appPublicDir, outDir);
    },
  };
}

export default defineConfig(({ mode }) => {
  const repoRoot = resolve(__dirname, "../..");
  const buildOutDir = resolve(__dirname, "dist");
  const appPublicDir = resolve(__dirname, "public");
  const env = loadEnv(mode, __dirname, "");
  const backendOrigin = String(env.KASSA_BACKEND_ORIGIN || "http://127.0.0.1:8787").trim();

  return {
    root: __dirname,
    publicDir: resolve(repoRoot, "public"),
    plugins: [vue(), copyMiniappPublicExtras(appPublicDir, buildOutDir)],
    server: {
      host: "0.0.0.0",
      port: 3000,
      fs: {
        allow: [repoRoot],
      },
      proxy: {
        "/api": {
          target: backendOrigin,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 4173,
    },
    build: {
      outDir: buildOutDir,
      emptyOutDir: true,
      sourcemap: true,
    },
  };
});
