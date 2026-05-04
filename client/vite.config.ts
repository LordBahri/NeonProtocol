import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@features': resolve(__dirname, 'src/features'),
      '@store': resolve(__dirname, 'src/store'),
      '@assets': resolve(__dirname, 'src/assets'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/colyseus': {
        target: 'ws://localhost:2567',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ['pixi.js'],
          gsap: ['gsap'],
          zustand: ['zustand'],
          colyseus: ['colyseus.js'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['pixi.js', 'gsap', 'zustand', 'colyseus.js'],
  },
});
