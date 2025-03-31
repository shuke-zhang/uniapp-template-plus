import type { ComputedRef } from 'vue'

import { computed, unref } from 'vue'

/**
 * 同 vue toValue 函数
 * @param value
 */
export function useComputedRef<T>(value: MaybeComputedRef<T>): ComputedRef<T> {
  const computedRef = computed(() => isFunction(value) ? (value as any)() : unref(value))
  return computedRef
}
