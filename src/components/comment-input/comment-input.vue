<script lang="ts">
import type { InputOnKeyboardheightchangeEvent } from '@uni-helper/uni-app-types'

import { onShow } from '@dcloudio/uni-app'
import { defineComponent, ref } from 'vue'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: String,
  },
  focus: {
    type: Boolean,
  },
  placeholder: {
    type: String,
  },
  btnText: {
    type: String,
    default: '发送',
  },
  isDisabled: {
    type: Boolean,
  },
  isStop: { // 新增停止状态 prop
    type: Boolean,
    default: false,
  },
  isOffset: {
    type: Boolean,
  },
})
const emit = defineEmits<{
  'update:modelValue': [boolean]
  'update:focus': [boolean]
  'confirm': []
  'stop': []
}>()
const inputValue = useVModel(props, 'modelValue', emit)
const isFocus = useVModel(props, 'focus', emit)
const keyboardHeight = ref(0)
const inputBottom = ref()
function handleBlur() {
  isFocus.value = false
}
const duration = ref()
function handleFocus() {
  isFocus.value = true
}

onShow(() => {
  // 添加小程序条件编译
  uni.onKeyboardHeightChange((event) => {
    const { height } = event
    // 例如，设置输入框的 bottom 值为键盘高度
    inputBottom.value = `${height}px`
  })
})
onHide(() => {
  uni.offKeyboardHeightChange()
})

function handleKeyboardHeightChange(res: InputOnKeyboardheightchangeEvent) {
  duration.value = res.detail.duration
  if (keyboardHeight.value !== res.detail.height) {
    keyboardHeight.value = res.detail.height
    keyboardHeight.value = res.detail.height
  }
}
</script>

<template>
  <view
    class="comment-input-container flex items-center justify-between"
    :style="{ bottom: inputBottom }"
  >
    <input
      v-model="inputValue"
      class="comment-input bg-white content"
      placeholder-class="comment-input-placeholder"
      :focus="isFocus"
      :placeholder="placeholder"
      type="text"
      :adjust-position="false"
      hold-keyboard
      confirm-type="send"
      @blur="handleBlur"
      @focus="handleFocus"
      @keyboardheightchange="handleKeyboardHeightChange"
    >
    <button
      class="send-btn"
      hover-stop-propagation
      :disabled="isDisabled || (!isStop && !inputValue)"
      :class="[
        (isDisabled || (!isStop && !inputValue)) ? 'disabled' : '', // 修改 class 逻辑
        isStop ? 'stop-btn' : '',
      ]"
      @click="emit('confirm')"
    >
      {{ btnText }}
    </button>
    <slot />
  </view>
</template>

<style lang="scss">
.comment-input-container {
  position: fixed;
  bottom: 0;
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
  background-color: #f4f4f4;
  height: 120rpx;
  padding: 20rpx;
  box-sizing: border-box;
  z-index: 50;
  right: 0;
  left: 0;

  .comment-input {
    width: 550rpx;
    height: 80rpx;
    border-radius: 40rpx;
    font-size: 18px;
    box-sizing: border-box;
    padding: 0 32rpx;
    color: #555555;
  }

  .comment-input-placeholder {
    color: #999999;
    font-size: 18px;
  }

  .send-btn {
    // position: static;
    width: 140rpx;
    height: 80rpx;
    border-radius: 40rpx;
    font-size: 18px;
    font-weight: normal;
    line-height: 80rpx;
    text-align: center;
    letter-spacing: 0;
    color: #ffffff;
    z-index: 0;
    background: #07c160;
    margin: 0;
    box-sizing: border-box;
  }

  .send-btn.disabled {
    background-color: #07c160;
    color: #ffffff;
    opacity: 0.5;
  }
  .stop-btn {
    background: #ff4444 !important;

    &.disabled {
      // 保持可用状态
      opacity: 1 !important;
    }
  }
}
</style>
