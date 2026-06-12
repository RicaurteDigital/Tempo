import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['fonts/*.woff2', 'icons/*.png'],
      manifest: {
        name: 'Tempo',
        short_name: 'Tempo',
        description: 'Sistema operativo de tiempo personal',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#000000',
        background_color: '#000000',
        lang: 'es-419',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /\.woff2$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tempo-fonts',
              expiration: { maxEntries: 5, maxAgeSeconds: 365 * 24 * 60 * 60 },
            },
          },
        ],
      },
    }),
    // Basic SSL only when running `npm run dev:https` for LAN phone testing
    ...(mode === 'https'
      ? [import('@vitejs/plugin-basic-ssl').then((m) => m.default())]
      : []),
  ],
  server: {
    port: 3131,
    strictPort: true,
    host: true,
  },
  preview: {
    port: 3131,
    strictPort: true,
    host: true,
  },
}));
