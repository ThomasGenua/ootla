import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';
import { publicSeoPlugin } from './scripts/public-seo-plugin.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [publicSeoPlugin(env, process.cwd())],
    root: fileURLToPath(new URL('./client', import.meta.url)),
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    envDir: process.cwd(),
    build: {
      outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      proxy: { '/api': { target: `http://127.0.0.1:${env.PORT || '3100'}`, changeOrigin: false } },
    },
  };
});
