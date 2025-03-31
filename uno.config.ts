import { presetUni } from '@uni-helper/unocss-preset-uni'
import {
  defineConfig,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss'
import scssVariables from './scripts/_unocss/parseScss'

export default defineConfig({
  presets: [
    presetUni({
      // 小程序专用 官方推荐presetAttributify 但是我设置并不生效 https://unocss.net/presets/attributify#attributify-%E6%A8%A1%E5%BC%8F
      attributify: {
        strict: true,
        prefixedOnly: true,
        prefix: 'uno-',
        ignoreAttributes: ['size', 'color'],
      },
    }),
    presetIcons({
      scale: 1, // 图标大小
      warn: true, // 当图标使用不当时（比如图标库没有导入时），会有警告信息输出到控制台。
      extraProperties: {
        'display': 'inline-block', // 让图标显示为 inline-block，以便在行内元素中进行排列
        'vertical-align': 'middle', // 使图标在文本中垂直居中对齐。
      },
      // HBuilderX 必须针对要使用的 Collections 做异步导入
      collections: {
        carbon: () => import('@iconify-json/carbon/icons.json').then(i => i.default),
      },
    }),
  ],
  transformers: [
    transformerDirectives(), // 处理一些特殊的 CSS 指令，允许你通过类名或标签名称应用样式。例如：可以在类名中使用 @apply、@layer 等指令。
    // .btn {
    //   @apply bg-blue-500 text-white py-2 px-4 rounded-lg;
    // }
    transformerVariantGroup(), // 用于处理变体组（Variant Group），比如在同一个类名中组合多个状态类（如 hover、focus 等），可以生成更紧凑的 CSS。
    // @apply hover:bg-blue-700 focus:bg-blue-600 active:bg-blue-800;
  ],
  rules: [
    // 自定义 flex-center 规则，同时应用三个样式
    ['flex-center', { 'display': 'flex', 'justify-content': 'center', 'align-items': 'center' }],
    ['container', { width: 'auto', maxWidth: 'none' }],
  ],
  theme: {
    colors: {
      'primary': scssVariables.primary,
      'green': scssVariables.green,
      'success': scssVariables.success,
      'yellow': scssVariables.yellow,
      'blue': scssVariables.blue,
      'purple': scssVariables.purple,
      'gray': scssVariables.gray,
      'black-1': scssVariables['black-1'],
      'black-2': scssVariables['black-2'],
      'black-3': scssVariables['black-3'],
      'white': scssVariables.white,
      'orange': scssVariables.orange,
      'pink': scssVariables.pink,
    },
    fontSize: {
      large: scssVariables['size-large'],
      default: scssVariables['size-default'],
      medium: scssVariables['size-medium'],
      small: scssVariables['size-small'],
      mini: scssVariables['size-mini'],
    },
    shortcuts: [
      // 颜色快捷方式
      [/^text-(.+)$/, ([, c]) => `text-${c}`],
      [/^bg-(.+)$/, ([, c]) => `bg-${c}`],
      // 字体大小快捷方式
      [/^text-size-(.+)$/, ([, s]) => `text-${s} leading-${s}`],
    ],
  },
})
