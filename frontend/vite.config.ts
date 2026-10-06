import { VitePWA } from 'vite-plugin-pwa'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/claner-icon-192.png',
        'icons/claner-icon-360.png',
        'icons/claner-icon-512.png',
      ],
      manifest: {
        name: 'Claner',
        short_name: 'Claner',
        description: 'Claner · 婴儿成长记录博客',
        theme_color: '#a7d8f8',
        background_color: '#a7d8f8',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/claner-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/claner-icon-360.png',
            sizes: '360x360',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/claner-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/claner-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/, /^\/media/],
      },
      // 开发期关掉 SW，避免缓存旧 JS 导致「改了没生效」
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true, // 0.0.0.0，允许局域网访问
    port: 5180, // 避开本机常见 Vite 5173 占用
    strictPort: true,
    // 开发期放行局域网 IP / Tunnel / 自定义域名（否则会出现 Blocked request）
    allowedHosts: true,
    // 同源代理：手机只访问 :5180，不必直连后端端口
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/media': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
    },
  },
})
