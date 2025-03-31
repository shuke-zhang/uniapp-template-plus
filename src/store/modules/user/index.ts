import { defineStore } from 'pinia'
import type { UserInfoModel } from '@/model/user'
import type { WxLoginParams } from '@/model/auth'
import { getUserInfo as _getUserInfo, logout as _logout, wxLoginPhone } from '@/api/auth'

export const useUserStore = defineStore('user', () => {
  /**
   * 用户信息
   */
  const userInfo = ref<UserInfoModel | null>(getCacheUserInfo() || null)
  /**
   * 用户id
   */
  const userId = computed(() => userInfo.value?.userId || 0)
  /**
   * token
   */
  const TOKEN = ref<string | null>(null)

  /**
   * 登录
   * @param data
   */
  async function login(data: WxLoginParams) {
    const res = await wxLoginPhone(data)
    logger.info('登录 =>>> 执行')
    console.log(res, '结果')
    setCacheToken(res.token)
    TOKEN.value = res.token
    await getUserInfo()
  }

  /**
   * 获取用户详细信息
   */
  function getUserInfo() {
    return _getUserInfo().then((res) => {
      removeCacheUserInfo()
      userInfo.value = res.user
      setCacheUserInfo(userInfo.value)
    })
  }

  /**
   * 需要调取接口的退出登录
   */
  function logout(toLogin = true) {
    showLoading()
    _logout().then(() => {
      performLogout(toLogin)
    }).catch(() => {
      console.log('退出登录 =>>> 失败', Date.now())
      showToastError('退出登录失败')
    }).finally(() => {
      hideLoading()
    })
  }

  /**
   * 退出登录执行操作
   */
  function performLogout(toLogin = true) {
    logger.info('退出登录 =>>> 执行', Date.now())
    userInfo.value = null
    TOKEN.value = null
    clearCache()
    toLogin && void toAuth()
  }
  return {
    userInfo,
    userId,
    TOKEN,
    login,
    logout,
    getUserInfo,
    performLogout,
  }
})
