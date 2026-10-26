import { defineConfig } from 'vite';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {parse} from 'dotenv';
import { fileURLToPath } from 'node:url';
import { publicSeoPlugin } from './scripts/public-seo-plugin.js';

export default defineConfig(({ mode }) => {
  const selected=process.env.OOTLA_ENV_FILE?.trim();
  const files=selected?[path.resolve(selected)]:['.env','.env.local','.env.'+mode,'.env.'+mode+'.local'].map(file=>path.resolve(file));
  const loaded:Record<string,string>={};
  for(const file of files){if(!selected&&!existsSync(file))continue;try{Object.assign(loaded,parse(readFileSync(file)));}catch{throw new Error('The selected Ootla build environment could not be read. Values are omitted.');}}
  const env={...loaded,...process.env};
  const publicSettings={PUBLIC_SITE_URL:env.PUBLIC_SITE_URL,PUBLIC_SITE_INDEXING:env.PUBLIC_SITE_INDEXING};
  return {
    plugins: [publicSeoPlugin(publicSettings, process.cwd())],
    root: fileURLToPath(new URL('./client', import.meta.url)),
    publicDir: fileURLToPath(new URL('./public', import.meta.url)),
    envDir: false,
    envPrefix: [],
    build: {
      outDir: fileURLToPath(new URL('./dist/client', import.meta.url)),
      emptyOutDir: true,
      sourcemap: false,
    },
    server: {
      proxy: { '/api': { target: `http://127.0.0.1:${env.PORT || '3100'}`, changeOrigin: false }, '/try': { target: `http://127.0.0.1:${env.PORT || '3100'}`, changeOrigin: false } },
    },
  };
});
