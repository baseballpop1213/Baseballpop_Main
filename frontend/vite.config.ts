// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    allowedHosts: ['.replit.dev', '.repl.co', 'localhost'],
    hmr: {
      clientPort: 443,
    },
    proxy: {
      // All frontend API calls go to /api/... which Vite forwards to the backend.
      // We strip the /api prefix so the backend sees /me, /me/teams, /coach/my-teams, etc.
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      // Optional: keep health check going directly to the backend
      '/health': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
