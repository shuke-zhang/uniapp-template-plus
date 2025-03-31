<script setup lang="ts">
import { computed } from 'vue'
import { createFormProvider } from './content'

const props = defineProps<{ disabled?: boolean }>()
const disabled = computed(() => props.disabled)
createFormProvider({
  disabled,
})
</script>

<template>
  <form @submit.prevent="undefined">
    <slot />
  </form>
</template>
