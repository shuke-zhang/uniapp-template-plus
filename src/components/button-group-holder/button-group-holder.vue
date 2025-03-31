<script lang="ts">
import { defineComponent } from 'vue'
import { BUTTON_GROUP_HEIGHT } from '../bottom-button-group/bottom-button-group'

export default defineComponent({
  options: {
    virtualHost: true,
  },
  setup() {
    return {
      PADDING_BOTTOM: BUTTON_GROUP_HEIGHT,
    }
  },
})
</script>

<template>
  <view
    class="w-full"
    :style="{ paddingBottom: `${PADDING_BOTTOM}px` }"
  />
</template>
