import { APPID, AccessToken } from '../access'

/**
 * 实时对话（Realtime Dialogue）配置。
 * 注意：
 * - `DIALOG_APP_KEY` 通常与播客 TTS 的 `SecretKey` 不同，请按控制台配置填写。
 * - 当前页面默认跑“文本对话 + 语音播报”模式（适合 App 环境调试）。
 */
export const DIALOG_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
export const DIALOG_ENDPOINT_MP_WX = 'wss://openspeech.bytedance.com/api/v3/realtime/dialogue'
export const DIALOG_RESOURCE_ID = 'volc.speech.dialog'

export const DIALOG_APPID = String(APPID)
export const DIALOG_ACCESS_TOKEN = String(AccessToken)
export const DIALOG_APP_KEY = 'PlgvMymc7f3tQnJ6'

export const DIALOG_SPEAKERS = [
  { label: '中文 VV 女声', value: 'zh_female_vv_jupiter_bigtts' },
  { label: '中文 小荷 女声', value: 'zh_female_xiaohe_jupiter_bigtts' },
  { label: '中文 云舟 男声', value: 'zh_male_yunzhou_jupiter_bigtts' },
  { label: '中文 小天 男声', value: 'zh_male_xiaotian_jupiter_bigtts' },
]
