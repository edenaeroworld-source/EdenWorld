import { defineConfig } from 'vite';
import { GAME } from './src/core/Config.ts';

/**
 * Injeta a versão no `index.html` a partir de `GAME`, em desenvolvimento e no
 * build. Antes da Genesis 0.5 a `<meta description>` trazia o número escrito à
 * mão, e ficou quatro versões para trás sem que nada acusasse.
 */
function versaoNoHtml() {
  return {
    name: 'eden-versao-no-html',
    transformIndexHtml(html: string) {
      return html
        .replaceAll('%EDEN_VERSION_LABEL%', GAME.versionLabel)
        .replaceAll('%EDEN_VERSION_NAME%', GAME.versionName)
        .replaceAll('%EDEN_VERSION%', GAME.version);
    },
  };
}

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
  plugins: [versaoNoHtml()],
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
