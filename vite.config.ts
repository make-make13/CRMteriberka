import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true' ? { overlay: false } : false,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('pdfjs-dist')) return 'pdfjs';
              if (id.includes('@pdfme/ui')) return 'pdfme-ui';
              if (
                id.includes('@pdfme/generator') ||
                id.includes('@pdfme/schemas') ||
                id.includes('@pdfme/pdf-lib') ||
                id.includes('@pdfme/common')
              ) {
                return 'pdfme-core';
              }
            }
          },
        },
      },
    },
  };
});
