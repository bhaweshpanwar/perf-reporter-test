// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // This is the directory where Vite will put the final, bundled assets.
    // We want it to be inside your 'static' folder.
    outDir: 'static/dist',

    // This tells Vite to clear the 'dist' folder before each build.
    emptyOutDir: true,

    // We need to tell Vite what our entry point is.
    rollupOptions: {
      input: 'static/wip/scripts/script.js',
    },
  },
});
