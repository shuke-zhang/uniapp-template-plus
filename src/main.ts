import { createSSRApp } from 'vue'
import App from './App.vue'
import '@/styles/weapp-base.scss'
import '@/styles/tailwindcss.css'
import { registerStore } from './store'
import { appGlobalProperties } from './app/app-global-properties'

export function createApp() {
  const app = createSSRApp(App)
  const { Pinia } = registerStore(app)
  app.use(appGlobalProperties)

  return {
    app,
    Pinia,
  }
}
