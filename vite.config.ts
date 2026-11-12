import { defineConfig } from 'vite';

/**
 * Hosts adicionais aceitos pelo servidor de desenvolvimento / preview.
 * Útil para ambientes remotos (sandboxes, túneis, Codespaces).
 * Exemplo: EDENWORLD_ALLOWED_HOSTS=".meu-tunel.dev,.outro.app" npm run dev
 */
const extraHosts = (process.env.EDENWORLD_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const allowedHosts = ['localhost', '127.0.0.1', '.e2b.app', '.github.dev', '.gitpod.io', ...extraHosts];

export default defineConfig({
  // Base relativa: o build funciona em qualquer subcaminho (GitHub Pages, itch.io, CDN).
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        // Three.js em um chunk separado: melhor cache entre versões do jogo.
        manualChunks(id: string) {
          if (id.includes('node_modules/three')) return 'three';
          return undefined;
        },
      },
    },
  },
});
