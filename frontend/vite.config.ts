import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In dev (npm run dev) API calls are forwarded to the FastAPI backend on port 8000.
// In production FastAPI serves the built files from frontend/dist itself.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
