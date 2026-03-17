/**
 * 实时对话页面的领域模型定义。
 *
 * 这里集中描述页面层真正关心的数据结构，例如表单字段、运行时状态、
 * 聊天记录以及录音能力契约。把这些类型统一放在一起，可以更清楚地区分
 * 页面模型和底层协议/网络实现之间的边界。
 */

export type ChatRole = 'user' | 'assistant' | 'system'

export type DialogMode = 'text' | 'audio' | 'audio_file'

export type DialogAudioFormat = 'pcm_s16le' | 'pcm'

export interface ChatItem {
  id: string
  role: ChatRole
  text: string
  audioUrl?: string
}

export interface SpeakerOption {
  label: string
  value: string
}

/**
 * 页面可编辑的表单模型。
 *
 * 这些字段共同决定一次新会话的初始化参数，也是用户在连接前可调整的核心配置。
 */
export interface DialogFormModel {
  userInput: string
  botName: string
  systemRole: string
  speakingStyle: string
  recvTimeout: number
  speakerIndex: number
  format: DialogAudioFormat
  showAdvanced: boolean
  dialogMode: DialogMode
  audioFilePath: string
}

/**
 * 页面运行时状态模型。
 *
 * 这组字段主要负责驱动按钮可用性、状态栏文案以及错误提示显示，
 * 不直接参与协议发送。
 */
export interface DialogRuntimeModel {
  isConnecting: boolean
  isReady: boolean
  isSending: boolean
  helloFinished: boolean
  isRecording: boolean
  isSendingFile: boolean
  statusText: string
  errorText: string
}

export interface RecorderPermissionResult {
  granted?: boolean
  ok?: boolean
  message?: string
}

/**
 * 原生录音插件返回的一帧采样数据。
 *
 * 键表示采样点下标，值表示对应采样振幅。后续工具函数会把该结构
 * 转换成标准的 PCM 字节流。
 */
export interface RecorderProcessFrame {
  [sampleIndex: string]: number
}

export type RecorderEventType = 'start' | 'stop' | 'error' | 'process'

export interface RecorderEventPayload {
  event?: RecorderEventType
  message?: string
  buffers?: RecorderProcessFrame[]
  volume?: number
  duration?: number
  sampleRate?: number
}

export interface RecorderStartParams {
  type?: string
  sampleRate?: number
}

export type RecorderCallback<T> = (res: T | string) => void

export interface ShukeRecorderPlugin {
  requestPermission: (cb: RecorderCallback<RecorderPermissionResult>) => void
  startRecord: (params: RecorderStartParams, cb: RecorderCallback<RecorderEventPayload>) => void
  stopRecord: (cb?: RecorderCallback<{ ok?: boolean, message?: string }>) => void
}

export type RecorderBackend = 'native_plugin' | 'uni_recorder'

/**
 * 发送 `StartSession` 前的标准化参数。
 *
 * 页面表单字段更偏向交互表达，这个结构表示已经完成整理、可直接交给协议层使用的结果。
 */
export interface DialogStartSessionPayloadOptions {
  speaker: string
  format: DialogAudioFormat
  botName: string
  systemRole: string
  speakingStyle: string
  recvTimeout: number
  dialogMode: DialogMode
}

export interface UniSocketCloseEvent {
  code?: number
  reason?: string
}
