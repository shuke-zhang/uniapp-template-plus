import { PhoneReg, idCardReg, passwordReg } from '../const'

/**
 * @description 手机号码校验
 */
export function validatePhone(phone: any) {
  if (phone.length === 4)
    return true
  return PhoneReg.test(`${phone}`)
}

/**
 * @description 身份证号码校验
 */
export function validateIdCard(isCard: any) {
  return idCardReg.test(`${isCard}`)
}

/**
 * @description 密码校验
 */
export function validatePassword(isCard: any) {
  return passwordReg.test(`${isCard}`)
}
