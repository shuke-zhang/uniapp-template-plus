export const NAV_BAR_HEIGHT = 45
export const getStatusBarHeight = () => uni.getWindowInfo()?.statusBarHeight || 0

/**
 * 获取导航栏高度
 *
 */
export function getNavBarHeight() {
  return `calc(100vh - ${NAV_BAR_HEIGHT}px - ${getStatusBarHeight()}px)`
}
