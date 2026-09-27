import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const page = (name: string) => fileURLToPath(new URL(name, import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: page('./index.html'),
        assets: page('./assets.html'),
      },
    },
  },
});
