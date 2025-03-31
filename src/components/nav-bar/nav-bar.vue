<script lang="ts" setup>
import { NAV_BAR_HEIGHT, getStatusBarHeight } from './nav-bar'

const props = withDefaults(defineProps<{
  /**
   * @description 标题
   */
  title?: string
  /**
   * @description 是否是从左依次显示
   * @note customClick 为 true 时 返回icon 按钮在左侧 内容在右侧
   */
  isLeft?: boolean
  /**
   * @description 是否自定义返回事件
   * @note 如果 isLeft 为 true  则依次从左到右显示
   * @returns {Event} 返回一个点击事件，开发者可以通过监听该事件来定义自定义的返回行为。
   */
  customClick?: boolean
  /**
   * @description 是否透明
   * @note 当透明时 文字和icon 颜色为白色
   */
  transparent?: boolean

  /**
   * @description 是否显示返回按钮
   */
  showBack?: boolean
}>(), {
  // backgroundColor: 'transparent',
  transparent: false,
  customClick: false,
  showBack: true,
})

const emit = defineEmits(['click'])

const statusBarHeight = ref(getStatusBarHeight())
const navbarStyle = computed(() => {
  return {
    'margin-top': `${statusBarHeight.value}px`,
    'height': `${NAV_BAR_HEIGHT}px `,
  }
})

const slots = useSlots()
function back() {
  if (props.customClick) {
    emit('click')
  }
  else {
    uni.navigateBack({})
  }
}

const touched = ref(false)

function handleTouchstart() {
  touched.value = true
}

function handleTouchend() {
  touched.value = false
}

const sysInfo = uni.getWindowInfo()
const x = sysInfo.windowWidth - 70
const y = sysInfo.windowHeight - 140
const showFab = ref(false)
onMounted(() => {
  showFab.value = true
})
onBeforeUnmount(() => {
  showFab.value = false
})
</script>

<template>
  <view
    class="uni-navbar"
    :class="{ transparent }"
  >
    <view
      class="uni-navbar-inner"
      :style="navbarStyle"
    >
      <view
        v-if="showBack"
        class="left-content"
        @click="back"
      >
        <icon-font
          name="left"
          :color="transparent ? '#fff' : 'inherit'"
        />
      </view>
      <view
        class="uni-navbar-content"
        :class="{ 'is-left': isLeft }"
      >
        <slot>{{ title }}</slot>
      </view>
      <view
        class="right-content"
        :color="transparent ? '#fff' : 'inherit'"
      >
        <slot
          name="right"
        />
      </view>
    </view>
  </view>
  <!-- H5 专用浮动按钮 -->
  <!-- #ifdef H5 -->
  <Teleport v-if="showFab && slots?.right" to="uni-page-body">
    <movable-area class="h5-movable-area" :class="{ touched }">
      <movable-view direction="all" :x="x" :y="y">
        <view
          class="movable-area-btn"
          @touchstart="handleTouchstart"
          @touchend="handleTouchend"
        >
          <slot name="right" />
        </view>
      </movable-view>
    </movable-area>
  </Teleport>
  <!-- #endif -->

  <!-- #ifndef H5 -->
  <movable-area v-if="showFab && slots?.right" class="h5-movable-area" :class="{ touched }" :scale-area="true">
    <movable-view direction="all" :x="x" :y="y">
      <view class="movable-area-btn" @touchstart="handleTouchstart" @touchend="handleTouchend">
        <slot name="right" />
      </view>
    </movable-view>
  </movable-area>
  <!-- #endif -->

  <!-- <Teleport
    v-if="showFab && slots?.right "
    to="uni-page-body"
  >
    <movable-area
      class="h5-movable-area"
      :class="{ touched }"
    >
      <movable-view
        direction="all"
        :x="x"
        :y="y"
      >
        <view
          class="movable-area-btn"
          @touchstart="handleTouchstart"
          @touchend="handleTouchend"
        >
          <slot
            name="right"
          />
        </view>
      </movable-view>
    </movable-area>
  </Teleport> -->
</template>

<style lang="scss">
.uni-icons {
  font-family: 'UniIconsFontFamily' !important;
  font-size: 22px;
  font-style: normal;
  color: #333;
}

.uni-navbar {
  border: 1px #eee solid;
  background-color: #fff;
  box-sizing: border-box;
  &.transparent {
    border-color: transparent;
    background-color: transparent;

    .uni-navbar-content {
      color: #fff;
    }
  }
}

.uni-navbar-inner {
  position: relative;
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  box-sizing: border-box;
}

.left-content,
.right-content {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 45px;
  height: 100%;
}

.uni-navbar-content {
  position: absolute;
  height: 100%;
  top: 0;
  bottom: 0;
  left: 45px;
  right: 45px;
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
}

.is-left {
  justify-content: flex-start;
}

.h5-movable-area {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  width: 100%;
  height: 100vh;
  z-index: 99;

  &:not(.touched) {
    pointer-events: none;
  }
}

.movable-area-btn {
  background-color: $uni-color-primary;
  width: 100rpx;
  height: 100rpx;
  border-radius: 100rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: auto !important;

  > .iconfont {
    color: #ffffff !important;
  }
}
</style>
