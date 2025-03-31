<script  lang="ts">
import type { PropType } from 'vue'

import { defineComponent, ref, watch } from 'vue'
import type { DictTypes } from '@/hooks/useDicts/dict'
import { useDicts } from '@/hooks/useDicts'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
const props = defineProps({
  dict: {
    type: String as PropType<DictTypes>,
    default: '',
  },
  data: createArrayProp<DictData>(),
  modelValue: createStringProp(''),
  algin: createStringProp<'horizontal' | 'vertical'>('horizontal'),
})

const { dictsData } = useDicts([props.dict])
const list = ref<DictData[]>([])
const value = useVModel(props, 'modelValue')

console.log(props.data, 'dictsData')
watch([
  () => props.data,
  () => props.dict,
  () => dictsData,
], () => {
  if (props.data?.length)
    list.value = props.data
  else if (props.dict)
    list.value = dictsData[props.dict]
}, {
  immediate: true,
  deep: true,
})
</script>

<template>
  <view
    class="kc-radio text-black-2 justify-end"
    :class="[
      props.algin === 'vertical' ? 'flex-col' : 'flex items-center',
    ]"
  >
    <view
      v-for="item in list"
      :key="item.value"
      class="kc-radio-item-container"
      :class="[
        {
          active: value === item.value,
        },
      ] "
      @click="value = item.value"
    >
      <view
        border="2px solid"
        class="kc-radio-item flex-center"
      />

      <view
        style="margin-left: 10rpx;"
        class="kc-radio-label"
      >
        {{ item.label }}
      </view>
    </view>
  </view>
</template>

<style lang="scss">
.kc-radio {
  flex: 1;
  text-align: right;
  display: inline-flex;
  flex-wrap: wrap;
}

.kc-radio-item-container {
  display: inline-flex;
  align-items: center;

  & + .kc-radio-item-container {
    margin-left: 40rpx;
  }

  &.active {
    color: $primary;

    .kc-radio-item {
      border-color: $primary;
      position: relative;

      &::after {
        content: '';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        height: 20rpx;
        width: 20rpx;
        border-radius: 100rpx;
        background-color: $primary;
        display: block;
      }
    }

    .kc-radio-label {
      color: $primary;
    }
  }
}

.kc-radio-item {
  width: 32rpx;
  height: 32rpx;
  border-radius: 32rpx;
  display: inline-flex !important;
  border: 2rpx solid;
  border-color: $black-1;
}
</style>
