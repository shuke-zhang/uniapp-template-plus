import type { WxLoginParams } from '@/model/auth'
import type { UserInfoModel } from '@/model/user'
import { request } from '@/utils/request/index'
// 获取验证码
export function getCodeImg() {
  return request.get<{ img: string, uuid: string }>({
    url: '/prod-api/captchaImage',
    withToken: false,
  })
}

// 登录方法
export function wxLoginPhone(data: WxLoginParams) {
  return request.post<ResponseResult & { token: string }>(
    {
      url: '/prod-api/login',
      data,
      withToken: false,

    },
  )
}

export function getUserInfo() {
  return request.get<ResponseResult & {
    permissions: string[]
    roles: string[]
    user: UserInfoModel
  }>(
    {
      url: '/prod-api/getInfo',

    },
  )
}

export function logout() {
  return request.post<ResponseResult>({ url: '/prod-api/logout' })
}
