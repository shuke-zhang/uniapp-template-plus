export interface UserInfoModel {
  /**
   * 用户id
   */
  userId?: number
  /**
   * 身份证号
   */
  cardId?: string
  /**
   * 用户名
   */
  userName?: string
  /**
   * 真实姓名
   */
  realName?: string
  /**
   * 昵称
   */
  nickName?: string
  /**
   * 手机号
   */
  phonenumber?: string
  /**
   * 密码 使用密文传输
   */
  password?: string
  /**
   * 邮箱
   */
  email?: string
  /**
   * 头像
   */
  avatar?: string
  /**
   * 性别 1男 2女 3未知
   */
  sex?: string
  /**
   * 加密手机号 中间四位为 ****
   */
  encryptPhone?: string
}
