<script lang="ts">
import {
  computed,
  defineComponent,
} from 'vue'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
const props = defineProps({
  modelValue: createBooleanProp(false),
  title: createStringProp('提示'),
  type: createStringProp<'1' | '2' | '3' | '4' | '5'>('1'),
  isMaskClick: createBooleanProp(true),
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = useVModel(props, 'modelValue', emit)

const radianHeight = 60

const sizeConfig = [
  400,
  269,
  353,
  252,
  200,
]

const paddingTop = computed(() => {
  return getNumericValue(sizeConfig[Number(props.type) - 1] - radianHeight)
})
const imgHeight = computed(() => {
  return getNumericValue(sizeConfig[Number(props.type) - 1])
})
console.log(imgHeight.value, paddingTop.value, '测试')
</script>

<template>
  <kc-popup
    v-model="visible"
    :is-mask-click="isMaskClick"
    type="center"
  >
    <view
      class="modal-container"
      :style="{
        paddingTop,
      }"
    >
      <image
        class="modal-img"
        :style="{
          height: imgHeight,
        }"
        mode="aspectFill"
        :src="`${STATIC_URL}/text.png`"
        alt=""
      />
      <view
        class="bg-white overflow-hidden pl-40rpx pr-40rpx pb-40rpx"
        :style="{
          paddingTop: radianHeight,
        }"
      >
        <text class="modal-title flex-center flex-row">
          {{ title }}
        </text>
        <slot />
      </view>
    </view>
  </kc-popup>
</template>

<style lang="scss">
.modal-title {
  margin-top: 20rpx;
  margin-bottom: 20rpx;
}

.modal-container {
  width: 686rpx;
  position: relative;
  border-radius: 0 0 24rpx 24rpx;
  overflow: hidden;

  .content {
    line-height: 1.5;
  }

  .modal-img {
    position: absolute;
    width: 686rpx;
    top: 0;
  }

  .bg-white {
    padding-top: 60rpx;
    overflow: hidden;
  }
}
</style>
