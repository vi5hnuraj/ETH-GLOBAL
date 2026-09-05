import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: ['es2021'],
    minify: 'esbuild',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libraries into separate cached chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ethers': ['ethers'],
          'vendor-charts': ['recharts', 'chart.js', 'react-chartjs-2'],
          'vendor-motion': ['framer-motion'],
          'vendor-ui': ['react-hot-toast', 'react-icons'],
        },
      },
    },
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      target: 'es2021',
      define: {
        global: 'globalThis',
      },
    },
  },
});
