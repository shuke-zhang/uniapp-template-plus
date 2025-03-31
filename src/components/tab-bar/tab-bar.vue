<script  lang="ts">
import type { PropType } from 'vue'

import { defineComponent, nextTick } from 'vue'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
const props = defineProps({
  modelValue: createNumericProp('0'),
  tabs: createArrayProp<DictData>(),
  beforeChange: {
    type: Function as PropType<(nextValue: number | string) => Promise<void>>,
    default: () => Promise.resolve(),
  },
  compact: createBooleanProp(false),
})

const emit = defineEmits<{
  'update:modelValue': [string | number]
  'change': [string | number]
}>()
const active = useVModel(props, 'modelValue', emit)

function handleClick(e: number | string) {
  if (active.value !== e) {
    props.beforeChange(e).then(() => {
      active.value = e
      nextTick(() => {
        emit('change', e)
      })
    })
  }
}
</script>

<template>
  <view
    class="tab-bar flex flex items-center bg-white"
    :class="{ 'tab-bar-compact': compact }"
  >
    <view
      v-for="(item, index) in tabs"
      :key="item.value"
      class="tab-bar-item flex-center inline-flex"
      :class="{ active: active === item.value, first: index === 0, last: index === tabs.length - 1 }"
      @click="handleClick(item.value)"
    >
      {{ item.label }}
    </view>
    <slot />
  </view>
</template>

<style lang="scss">
.tab-bar {
  padding: 0 32rpx;
  height: 80rpx;
  border-radius: 0 0 24rpx 24rpx;

  .tab-bar-item {
    padding: 0 15rpx;
    height: 100%;
    color: #cccc;

    &.active {
      color: #459d76;
      position: relative;

      &::after {
        content: '';
        width: 40rpx;
        height: 8rpx;
        border-radius: 4rpx;

        /* 主色渐变 */
        background: linear-gradient(92deg, #fc788e 4%, #ff4d6a 99%);
        position: absolute;
        bottom: 0;
        font-size: 36rpx;
      }
    }

    &:not(.active) {
      font-size: 32rpx;
    }
  }
}

.tab-bar-compact {
  .tab-bar-item.first {
    padding-left: 0 !important;
  }

  .tab-bar-item.last {
    padding-right: 0 !important;
  }
}
</style>
