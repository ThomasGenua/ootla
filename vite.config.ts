import {resolveRuntimeEnvironmentFile} from './server/config/instance-files.js';
import { defineConfig } from 'vite';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {parse} from 'dotenv';
import { fileURLToPath } from 'node:url';
import { publicSeoPlugin } from './scripts/public-seo-plugin.js';

export default defineConfig(({ mode }) => {
  // Build file selection stays explicit; only public SEO values enter browser output.
  const selection=resolveRuntimeEnvironmentFile({...process.env,NODE_ENV:'development'},process.cwd());
  const selected=selection.source==='explicit'||selection.source==='instance';
  const files=selected?[selection.path!]:['.env','.env.local','.env.'+mode,'.env.'+mode+'.local'].map(file=>path.resolve(file));
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
