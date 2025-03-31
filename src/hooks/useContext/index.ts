import type { DeepReadonly, InjectionKey, UnwrapNestedRefs } from 'vue'

import { inject, isProxy, provide, reactive, readonly, toRefs } from 'vue'

type ReadOnlyContextWrap<T> = {
  // eslint-disable-next-line ts/no-unsafe-function-type
  [P in keyof T]: T[P] extends Function ? T[P] : DeepReadonly<UnwrapNestedRefs<T[P]>>;
}
/**
 * provide 数据
 * 此函数的提供操作(provide)时是严格的(依赖方得到的数据的只读的)
 *
 * 一般来说，依赖注入和响应式数据配合使用时候，
 * 在我们需要更改数据响应式数据时，在注入方和依赖方都可以改变数据,
 * 见下面例子
 * @example
 * // 注入方
 * const count = ref(0)
 * provide('count', {
 *  count,
 * })
 *
 * // 依赖方  可以这样操作
 * const content = useContext('count');
 * content.count.value++
 *
 * 但是，建议尽可能将任何对响应式状态的变更都保持在供给方组件中。
 * @see https://vuejs.org/guide/components/provide-inject.html#working-with-reactivity
 * @see https://play.vuejs.org/#eNqtU71u2zAQfhWWi2TAlgC3UyAbbYoMLYo0SDpyUWTalkOTBH9cB4K29hU6dS2QvUCBIq/TpK/RI2XJkitnyiTx7r7j3cfvK/AbKaONpfgEJzpTuTRIU2PllPB8LYUyqEBSiU0+o0OkaDoTnN26v/kQGXFJ5xqVaK7EGgXQJWhQb8VaVnGCo9id3C0EE54Jrg1iIktNLjiauF5hcA6gJboQjAYDwgmfW575vJWz1NAPu/JwgArCUQOPNimzFJoEV8LWDQgvWw0U1eY4rHWvh+12DYO6NKj3DOvtw06roTt0h4RQORj4NZK4InW69SdD15JBJbCLUHJtjYEBX2csz24mBLtJCZ66TxJXyapQTmWqKDdRw1quUVHsSSxLlMTuzXq6dmeD/l1g9yb/bDH8J3EzKx5io+HV5vkiWmnBQSqeAYIzqM4ZVR+la6YJPqlodrmUMfH5vY8ZZamnyWOWNLvpia/01sUIvoD9qdqAVpqcSdWCAjUufXZ1Trfw3yTXYmYZVD+RvKRaMFut78pOLZ/B2K06P+07L92cLz7ps62hXNdLuUFdZenrCQYlO6KOrb4f92X0yuNAEMBi7QLntRejEXr4fvf48+7h64/Hb7//3n/5c/8LjUaO+2NGzPmKZubAcLWj9q86PNAjACY7bEvXXp8tn2TLlC8azOmtmzYc+KXcBeAQkN8irPEA/99P4/HYu6gl/B7dy6kTzoGY69NzSDm5Vv0N+naENn3hli/aXij/Ab6e1t0=
 * @param context
 * @param key
 */
export function createProvider<T extends object>(
  context: T,
  key: InjectionKey<T> = Symbol('FormProviderProps'),
) {
  // web环境中直接provide(key, toRefs(readonly(context)) as T);
  // 但是 uniapp 把函数代理为 ref
  // 所以特殊处理 分开 state
  const state = reactive({}) as T
  const handlers = {} as T
  for (const key in context) {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      const element = context[key]
      if (isProxy(element)) {
        state[key] = readonly(element as object) as T[Extract<keyof T, string>]
      }
      else {
        handlers[key] = element
      }
    }
  }
  // toRefs 为了解决 结构时候失去响应式的问题
  provide(key, {
    ...toRefs(state),
    ...handlers,
  } as T)
  // provide(key, toRefs(readonly(context)) as T); // h5
}

export function useContext<T extends object>(
  key: InjectionKey<T> = Symbol('FormProviderProps'),
  defaultValue?: T,
) {
  if (defaultValue)
    return inject<T>(key, defaultValue) as ReadOnlyContextWrap<T>
  return inject<T>(key) as ReadOnlyContextWrap<T>
}
