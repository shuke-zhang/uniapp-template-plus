import path from 'node:path'
import type { UserConfig } from 'vite'
import Uni from '@dcloudio/vite-plugin-uni'
import UniPages from '@uni-helper/vite-plugin-uni-pages'
import Components from '@uni-helper/vite-plugin-uni-components'
import AutoImport from 'unplugin-auto-import/vite'
import { defineConfig, loadEnv } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'
import postcssPresetEnv from 'postcss-preset-env'
import Icons from 'unplugin-icons/vite'
import { generatedIcons } from './scripts/iconfont'

export default defineConfig(async ({ mode, command }) => {
  const env = loadEnv(mode, './')
  const isBuild = command === 'build'

  const plugins: UserConfig['plugins'] = [
    UniPages({
      // homePage: 'pages/home/index',
      subPackages: ['src/feature/pages'],
      exclude: [
        // '**/components/**/*.vue',
      ],
    }),
    Components({
      globalNamespaces: ['global'],
      dts: 'src/types/components.d.ts',
    }),
    Uni(),
    generatedIcons(isBuild),
    AutoImport({
      imports: [
        'vue',
        'uni-app',
        {
          from: 'src/hooks',
          imports: [
            'DictData',
            'PageIdentifier',
            'ListDataState',
            'ListDataStatusListType',
            'ListActions',
          ],
          type: true,
        },

      ],
      dts: './src/types/auto-imports.d.ts',
      dirs: [
        'src/hooks',
        'src/utils',
        'src/store',
      ],
    }),
    mode === 'production'
      ? visualizer({
          gzipSize: true,
          brotliSize: true,
          emitFile: false,
          filename: path.resolve(__dirname, `./build/stats.html`), // 分析图生成的文件名
          open: true, // 如果存在本地服务端口，将在打包后自动展示
        })
      : null,
    Icons({
      compiler: 'vue3',
    }),

  ]
  const config: UserConfig = {
    resolve: {
      // preserveSymlinks: true,
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler', // or "modern", "legacy"
          silenceDeprecations: ['legacy-js-api'],
        },
      },
      postcss: {
        plugins: [
          postcssPresetEnv({
            stage: 3,
            features: { 'nesting-rules': false },
          }),
        ],
      },
    },
    plugins,
    define: {
      __DEV__: mode === 'development',
      __PROD__: mode === 'production',
      API_URL: `"${env.VITE_APP_API_URL}"`,
      UPLOAD_API_URL: `"${env.VITE_APP_UPLOAD_API_URL}"`,
      APP_TITLE: `"${env.VITE_APP_TITLE}"`,
      STATIC_URL: `"${env.VITE_APP_STATIC_URL}"`,
      FILE_URL: `"${env.VITE_APP_FILE_URL}"`,
      CUSTOM_TOKEN: `"${env.VITE_APP_TOKEN}"`,
    },
    server: {
      host: '0.0.0.0',
      open: false,
      port: 8080,
    },
  }
  return config
})
