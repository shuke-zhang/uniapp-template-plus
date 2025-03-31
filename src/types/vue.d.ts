import type { ComputedRef, Ref } from 'vue'

declare global{

  export type { PropType } from 'vue'

  export type EmitType = (event: string, ...args: any[]) => void

  export type ElRef<T extends HTMLElement = HTMLDivElement> = T | null

  export type MaybeRef<T> = T | Ref<T>

  export type MaybeComputedRef<T> = MaybeReadonlyRef<T> | MaybeRef<T>

  export type MaybeReadonlyRef<T> = (() => T) | ComputedRef<T>

  export type MaybeRecordRef<T> = {
    [P in keyof T]: MaybeRef<T[P]>;
  }

  export type RecordRef<T> = {
    [P in keyof T]: Ref<T[P]>;
  }
}

export {}
