import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://backend:3001',
      '/input-files': 'http://backend:3001',
      '/output-files': 'http://backend:3001'
    }
  }
})
