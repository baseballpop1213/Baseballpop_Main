// frontend/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Allow Replit's preview host
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '58680740-f947-442a-a61c-3b301ca9f092-00-23zy02ckuh0f0.worf.replit.dev',
    ],
  },
})
