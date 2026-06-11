import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const workspaceRoot = path.resolve(frontendRoot, '..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [workspaceRoot],
    },
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
