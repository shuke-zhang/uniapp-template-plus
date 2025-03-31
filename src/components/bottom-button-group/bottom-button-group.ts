const _ButtonGroupPaddingBottom = rpxToPx(20)

/**
 * 不考虑 ButtonGroup props 设置了 offset 的情况下 ButtonGroup 的 底部间距
 * 如果没有安全区 则取 _ButtonGroupPaddingBottom 避免 button 紧贴页面底部
 */
export const BUTTON_GROUP_PADDING_BOTTOM = getSafeAreaHeight('px') || _ButtonGroupPaddingBottom

/**
 * 不考虑 ButtonGroup props 设置了 offset 的情况下 ButtonGroup 的高度 px
 * 80rpx - 按钮高度  40rpx - bottom-button-group内边距
 */
export const BUTTON_GROUP_HEIGHT = rpxToPx(120) + BUTTON_GROUP_PADDING_BOTTOM
