// eslint-disable-next-line ts/no-wrapper-object-types, unused-imports/no-unused-vars
export interface PageKey<T> extends Symbol { }

export type PageIdentifier<T = AnyObject> = PageKey<T> | string | number

export const maps = new Map<PageIdentifier<any>, AnyObject>()
/**
 * app 和 H5 端 defineExpose 无效, 故此设置该方法以兼容多个平台
 * @param key
 * @param expose
 */
export function usePageExpose<T extends AnyObject>(key: PageIdentifier<T>, expose: T) {
  onMounted(() => {
    maps.set(key, expose)
    console.log('Registered', key)
  })

  onUnmounted(() => {
    console.log('Unregistered', key)
    maps.delete(key)
  })

  return {} as T
}

export function getPageExpose<T extends AnyObject>(key: PageIdentifier<T>) {
  return (maps.get(key) || {}) as Partial<T>
}

/**
 * @deprecated 由于 defineExpose 中暴露的方法在 h5 和 app 中无效  建议使用 usePageExpose()/getPageExpose()
 *
 * @description 获取页面实例 主要用于放回上一页刷新
 * 此注释为了提醒开发者使用 usePageExpose()/getPageExpose() 代替 不做任何处理
 * @param lastIndex 页面站index 从尾数 1 为 当前页面 2 为上面一个 页面
 * https://uniapp.dcloud.net.cn/api/window/window.html#getcurrentpages
 */
export function getPageVm<T extends abstract new(...args: any) => any>(lastIndex = 2) {
  if (isApp || isWeb) {
    return logger.error('getPageVm() 方法在 app 和 h5 端无效  建议使用 usePageExpose()/getPageExpose()')
  }
  if (lastIndex <= 0)
    return undefined
  const pages = getCurrentPages()
  const vm = pages?.[pages.length - lastIndex]?.$vm as InstanceType<T>
  return vm || undefined
}
