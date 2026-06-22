// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

import react from '@astrojs/react';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    server: {
      // Dev-mode API proxy. When running `pnpm dev` (or `make dev`), Astro
      // listens on :4321 and forwards every /api/* request to the Fastify
      // backend at :3000. The browser sees a single origin (:4321), so the
      // backend's HttpOnly auth cookie stays scoped correctly.
      //
      // Production runs through ModSec at :8443 (HTTPS), which proxies to the web
      // container; Vite's dev server is not involved.
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        '/socket.io': {
          target: 'http://localhost:3000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
  },
});
