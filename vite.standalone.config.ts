import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({
      removeViteModuleLoader: true,
      inlinePattern: ['**/*.css', '**/*.js', '**/*.svg'],
    }),
  ],
  esbuild: {
    // Keep the whole inlined script on one line for readability
    supported: { 'template-literal': false },
  },
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    // Inline everything for a truly standalone file
    assetsInlineLimit: 100000000, // 100MB limit for inlining
    rollupOptions: {
      output: {
        // Single file output
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
})