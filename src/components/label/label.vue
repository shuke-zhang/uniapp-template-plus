<script  lang="ts">
import type { CSSProperties, PropType } from 'vue'

import { defineComponent } from 'vue'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
defineProps({
  required: {
    type: Boolean,
    default: false,
  },
  labelStyle: {
    type: Object as PropType<CSSProperties>,
  },
  disabled: createBooleanProp(false),
  /**
   * 选填
   */
  optional: createBooleanProp(false),
})
</script>

<template>
  <view>
    <text
      class="kc-label"
      :class="{ required, 'kc-label-disabled': disabled }"
      :style="labelStyle"
    >
      <slot />
    </text>
    <text :class="{ optional }">
      {{ optional ? '(选填)' : '' }}
    </text>
  </view>
</template>

<style lang="scss">
.kc-label {
  word-wrap: nowrap;
  color: #555555;
  line-height: normal;
}

.required::before {
  content: '*';
  color: red;
  margin-right: 10rpx;
}
.optional {
  color: $black_3;
  font-size: $size_small;
}
.kc-label-disabled {
  color: $black_3 !important;
}
</style>
