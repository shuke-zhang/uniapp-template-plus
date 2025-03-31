<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: 0,
  },
  /** 进度条高度（rpx） */
  height: {
    type: [String, Number],
    default: 20,
  },
  /** 进度条最大值 */
  total: {
    type: [String, Number],
    default: 100,
  },
  /** 进度条颜色 */
  filledColor: {
    type: String,
    default: '#ea3e4a', // 主品牌色
  },
  /** 空状态颜色 */
  emptyColor: {
    type: String,
    default: '#eeeeee',
  },
  /** 是否显示数值 */
  showText: {
    type: Boolean,
    default: true,
  },
  /** 是否显示圆形端点 */
  showCircle: {
    type: Boolean,
    default: true,
  },
  /** 圆形端点大小比例 */
  circleScale: {
    type: Number,
    default: 1.8,
    validator: (val: number) => val >= 1 && val <= 3,
  },
})

const progress = useVModel(props, 'modelValue')
const progressFill = computed(() => {
  // 转换为数值类型
  const current = Number(progress.value)
  const totalVal = Number(props.total)

  // 防御性处理：避免除零错误
  if (totalVal <= 0)
    return '0%'

  // 计算实际百分比（保留两位小数）
  const percentage = (current / totalVal) * 100
  return `${Math.min(Math.max(percentage, 0), 100).toFixed(2)}%`
})

// 计算样式值
const progressHeight = computed(() => getNumericValue(props.height))
/**
 * 圆形端点宽高
 */
const circleSize = computed(() => `calc(${progressHeight.value} * ${props.circleScale})`)
/**
 * 圆形端点左偏移量
 */
const circleLeft = computed(() => {
  return `calc(${progressFill.value} - ${progressHeight.value} * ${props.circleScale} / 2)`
})
</script>

<template>
  <view class="progress-container">
    <view
      class="progress-bar"
      :style="{
        height: progressHeight,
        backgroundColor: emptyColor,
      }"
    >
      <!-- 填充部分 -->
      <view
        class="progress-fill"
        :style="{
          width: `${progressFill}`,
          backgroundColor: filledColor,
        }"
      />

      <!-- 圆形端点 -->
      <view
        v-if="showCircle"
        class="progress-circle"
        :style="{
          left: circleLeft,
          width: circleSize,
          height: circleSize,
          borderColor: filledColor,
        }"
      >
        <view
          class="progress-circle-inner"
          :style="{
            backgroundColor: filledColor,
            width: progressHeight,
            height: progressHeight,
          }"
        />
      </view>
    </view>

    <!-- 进度文本 -->
    <text
      v-if="showText"
      class="progress-text"
      :style="{ color: filledColor }"
    >
      {{ progress }}/{{ total }}
    </text>
  </view>
</template>

<style lang="scss">
.progress-container {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 16rpx;
}

.progress-bar {
  position: relative;
  flex: 1;
  border-radius: 999rpx;
  overflow: visible;
  transition: background-color 0.3s;
}

.progress-fill {
  height: 100%;
  border-radius: 999rpx;
  transition:
    width 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.3s;
}

.progress-circle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  border: 4rpx solid;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: white;
  box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.1);
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.progress-circle-inner {
  border-radius: 50%;
  opacity: 0.8;
}

.progress-text {
  font-size: 28rpx;
  font-weight: 500;
  min-width: 120rpx;
  text-align: right;
  transition: color 0.3s;
}
</style>
