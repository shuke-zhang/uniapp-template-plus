import {
  DIALOG_ACCESS_TOKEN,
  DIALOG_APPID,
  DIALOG_APP_KEY,
  DIALOG_ENDPOINT,
  DIALOG_ENDPOINT_MP_WX,
  DIALOG_RESOURCE_ID,
  DIALOG_SPEAKERS,
} from '../../access'
import type { SpeakerOption } from '../models/dialog'

/**
 * 实时对话页面使用的服务访问配置。
 *
 * 这里专门管理“服务身份相关”的信息，例如：
 * - websocket 地址
 * - 资源标识
 * - 鉴权凭据
 * - 当前业务页面暴露给用户选择的发音人列表
 *
 * 这些内容与页面展示无关，但会直接影响连接是否成功，因此集中管理更安全。
 */
export const dialogServiceConfig = {
  appId: DIALOG_APPID,
  accessToken: DIALOG_ACCESS_TOKEN,
  appKey: DIALOG_APP_KEY,
  endpoint: DIALOG_ENDPOINT,
  endpointMpWx: DIALOG_ENDPOINT_MP_WX,
  resourceId: DIALOG_RESOURCE_ID,
} as const

/**
 * 页面发音人选择器使用的选项列表。
 *
 * 把后端 speaker id 放在配置层，而不是写死在模板里，
 * 可以让页面模板保持声明式结构，也更方便后续统一替换发音人。
 */
export const dialogSpeakerOptions = DIALOG_SPEAKERS as SpeakerOption[]
