import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes the production build work whether it is served from the
// domain root or from a sub-folder on Hostinger.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    target: 'es2019',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: Number(process.env.PORT) || 4173,
  },
});
