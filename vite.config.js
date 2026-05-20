import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  base: './',
  plugins: [react()],
  root: resolve(__dirname, 'renderer'),
  css: {
    postcss: resolve(__dirname, 'postcss.config.cjs'),
  },
  build: {
    outDir: resolve(__dirname, 'electron-ui/dist'),
    emptyOutDir: true,
  },
});
