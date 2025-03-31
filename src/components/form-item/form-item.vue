<script  lang="ts">
import { defineComponent } from 'vue'
import type { CSSProperties, PropType } from 'vue'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
defineProps({
  // last: createBooleanProp(false),
  prop: createStringProp(''),
  className: createStringProp(''),
  labelPosition: createStringProp<'left' | 'top'>('left'),
  formItemStyle: {
    type: [String, Object] as PropType<string | CSSProperties>,
    default: () => ({}),
  },
})

const emit = defineEmits(['click'])
</script>

<template>
  <view
    :id="prop ? `field-${prop}` : ''"
    class="kc-form-item"
    :class="[`kc-form-item_${labelPosition}`, className]"
    :style="[
      formItemStyle,
    ]"
    @click="emit('click')"
  >
    <slot />
  </view>
</template>

<style lang="scss">
.kc-form-item {
  box-sizing: border-box;
  display: flex;
  overflow: hidden;
  border-bottom: 1rpx solid #b9b7c032;
  font-size: 34rpx;
  margin-bottom: -1rpx;
  width: 100%;

  &:not([class*=' pt-']) {
    padding-top: 43rpx;
  }

  &:not([class*=' pb-']) {
    padding-bottom: 43rpx;
  }

  &:not([class*=' pr-']) {
    padding-right: 40rpx;
  }

  &:not([class*=' pl-']) {
    padding-left: 0;
  }
}

.kc-form-item_left {
  justify-content: space-between;
}

.kc-form-item_top {
  flex-direction: column;
}
</style>
