import type { Ref } from 'vue'

import { unref } from 'vue'
import { showToastError } from '../ui/index'
import { isFunction } from '../helpers/index'
import { validateIdCard, validatePhone } from './validate'
import { ValidateError } from './ValidateError'

export * from './validate'

export const isValidateError = ValidateError.isValidateError

type ValidateValue<T = any> = T | Ref<T> | (() => T)
type ValidateType = 'phone' | 'idCard'
type ValidateRule<T = any> =
  | ((val: T) => string | boolean | Promise<string | boolean>)
  | ValidateType
type ValidateRules<T = any> = Arrayable<ValidateRule<T>>

function getValidateRuleHandler<T>(rule: ValidateRule<T>) {
  if (rule === 'phone') {
    return (value: any) => {
      if (!value)
        return '手机号不能为空'
      return validatePhone(value) || '手机号不正确'
    }
  }
  if (rule === 'idCard') {
    return (value: any) => {
      if (!value)
        return '身份证号不能为空'
      return validateIdCard(value) || '身份证号不正确'
    }
  }
  return rule
}

export async function validateField<T = any>(
  value: ValidateValue<T>,
  maybeRules: ValidateRules<T>,
  errorMsg = false,
) {
  const rules = Array.isArray(maybeRules) ? maybeRules : [maybeRules]
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    const _value = isFunction(value) ? value() : unref(value)
    const validateRuleHandler = getValidateRuleHandler(rule)
    const res = await validateRuleHandler(_value)
    if (typeof res == 'string' && res.length) {
      errorMsg && showToastError(res)
      const error = new ValidateError(res)
      return Promise.reject(error)
    }
  }
}

interface ExtractValueAndRules<T> {
  value: ValidateValue<T>
  rules: ValidateRules<T>
}

type E<T> = ExtractValueAndRules<T>
/**
 * 校验函数
 * 为了类型正确 暂时搞50个元组
 * @param validateList
 */
export async function validate<T1, T2, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25, T26, T27, T28, T29, T30, T31, T32, T33, T34, T35, T36, T37, T38, T39, T40, T41, T42, T43, T44, T45, T46, T47, T48, T49, T50>(
  validateList: [
    E<T1>?,
E<T2>?,
E<T3>?,
E<T4>?,
E<T5>?,
E<T6>?,
E<T7>?,
E<T8>?,
E<T9>?,
E<T10>?,
E<T11>?,
E<T12>?,
E<T13>?,
E<T14>?,
E<T15>?,
E<T16>?,
E<T17>?,
E<T18>?,
E<T19>?,
E<T20>?,
E<T21>?,
E<T22>?,
E<T23>?,
E<T24>?,
E<T25>?,
E<T26>?,
E<T27>?,
E<T28>?,
E<T29>?,
E<T30>?,
E<T31>?,
E<T32>?,
E<T33>?,
E<T34>?,
E<T35>?,
E<T36>?,
E<T37>?,
E<T38>?,
E<T39>?,
E<T40>?,
E<T41>?,
E<T42>?,
E<T43>?,
E<T44>?,
E<T45>?,
E<T46>?,
E<T47>?,
E<T48>?,
E<T49>?,
E<T50>?,
  ],
  errorMsg = true,
) {
  for (let index = 0; index < validateList.length; index++) {
    const { rules, value } = validateList[index]!
    await validateField(value as any, rules as any, errorMsg)
  }
}
