<script lang="ts">
import type { UniPopupInstance, UniPopupProps } from '@uni-helper/uni-ui-types'
import type { PropType } from 'vue'

import {
  defineComponent,
  nextTick,
  ref,
  watch,
} from 'vue'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
const props = defineProps({
  /**
   * @description 否显示
   */
  modelValue: {
    type: Boolean,
    default: false,
  },
  // animation: {
  //   type: Boolean,
  //   default: true,
  // },
  /**
   * 弹出方式
   *
   * top 顶部弹出
   *
   * center 居中弹出
   *
   * bottom 底部弹出
   *
   * left 左侧弹出
   *
   * right 右侧弹出
   *
   * message 预置样式，消息提示
   *
   * dialog 预置样式，对话框
   *
   * share 预置样式，底部弹出分享
   *
   * 默认为 center
   */
  type: {
    type: String as PropType<UniPopupProps['type']>,
    default: () => 'center',
  },
  /**
   * 是否点击遮罩关闭
   */
  isMaskClick: {
    type: Boolean,
    default: true,
  },
  /**
   * 蒙版颜色
   */
  maskBackgroundColor: {
    type: String,
    default: () => 'rgba(0,0,0,0.4)',
  },
  /**
   * 背景颜色
   */
  backgroundColor: {
    type: String,
  },

})
const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'change', value: Parameters<Required<UniPopupInstance>['onChange']>[0]): void
  (e: 'maskClick'): void
}>()

const show = ref(false)
// const style = ref<CSSProperties>({
//   // transform: props.type == 'bottom' ? 'translateY(100%)' : 'scale(1.1)',
//   // opacity: props.type == 'bottom' ? '1' : '0',
//   animationName: 'none',
// });
const animation = ref(false)
// const maskBg = ref('rgba(0, 0, 0, 0)');
watch(
  () => props.modelValue,
  () => {
    if (props.modelValue === true) {
      animation.value = true
      // style.value.animationName = 'none';
      // style.value.transform = props.type == 'bottom' ? 'translateY(100%)' : 'scale(1.1)';
      nextTick(() => {
        const t = setTimeout(() => {
          show.value = true
          clearTimeout(t)
        }, 100)
        // style.value.animationName = `${props.type}-show`;
        // const t = setTimeout(() => {
        //   clearTimeout(t);
        //   // style.value.transform = props.type == 'bottom' ? 'translateY(0%)' : 'scale(1)';
        //   style.value.opacity = '1';
        //   maskBg.value = 'rgba(0, 0, 0, .4)';
        // }, 999);
      })
    }
    else {
      // style.value.animationName = `${props.type}-hide`;
      // style.value.transform = props.type == 'bottom' ? 'translateY(0%)' : 'scale(1)';
      animation.value = false
      const t = setTimeout(() => {
        clearTimeout(t)
        show.value = false
        // style.value.transform = props.type == 'bottom' ? 'scale(1)' : 'translateY(0%)';
        // style.value.opacity = '0';
        // maskBg.value = 'rgba(0, 0, 0, 0)';
        // style.value.animationName = 'none';
      }, 300)
    }
  },
  {
    immediate: true,
  },
)

function close() {
  if (props.isMaskClick) {
    emit('update:modelValue', false)
  }
}

function handleStop() {
  return null
}
</script>

<template>
  <root-portal enable>
    <view
      v-show="show"
      class="c-popup-container"
      :class="type"
    >
      <view
        v-if="type !== 'center'"
        class="c-popup-mask"
        :class="{ show: animation }"
        :style="{ 'background-color': maskBackgroundColor }"
        @click="isMaskClick ? close() : void 0"
        @touchmove.stop.prevent="handleStop"
      />

      <view
        class="c-popup-wrapper-fixed"
        :class="{ show: animation }"
        @touchmove.stop.prevent="handleStop"
      >
        <view
          v-if="type === 'center'"
          class="c-popup-mask"
          :class="{ show: animation }"
          :style="{ 'background-color': maskBackgroundColor }"
          @click="isMaskClick ? close() : void 0"
          @touchmove.stop.prevent="handleStop"
        />
        <view
          class="c-popup-wrapper"
          :style="{ backgroundColor }"
        >
          <slot />
        </view>
      </view>
    </view>
  </root-portal>
</template>

<style lang="scss">
@keyframes mask-show {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

@keyframes mask-hide {
  0% {
    opacity: 1;
  }

  100% {
    opacity: 0;
  }
}
@keyframes top-show {
  0% {
    transform: translateY(200%);
  }

  100% {
    transform: translateY(0%);
  }
}

@keyframes top-hide {
  0% {
    transform: translateY(0%);
  }
  100% {
    transform: translateY(200%);
  }
}

@keyframes bottom-show {
  0% {
    transform: translateY(200%);
  }

  100% {
    transform: translateY(0%);
  }
}

@keyframes bottom-hide {
  0% {
    transform: translateY(0%);
  }

  100% {
    transform: translateY(200%);
  }
}

@keyframes center-show {
  0% {
    transform: scale(1.1);
    opacity: 0;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes center-hide {
  0% {
    transform: scale(1);
    opacity: 1;
  }

  100% {
    transform: scale(1.1);
    opacity: 0;
  }
}

.c-popup-container {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  z-index: 99;

  &.bottom {
    .c-popup-wrapper-fixed {
      left: 0;
      right: 0;
      bottom: 0;

      &:not(.show) {
        animation-name: bottom-hide;
      }

      &.show {
        animation-name: bottom-show;
      }
    }
  }

  &.center {
    .c-popup-wrapper-fixed {
      display: flex;
      align-items: center;
      justify-content: center;
      left: 0;
      right: 0;
      bottom: 0;
      top: 0;
      z-index: 99;

      &:not(.show) {
        animation-name: center-hide;
      }

      &.show {
        animation-name: center-show;
      }
    }

    .c-popup-wrapper {
      transform: translateY(-5vh);
    }
  }
}

.c-popup-wrapper-fixed {
  position: fixed;
  animation-duration: 300ms;
  // animation-duration: 3s;
  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;
}

.c-popup-mask {
  position: fixed;
  z-index: 0;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  animation-duration: 300ms;
  // animation-duration: 3s;

  animation-timing-function: ease-in-out;
  animation-fill-mode: forwards;

  &:not(.show) {
    animation-name: mask-hide;
  }

  &.show {
    animation-name: mask-show;
  }
}

.c-popup-wrapper {
  z-index: 1;
  position: relative;
}
</style>
