import { defineConfig } from 'vite';

export default defineConfig({
  // Đường dẫn tương đối để chạy được trong WebView của Capacitor
  base: './',
  server: { host: true, port: 5173 },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000, // Phaser khá lớn, tắt cảnh báo
  },
});
