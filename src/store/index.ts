import type { App } from 'vue'

import { createPinia } from 'pinia'
import * as Pinia from 'pinia'

export * from './modules/user/index'
export * from './modules/socket/index'
export const pinia = createPinia()
export function registerStore(app: App<Element>) {
  app.use(pinia)
  return {
    Pinia,
  }
}
