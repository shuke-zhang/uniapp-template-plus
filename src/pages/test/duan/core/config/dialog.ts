import { EventType } from '../../../protocols'
import {
  DIALOG_ACCESS_TOKEN,
  DIALOG_APPID,
  DIALOG_APP_KEY,
  DIALOG_ENDPOINT,
  DIALOG_ENDPOINT_MP_WX,
  DIALOG_RESOURCE_ID,
  DIALOG_SPEAKERS,
} from '../../access'
import type { DialogFormModel, DialogRuntimeModel, SpeakerOption } from '../model/dialog'

/**
 * 实时对话页面的集中配置入口。
 *
 * 这个旧文件把服务配置、默认表单、运行时默认值和事件码都放在一起，
 * 便于早期版本直接从一个入口引入。敏感信息仍然来自 `access.ts`，
 * 而页面级默认配置则在这里汇总。
 */
export const dialogServiceConfig = {
  appId: DIALOG_APPID,
  accessToken: DIALOG_ACCESS_TOKEN,
  appKey: DIALOG_APP_KEY,
  endpoint: DIALOG_ENDPOINT,
  endpointMpWx: DIALOG_ENDPOINT_MP_WX,
  resourceId: DIALOG_RESOURCE_ID,
} as const

export const dialogSpeakerOptions = DIALOG_SPEAKERS as SpeakerOption[]

export const dialogDefaultFormModel: DialogFormModel = {
  userInput: '你好，先做个自我介绍，然后推荐一个适合今晚的轻松话题。',
  botName: '柚子',
  systemRole: '你使用自然、亲切、简洁的中文女声进行对话，回答尽量清晰、口语化。',
  speakingStyle: '语速适中，语调自然，表达有耐心。',
  recvTimeout: 30,
  speakerIndex: 1,
  format: 'pcm_s16le',
  showAdvanced: false,
  dialogMode: 'text',
  audioFilePath: '',
}

export const dialogDefaultRuntimeModel: DialogRuntimeModel = {
  isConnecting: false,
  isReady: false,
  isSending: false,
  helloFinished: false,
  isRecording: false,
  isSendingFile: false,
  statusText: '未连接',
  errorText: '',
}

/**
 * 火山引擎实时对话协议事件码。
 * 将事件码统一放在这里，可以让页面逻辑和 socket 状态处理保持一致。
 */
export const dialogEventCode = {
  startConnection: EventType.StartConnection,
  finishConnection: EventType.FinishConnection,
  connectionStarted: EventType.ConnectionStarted,
  connectionFinished: EventType.ConnectionFinished,
  startSession: EventType.StartSession,
  finishSession: EventType.FinishSession,
  sessionStarted: EventType.SessionStarted,
  sessionFinished: EventType.SessionFinished,
  sessionFailed: EventType.SessionFailed,
  sayHello: EventType.SayHello,
  ttsSentenceStart: EventType.TTSSentenceStart,
  ttsEnded: EventType.TTSEnded,
  asrInfo: EventType.ASRInfo,
  asrResponse: EventType.ASRResponse,
  asrEnded: EventType.ASREnded,
  taskRequest: EventType.TaskRequest,
  chatTtsText: EventType.ChatTTSText,
  chatTextQuery: 501,
  chatRagText: 502,
  chatResponse: EventType.ChatResponse,
} as const

export const dialogAudioConfig = {
  outputSampleRate: 24000,
  outputChannels: 1,
  flushDelayMs: 650,
} as const

export const dialogRecorderConfig = {
  sampleRate: 16000,
  channels: 1,
  frameSize: 16,
  maxDurationMs: 600000,
  frameWatchTimeoutMs: 3000,
} as const

export const dialogFileStreamConfig = {
  chunkSize: 6400,
  chunkIntervalMs: 200,
} as const

export const dialogLogConfig = {
  maxLines: 120,
} as const

export const dialogSessionConfig = {
  asrEndSmoothWindowMs: 1500,
  helloTimeoutMs: 20000,
  helloPollingIntervalMs: 120,
  defaultLocationCity: '北京',
} as const
