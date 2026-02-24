import { createSSRApp } from 'vue'
import App from './App.vue'
import { registerStore } from './store'
import { appGlobalProperties } from './app/app-global-properties'
import '@/styles/tailwindcss.css'
import '@/styles/weapp-base.scss'
import 'uno.css'

export function createApp() {
  const app = createSSRApp(App)
  const { Pinia } = registerStore(app)
  app.use(appGlobalProperties)

  return {
    app,
    Pinia,
  }
}
