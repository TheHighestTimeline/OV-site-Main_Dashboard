import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Split the big, rarely-changing vendor libraries into their own chunk.
    // React, Clerk and Supabase change only when you bump versions, so isolating
    // them means a normal app deploy doesn't bust their cached chunk — repeat
    // visitors re-download only your changed app code, not the whole framework.
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'clerk-vendor': ['@clerk/clerk-react'],
          'supabase-vendor': ['@supabase/supabase-js'],
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
