import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import mdx from '@mdx-js/rollup'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

/** Commit of a local build; CI passes its own revision. */
function gitRevision() {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react(),
    mdx(),
    VitePWA({
      registerType: 'autoUpdate',
      // The worker is hand-written (`src/service-worker.ts`): it has to answer
      // `periodicsync`, which a generated worker knows nothing about. Workbox
      // still injects the precache list into it.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
      // The manifest is hand-written in `public/manifest.json` and linked from
      // `index.html`. Left to itself the plugin emits a second, generated one
      // and injects a second <link rel="manifest">; the specification says the
      // first link wins, so the right manifest only kept winning by accident.
      manifest: false,
      injectManifest: {
        // Increase the default 2,097,152 (2MiB) limit
        maximumFileSizeToCacheInBytes: 3_000_000,
        // The plugin registers the worker as a classic script, so build one.
        // The default ES output only happens to work while nothing in the
        // bundle needs an import.
        rollupFormat: 'iife',
      },
    }),
  ],
  build: {
    outDir: 'dist',
    // Source maps ship readable sources, so they are opt-in: the development
    // stand switches them on, releases do not.
    sourcemap: process.env.APP_SOURCEMAP === 'true',
  },
  envPrefix: 'REACT_APP_',
  define: {
    // CI passes APP_VERSION explicitly; local runs fall back to package.json.
    // A tagged release passes its SemVer, the development stand passes
    // `master` and the commit it was built from.
    APP_VERSION: JSON.stringify(
      process.env.APP_VERSION || process.env.npm_package_version || 'dev'
    ),
    APP_REVISION: JSON.stringify(process.env.APP_REVISION || gitRevision()),
    APP_BUILD_DATE: JSON.stringify(
      process.env.APP_BUILD_DATE || new Date().toISOString()
    ),
  },
  test: {
    globals: true,
    environment: 'happy-dom',
  },
})
