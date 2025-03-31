import type { ComputedRef, InjectionKey } from 'vue'
import { createProvider, useContext } from '@/hooks/useContext'

export interface FormProviderProps {
  disabled?: ComputedRef<boolean>
}

const key: InjectionKey<FormProviderProps> = Symbol('FormProviderProps')

export function createFormProvider(context: FormProviderProps) {
  return createProvider<FormProviderProps>(context, key)
}

export function useFormContext() {
  return useContext<FormProviderProps>(key)
}
