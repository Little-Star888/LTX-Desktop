import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'

export default defineConfig(({ mode }) => {
  const isWeb = mode === 'web'

  const config = {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './frontend')
      }
    },
    build: {
      outDir: 'dist'
    },
    define: {
      'import.meta.env.VITE_MODE': JSON.stringify(mode || 'electron'),
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || ''),
    }
  }

  if (isWeb) {
    return {
      ...config,
      base: '/',
      build: {
        ...config.build,
        outDir: 'dist-web'
      }
    }
  }

  return {
    ...config,
    plugins: [
      ...config.plugins,
      electron([
        {
          entry: 'electron/main.ts',
          onstart(options) {
            if (process.env.ELECTRON_DEBUG) {
              options.startup(['--inspect=9229', '--remote-debugging-port=9222', '.', '--no-sandbox'])
            } else {
              options.startup()
            }
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: true,
              rollupOptions: {
                external: ['electron']
              }
            }
          }
        },
        {
          entry: 'electron/preload.ts',
          onstart(options) {
            options.reload()
          },
          vite: {
            build: {
              outDir: 'dist-electron',
              sourcemap: true,
              rollupOptions: {
                output: {
                  format: 'cjs'
                }
              }
            }
          }
        }
      ]),
      renderer()
    ],
    base: './',
  }
})
