import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base './' hace que la app funcione en cualquier ruta de GitHub Pages
// (https://usuario.github.io/<repositorio>/) sin configurar el nombre del repo.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png', 'espoch-calendario.json'],
      manifest: {
        name: 'DocenTime',
        short_name: 'DocenTime',
        description: 'Cronograma inteligente para docentes: clases, comisiones, proyectos y titulación.',
        lang: 'es-EC',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FBF8F1',
        theme_color: '#B41A12',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'fuentes', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /espoch-calendario\.json$/,
            handler: 'NetworkFirst',
            options: { cacheName: 'calendario-espoch' }
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node'
  }
});
