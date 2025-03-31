<script lang="ts">
import type { InputType } from '@uni-helper/uni-app-types'
import type { CSSProperties } from 'vue'

import { computed, defineComponent, unref } from 'vue'
import { useFormContext } from '../form/content'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
const props = defineProps({
  modelValue: {
    type: [String, Number],
    default: '',
  },
  type: createStringProp<InputType>('text'),
  textAlign: createStringProp<'left' | 'center' | 'right'>('right'),
  placeholder: createStringProp(''),
  readonly: createBooleanProp(false),
  disabled: createBooleanProp(false),
  inputStyle: {
    type: Object as PropType<CSSProperties>,
  },
  maxlength: createStringProp('140'),
})

const value = useVModel(props, 'modelValue')
const formContent = useFormContext()
const disabled = computed(() => {
  return props.disabled || unref(formContent?.disabled)
})
const maxlength = computed(() => {
  return props.maxlength ? Number(props.maxlength) : 140
})
</script>

<template>
  <input
    v-model="value"
    :type="type"
    class="c-form-input "
    :class="{ 'form-input-disabled': disabled }"
    placeholder-class="form-input-placeholder"
    :placeholder="placeholder"
    :readonly="readonly"
    :disabled="disabled"
    :style="[
      {
        'text-align': textAlign,
      },
      inputStyle,
    ]"
    :maxlength="maxlength"
  >
</template>

<style lang="scss">
.c-form-input {
  height: 100%;
  border: none;
  font-size: $size-default;
  color: $black-2;
  font-family: AlibabaPuHuiTi-Regular;
}

.form-input-disabled {
  color: $black-3;
}

.form-input-placeholder {
  color: $black-3;
  font-size: $size-default;
  font-family: AlibabaPuHuiTi-Regular;
}
</style>
