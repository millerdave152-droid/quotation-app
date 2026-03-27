import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    // VitePWA disabled in dev to prevent service worker caching issues
    // Re-enable for production builds
    ...(process.env.NODE_ENV === 'production' ? [VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      manifest: false,
      injectRegister: false,
    })] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    allowedHosts: ['.ngrok-free.dev', '.ngrok.io'],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
            return 'react-vendor';
          }

          if (id.includes('framer-motion')) {
            return 'motion-vendor';
          }

          if (id.includes('chart.js') || id.includes('react-chartjs-2') || id.includes('recharts') || id.includes('d3-')) {
            return 'charts-vendor';
          }

          if (id.includes('jspdf') || id.includes('pdfkit') || id.includes('pdfmake') || id.includes('@react-pdf')) {
            return 'pdf-vendor';
          }

          if (id.includes('@heroicons') || id.includes('lucide-react')) {
            return 'icons-vendor';
          }

          if (id.includes('dexie') || id.includes('idb')) {
            return 'offline-vendor';
          }
        },
      },
    },
  },
});
