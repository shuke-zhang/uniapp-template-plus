import type { MaybeRefOrGetter } from 'vue'

import { computed, reactive, toRaw, toRefs } from 'vue'
import { useComputedRef } from '../useComputedRef'
import { AsyncExecutionManager } from './AsyncExecutionManager'
import type { FormatOptions } from '@/utils'
import { request } from '@/utils/request/index'
import type { DictTypes } from '@/hooks/useDicts/dict'

export interface OriginDictData {
  // value
  id?: string
  dictCode?: number
  dictValue?: string
  // label
  dictLabel?: string
  // name
  dictType?: string
  // other
  cssClass?: string
  listClass?: string
  isDefault?: string
  status?: string

  // other label
  title?: string
  name?: string
  label?: string
  // other value
  value?: string | number
  code?: string | number
  key?: string | number
  //
  remark?: string
}

export interface DictData {
  value: string
  label: string
  raw?: Partial<OriginDictData>
}
export type DictsRecord<DT extends DictTypes> = Record<DT, DictData[]>

interface UseDictsOptions {
  isLazy?: boolean
  labelField?: keyof OriginDictData
  valueField?: keyof OriginDictData
}

type DictsLoadingKey<DT extends DictTypes> = `${DT}_loading`

type DictsLoadingRecord<DT extends DictTypes> = Record<
  DictsLoadingKey<DT>,
  boolean
>

/**
 * 过期时间 60s
 */
const ageing = 60e3

const dictCache = {} as Record<DictTypes, {
  expires: number
  data: OriginDictData[]
}>

function useDictFormatter<DT extends DictTypes = DictTypes>(
  dictsData: DictsRecord<DT>,
) {
  const defaultFormatDictOptions: FormatOptions<DictData> = {
    labelField: 'label',
    valueField: 'value',
  }

  function formatDictSync(
    dictKey: DT,
    value: string | number,
    options: FormatOptions<DictData> & { isRaw: true }
  ): Partial<DictData>
  function formatDictSync(
    dictKey: DT,
    value: [string] | [number],
    options: FormatOptions<DictData> & { isRaw: true }
  ): Partial<DictData>
  function formatDictSync(
    dictKey: DT,
    value: string[] | number[],
    options: FormatOptions<DictData> & { isRaw: true }
  ): Partial<DictData>[]
  function formatDictSync(
    dictKey: DT,
    value: string | string[] | number | number[],
    options?: FormatOptions<DictData>
  ): string
  function formatDictSync(
    dictKey: DT,
    value: string | string[] | number | number[],
    options: FormatOptions<DictData> = {},
  ): string | number | Partial<DictData> | Partial<DictData>[] {
    return toRaw(format<DictData>(dictsData[dictKey], value, {
      ...options,
      ...defaultFormatDictOptions,
    }))
  }

  function formatDictComputed(
    dictKey: DT,
    value: MaybeRefOrGetter<string>,
    options: FormatOptions<DictData> & { isRaw: true }
  ): Partial<DictData>
  function formatDictComputed(
    dictKey: DT,
    value: MaybeRefOrGetter<[string]>,
    options: FormatOptions<DictData> & { isRaw: true }
  ): Partial<DictData>
  function formatDictComputed(
    dictKey: DT,
    value: MaybeRefOrGetter<string[]>,
    options: FormatOptions<DictData> & { isRaw: true }
  ): Partial<DictData>[]
  function formatDictComputed(
    dictKey: DT,
    value: MaybeRefOrGetter<string> | MaybeRefOrGetter<string[]>,
    options?: FormatOptions<DictData>
  ): string
  function formatDictComputed(
    dictKey: DT,
    value: MaybeRefOrGetter<string> | MaybeRefOrGetter<string[]>,
    options: FormatOptions<DictData> = {},
  ): string | Partial<DictData> | Partial<DictData>[] {
    const valueComputedRef: ComputedRef = useComputedRef(value)
    const result = computed(() =>
      format<DictData>(dictsData[dictKey], valueComputedRef.value, {
        ...options,
        ...defaultFormatDictOptions,
      }),
    )
    return result
  }

  return {
    formatDictSync,
    formatDictComputed,
  }
}

const asyncManager = new AsyncExecutionManager()
/**
 * 字典
 * @param dictTypes
 * @param options
 */
export function useDicts<DT extends DictTypes = DictTypes>(
  dictTypes: DT[],
  options: UseDictsOptions = {},
) {
  const {
    labelField = 'dictLabel',
    valueField = 'dictValue',
    isLazy = false,
  } = options

  const dictsData = reactive({}) as DictsRecord<DT>
  const dictsLoading = reactive({}) as DictsLoadingRecord<DT>
  const { formatDictSync, formatDictComputed } = useDictFormatter(dictsData)

  function initializeDict(dt: DT) {
    dictsData[dt] = []
    dictsLoading[`${dt}_loading`] = true
  }

  async function loadDictItem(dt: DT) {
    if (!dt)
      return

    try {
      let res = dictCache[dt] || {}
      const expires = res.expires
      let data = res.data

      if (!expires || expires <= Date.now()) {
        console.log(expires ? `过期${expires}` : '无数据')
        res = await asyncManager.executeAsyncFunction(dt, () => loadDict(dt))
        data = res.data
      }
      else {
        console.log(`未过期${expires}`)
      }

      dictsData[dt] = data.map<DictData>(e => ({
        raw: e,
        label: `${e[labelField]!}`,
        value: `${e[valueField]!}`,
      }))

      if (__DEV__ && !dictsData[dt].length)
        logger.warn(`字典 [${dt}] 获取到的值为空 []`)
    }
    catch (error) {
      console.error(`Error loading dict: ${dt}`, error)
    }
    finally {
      dictsLoading[`${dt}_loading`] = false
    }
  }

  function loadDictData(maybeDictTypeList: DT | DT[]) {
    const dicts = Array.isArray(maybeDictTypeList)
      ? maybeDictTypeList
      : [maybeDictTypeList]
    return Promise.all(dicts.map(e => loadDictItem(e)))
  }

  function init() {
    dictTypes.forEach(initializeDict)
    if (!isLazy)
      getDictData()
  }

  function getDictData() {
    return loadDictData(dictTypes)
  }

  init()

  return {
    dictsData,
    dictsLoading,
    ...toRefs(dictsLoading),
    ...toRefs(dictsData),
    formatDictSync,
    formatDictComputed,
    getDictData,
  }
}

function loadDict(dictType: DictTypes) {
  return request.get<{ data: OriginDictData[] }>({
    url: `/system/dict/data/type/${dictType}`,
    withToken: false,
  }).then((res) => {
    dictCache[dictType] = {
      expires: Date.now() + ageing,
      data: res.data,
    }
    console.log(new Date(dictCache[dictType].expires))
    return dictCache[dictType]
  }).finally(() => {
    console.log('接口调用')
  })
}
