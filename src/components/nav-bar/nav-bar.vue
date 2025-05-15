<script lang="ts" setup>
import { NAV_BAR_HEIGHT, getStatusBarHeight } from './nav-bar'

/**
 * 组件参数定义
 */
const props = withDefaults(defineProps<{
  /**
   * @description 标题文字
   */
  title?: string

  /**
   * @description 标题是否靠左对齐
   * @note true 表示靠左，false 表示居中
   */
  isLeft?: boolean

  /**
   * @description 是否自定义返回事件
   * @note 开启后点击返回按钮时不会默认返回上一页，而是触发 click 事件
   */
  customClick?: boolean

  /**
   * @description 是否透明样式（如白色字体、透明背景）
   */
  transparent?: boolean

  /**
   * @description 是否显示返回按钮
   */
  showBack?: boolean
}>(), {
  transparent: false,
  customClick: false,
  showBack: true,
})

/**
 * 自定义事件
 */
const emit = defineEmits(['click'])

/**
 * 获取状态栏高度，用于顶部内边距
 */
const statusBarHeight = ref(getStatusBarHeight())

/**
 * 导航栏样式（高度 + 状态栏高度）
 */
const navbarStyle = computed(() => ({
  'margin-top': `${statusBarHeight.value}px`,
  'height': `${NAV_BAR_HEIGHT}px`,
}))

/**
 * 返回按钮点击事件处理
 */
function back() {
  if (props.customClick) {
    emit('click')
  }
  else {
    uni.navigateBack({})
  }
}
</script>

<template>
  <view class="uni-navbar" :class="{ transparent }">
    <view class="uni-navbar-inner" :style="navbarStyle">
      <!-- 左侧区域：返回按钮或插槽 -->
      <view v-if="showBack" class="left-content" @click="back">
        <icon-font name="left" :color="transparent ? '#fff' : 'inherit'" />
      </view>
      <view v-else class="left-content withe-auto left-content-slot">
        <slot name="left" />
      </view>

      <!-- 中间标题区域（默认 slot 或 title 文本） -->
      <view class="uni-navbar-content" :class="{ 'is-left': isLeft }">
        <slot>{{ title }}</slot>
      </view>

      <!-- 右侧插槽区域 -->
      <view class="right-content">
        <slot name="right" />
      </view>
    </view>
  </view>
</template>

<style lang="scss">
.uni-navbar {
  border: 1px #eee solid;
  background-color: #fff;
  box-sizing: border-box;
  z-index: 999;
  &.transparent {
    border-color: transparent;
    background-color: transparent;

    .uni-navbar-content {
      color: #fff;
    }
  }
}

.uni-navbar-inner {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  box-sizing: border-box;
  position: relative;
}

/* 左侧/右侧固定宽度容器 */
.left-content,
.right-content {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 45px;
  height: 100%;
}

/* 自定义插槽时左侧宽度自动适配 */
.withe-auto {
  width: auto;
}
.left-content-slot {
  padding-left: 15px;
}

/* 中间内容区绝对定位，占满左右中间空间 */
.uni-navbar-content {
  position: absolute;
  height: 100%;
  top: 0;
  bottom: 0;
  left: 45px;
  right: 45px;
  display: flex;
  justify-content: center;
  align-items: center;
  text-align: center;
}

/* 标题靠左时应用的样式 */
.is-left {
  justify-content: flex-start;
  text-align: left;
  padding-left: 10px;
}
</style>
