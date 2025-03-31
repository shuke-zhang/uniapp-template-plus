<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  type: createStringProp(''),
  placeholder: createStringProp(''),
})
const emit = defineEmits<{
  'update:modelValue': [string]
  'confirm': [string | number]
  'clear': []
}>()
const inputValue = useVModel(props, 'modelValue', emit)

function onClear() {
  inputValue.value = ''
  emit('clear')
}
function handleConfirm() {
  emit('confirm', inputValue.value)
}
</script>

<template>
  <view class="search-container">
    <view class="search-container-inner">
      <view class="input-container flex items-center">
        <icon-font
          name="search"
          color="#BCBCBC"
          size="36rpx"
        />
        <input
          v-model="inputValue"
          placeholder-class="text-black-3"
          :placeholder="placeholder"
          confirm-type="search"
          class="search-input"
          @confirm="handleConfirm"
        >
        <view
          v-if="inputValue"
          class="search-close-btn-container flex-center"
          @click="onClear"
        >
          <view class="flex-center search-close-btn">
            <c-icon
              name="close"
              color="#fff"
              size="20rpx"
            />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss">
.search-container {
  height: 120rpx;
  box-sizing: border-box;
  width: 100%;
  position: sticky;
  top: 0;
  z-index: 1;

  .search-container-inner {
    height: 120rpx;
    width: 100%;
    padding: 20rpx 40rpx;
    box-sizing: border-box;
    background-color: white;
  }

  .input-container {
    background: #f4f4f4;
    border-radius: 40rpx;
    height: 100%;
    padding: 0 20rpx;

    .search-input {
      height: 100%;
      font-size: 28rpx;
      margin-left: 10rpx;
      flex: 1;
    }

    .search-close-btn-container {
      height: 80rpx;
      width: 80rpx;
      justify-content: justify-end;
    }

    .search-close-btn {
      height: 32rpx;
      width: 32rpx;
      background-color: #bcbcbc;
      border-radius: 32rpx;
    }
  }
}
</style>
