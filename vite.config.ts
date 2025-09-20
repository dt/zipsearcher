import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? './' : '/',
  build: {
    minify: process.env.NODE_ENV === 'production',
    sourcemap: false, // Disable source maps to prevent 404s for .js.map files
    // Ensure proper asset handling for GitHub Pages
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        // Ensure consistent file naming for caching
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
        manualChunks: {
          // Split Monaco Editor into separate chunk
          monaco: ['@monaco-editor/react', 'monaco-editor'],
          // Split DuckDB (though WASM is already separate)
          duckdb: ['@duckdb/duckdb-wasm'],
          // Split protobuf libraries
          protobuf: ['protobufjs'],
          // Split React vendor dependencies
          vendor: ['react', 'react-dom'],
          // Split compression/zip libraries
          compression: ['fflate']
        }
      }
    }
  }
})
