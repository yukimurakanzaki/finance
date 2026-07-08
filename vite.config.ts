import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'FI Dashboard',
        short_name: 'FI Dashboard',
        description: 'Personal Financial Independence Scoreboard',
        theme_color: '#090b10',
        background_color: '#090b10',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@db':         resolve(__dirname, 'src/db'),
      '@engine':     resolve(__dirname, 'src/engine'),
      '@lib':        resolve(__dirname, 'src/lib'),
      '@stores':     resolve(__dirname, 'src/stores'),
      '@features':   resolve(__dirname, 'src/features'),
      '@components': resolve(__dirname, 'src/components'),
      '@i18n':       resolve(__dirname, 'src/i18n'),
      '@import':     resolve(__dirname, 'src/import'),
    },
  },
})
