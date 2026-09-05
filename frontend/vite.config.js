import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Local dev only: frontend code uses relative /api paths, and this proxy
// forwards them to the Express backend so we don't need CORS locally.
// In production the frontend calls VITE_API_BASE_URL directly instead
// (see src/api/client.js) and this proxy has no effect on the built app.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
