import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname),
  base: './',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../electron-ui/dist'),
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
})


