import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { seo } from './scripts/seo.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const site = (env.SITE_URL || 'https://pip-chess.pages.dev').replace(/\/+$/, '')
  return {
    root: 'client',
    envDir: '..',
    plugins: [svelte(), seo(site)],
    worker: { format: 'es' },
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
    server: { port: 5173 },
    preview: { port: 4173 },
    build: { outDir: 'dist', emptyOutDir: true, target: 'es2023', cssCodeSplit: false, chunkSizeWarningLimit: 1500 },
  }
})
