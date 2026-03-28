import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  const proxyTarget = env.VITE_PROXY_TARGET || env.BACKEND_URL || 'http://127.0.0.1:8000'
  const proxy = {
    '/api': {
      target: proxyTarget,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react()],
    envDir: path.resolve(__dirname, '..'),
    server: {
      port: 5173,
      proxy,
    },
    preview: {
      port: 5173,
      proxy,
    },
  }
})
