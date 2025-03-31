export {}

declare module 'vue' {
  type hooks = App.AppInstance & Page.PageInstance
  interface ComponentCustomOptions extends hooks {}
}
