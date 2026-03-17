/**
 * 旧目录结构下保留的领域模型定义。
 *
 * 该文件主要用于兼容仍然引用 `../model/dialog` 的旧模块，
 * 避免在目录整理过程中出现类型导入中断。
 */
export type ChatRole = 'user' | 'assistant' | 'system'

/**
 * 页面支持的对话模式。
 */
export type DialogMode = 'text' | 'audio' | 'audio_file'

/**
 * 页面支持的音频格式。
 */
export type DialogAudioFormat = 'pcm_s16le' | 'pcm'

/**
 * 聊天区中的一条消息记录。
 */
export interface ChatItem {
  id: string
  role: ChatRole
  text: string
  audioUrl?: string
}

/**
 * 发音人选项。
 */
export interface SpeakerOption {
  label: string
  value: string
}

/**
 * 页面表单模型。
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

/**
 * 录音权限申请结果。
 */
export interface RecorderPermissionResult {
  granted?: boolean
  ok?: boolean
  message?: string
}

/**
 * 原生录音插件返回的一帧采样数据。
 */
export interface RecorderProcessFrame {
  [sampleIndex: string]: number
}

/**
 * 录音事件类型。
 */
export type RecorderEventType = 'start' | 'stop' | 'error' | 'process'

/**
 * 录音事件统一载荷。
 */
export interface RecorderEventPayload {
  event?: RecorderEventType
  message?: string
  buffers?: RecorderProcessFrame[]
  volume?: number
  duration?: number
  sampleRate?: number
}

/**
 * 启动录音时可传入的参数。
 */
export interface RecorderStartParams {
  type?: string
  sampleRate?: number
}

/**
 * 录音插件回调签名。
 */
export type RecorderCallback<T> = (res: T | string) => void

/**
 * 原生录音插件的最小接口定义。
 */
export interface ShukeRecorderPlugin {
  requestPermission: (cb: RecorderCallback<RecorderPermissionResult>) => void
  startRecord: (params: RecorderStartParams, cb: RecorderCallback<RecorderEventPayload>) => void
  stopRecord: (cb?: RecorderCallback<{ ok?: boolean, message?: string }>) => void
}

/**
 * 录音后端类型。
 */
export type RecorderBackend = 'native_plugin' | 'uni_recorder'

/**
 * 发送 `StartSession` 前的标准化参数。
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

/**
 * WebSocket 关闭事件兼容类型。
 */
export interface UniSocketCloseEvent {
  code?: number
  reason?: string
}
