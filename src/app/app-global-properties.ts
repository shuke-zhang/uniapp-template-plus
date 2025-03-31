import type { App } from 'vue'
import * as colorConfig from '@/utils/const/index'
import { formatTime } from '@/utils/dayjs'

/**
 * app 全局属性 包括样式颜色 (COLOR) 请求地址 静态资源地址等
 *
 */
export const appGlobalProperties = {

  install(app: App) {
    for (const key in colorConfig) {
      if (Object.prototype.hasOwnProperty.call(colorConfig, key)) {
        app.config.globalProperties[key] = (colorConfig)[key as keyof typeof colorConfig] as string
      }
    }

    app.config.globalProperties.API_URL = API_URL
    app.config.globalProperties.STATIC_URL = STATIC_URL
    app.config.globalProperties.FILE_URL = FILE_URL
    /**
     * @description 上传文件成功后返回的链接添加前缀
     */
    app.config.globalProperties.$addPrefixUrl = addPrefixUrl
    /**
     * @description 将数字转化为字母 A-Z
     */
    app.config.globalProperties.$numberToLetter = numberToLetter
    /**
     * @description 格式化时间 默认值 YYYY-MM-DD
     */
    app.config.globalProperties.$formatTime = formatTime

    return app
  },
}
