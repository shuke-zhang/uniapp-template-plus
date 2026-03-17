import { EventType } from '../../../protocols'

/**
 * 火山引擎实时对话协议事件码。
 *
 * 把事件码集中定义在这里有几个目的：
 * 1. 页面层和控制器层不再散落魔法数字。
 * 2. 多个实时对话页面可以复用同一份事件定义。
 * 3. 后端事件码变更时，只需要在一个地方维护映射关系。
 *
 * 其中 `ChatTextQuery`、`ChatRagText` 目前没有直接从 `protocols.ts` 导出，
 * 因此这里保留它们的数值常量，避免调用方自行硬编码。
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
