import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // One combined vendor chunk for ALL node_modules code (2026-07 fix).
    // The previous config split react / @clerk/clerk-react into separate
    // chunks; newer Clerk versions share internals with React in a way that
    // made the split chunks initialize out of order — a blank page with
    // "ReferenceError: Cannot access 'L' before initialization" in
    // clerk-vendor. A single vendor chunk keeps the caching benefit (vendor
    // code only changes when you bump versions) with no ordering hazard.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
        },
      },
    },
  },
  server: {
    // Allow Netlify's cloud Preview Server (it runs `vite` and serves it from
    // devserver-<branch>--ovmgdashboard.netlify.app). The leading dot allows
    // netlify.app and every subdomain, so any branch's preview works. Only
    // affects the dev server — production `vite build` output is unaffected.
    allowedHosts: ['.netlify.app'],
    // Pin Vite to 5173 and fail loudly if it's taken, instead of silently
    // drifting to 5174/5175 (which crosses wires with netlify dev's targetPort).
    port: 5173,
    strictPort: true,
    proxy: {
      '/.netlify/functions': {
        target: 'http://localhost:8888',
        changeOrigin: true,
      },
    },
  },
});
