import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (mode === 'production' && env.VERCEL === '1') {
    const url = URL.parse(env.VITE_API_BASE_URL || '');
    if (!url || url.protocol !== 'https:' || url.href !== url.origin + '/') {
      throw new Error('Set VITE_API_BASE_URL to the public HTTPS API origin in Vercel.');
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/gateway': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
          changeOrigin: false,
          rewrite: (path) => path.replace(/^\/gateway(?=\/)/, ''),
        },
      },
    },
  };
});
