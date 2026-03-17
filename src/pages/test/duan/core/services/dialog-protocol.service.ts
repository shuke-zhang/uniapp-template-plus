import { gzip, ungzip } from 'pako'
import {
  CompressionBits,
  type EventType,
  type Message,
  MsgType,
  MsgTypeFlagBits,
  SerializationBits,
  createMessage,
  marshalMessage,
} from '../../../protocols'
import { WebSocket } from '@/store/modules/socket/webSocket'
import { dialogEventCode } from '../config/dialog-events'
import { dialogAudioConfig, dialogSessionConfig } from '../config/dialog-runtime'
import { dialogServiceConfig } from '../config/dialog-service'
import type { DialogStartSessionPayloadOptions, UniSocketCloseEvent } from '../models/dialog'
import { decodeUtf8, encodeUtf8, genId, toArrayBuffer } from '../utils/binary'

interface SendDialogEventOptions {
  sessionId?: string
  msgType?: MsgType
  serialization?: SerializationBits
  compression?: CompressionBits
}

interface CreateProtocolSocketOptions {
  endpoint: string
  headers: Record<string, string>
  onLog?: (message: string) => void
}

export interface ProtocolSocketBinding {
  ws: WebSocket
  detach: () => void
}

/**
 * 火山引擎实时对话协议层辅助函数。
 *
 * 这个文件只负责协议相关的底层能力，例如：
 * - 二进制消息的序列化与反序列化
 * - websocket 握手请求头构建
 * - 协议事件发送
 * - 与本地 `protocols.ts` 兼容的 socket 创建
 *
 * 它不负责页面 ref、组件状态或具体交互流程，目的是把协议层和页面层彻底分开。
 */

function encodeJsonPayload(data: Record<string, any>): Uint8Array {
  return encodeUtf8(JSON.stringify(data))
}

function applyCompression(payload: Uint8Array, compression: CompressionBits): Uint8Array {
  if (compression === CompressionBits.Gzip)
    return gzip(payload)
  return payload
}

export function gunzipMaybe(data: Uint8Array, compression: CompressionBits): Uint8Array {
  if (compression === CompressionBits.Gzip)
    return ungzip(data)
  return data
}

/**
 * 根据消息头里的序列化方式和压缩方式解析 payload。
 *
 * 调用方不需要关心当前消息是否经过 gzip，或者最终该按 JSON 还是原始字节处理，
 * 统一从这里拿到解码后的结果即可。
 */
export function parsePayloadJson(msg: Message): unknown {
  const bytes = gunzipMaybe(msg.payload, msg.compression)
  if (msg.serialization === SerializationBits.JSON) {
    const text = decodeUtf8(bytes)
    return text ? JSON.parse(text) : {}
  }
  return bytes
}

/**
 * 构建实时对话 websocket 连接所需的请求头。
 * 这里集中补齐鉴权和资源标识，避免连接逻辑到处拼接 header。
 */
export function createDialogHeaders() {
  return {
    'X-Api-App-Id': dialogServiceConfig.appId,
    'X-Api-App-Key': dialogServiceConfig.appKey,
    'X-Api-Access-Key': dialogServiceConfig.accessToken,
    'X-Api-Resource-Id': dialogServiceConfig.resourceId,
    'X-Api-Connect-Id': genId(),
  }
}

/**
 * 根据当前 uni-app 运行环境选择 socket 地址。
 *
 * 如果是小程序环境并且配置了专用代理地址，则优先使用小程序地址；
 * 否则退回默认 endpoint。
 */
export function resolveDialogSocketEndpoint(runtimeInfo?: Record<string, any>): string {
  const info = runtimeInfo ?? (uni.getSystemInfoSync() as Record<string, any>)
  const uniPlatform = String(info?.uniPlatform || info?.platform || '').toLowerCase()
  if (uniPlatform === 'mp-weixin' && dialogServiceConfig.endpointMpWx)
    return dialogServiceConfig.endpointMpWx
  return dialogServiceConfig.endpoint
}

/**
 * 把页面表单值整理成后端 `StartSession` 所需的 payload。
 *
 * 这里是 UI 配置映射到后端协议字段的唯一入口，
 * 例如发音人、音频格式、超时配置和输入模式都会在这里统一转换。
 */
export function buildStartSessionPayload(options: DialogStartSessionPayloadOptions) {
  return {
    asr: {
      extra: {
        end_smooth_window_ms: dialogSessionConfig.asrEndSmoothWindowMs,
      },
    },
    tts: {
      speaker: options.speaker,
      audio_config: {
        channel: dialogAudioConfig.outputChannels,
        format: options.format,
        sample_rate: dialogAudioConfig.outputSampleRate,
      },
    },
    dialog: {
      bot_name: options.botName.trim() || '助手',
      system_role: options.systemRole.trim(),
      speaking_style: options.speakingStyle.trim(),
      location: {
        city: dialogSessionConfig.defaultLocationCity,
      },
      extra: {
        strict_audit: false,
        audit_response: '支持客户端自定义安全审核回复话术。',
        recv_timeout: Number(options.recvTimeout) || 30,
        input_mod: options.dialogMode === 'audio_file' ? 'audio_file' : options.dialogMode,
      },
    },
  }
}

/**
 * 通过底层 uni-app `SocketTask` 发送原始字节数据。
 *
 * 协议消息本质上是二进制帧，因此不能直接复用高层 JSON 发送辅助方法，
 * 必须从这里直接把 `ArrayBuffer` 写到底层 socket。
 */
export async function sendRawProtocol(ws: WebSocket, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const socketTask = (ws as any).socketInstance as UniNamespace.SocketTask | null
    if (socketTask?.send) {
      socketTask.send({
        data: toArrayBuffer(bytes),
        success: () => resolve(),
        fail: error => reject(error),
      })
      return
    }
    reject(new Error('socketInstance.send is not available'))
  })
}

/**
 * 发送一帧协议事件消息。
 *
 * 当前页面大多数业务消息都会采用：
 * - `FullClientRequest`
 * - `WithEvent`
 * - `gzip`
 * - `json`
 *
 * 这里仍然保留可选参数，是为了兼容少数原始二进制或特殊事件场景。
 */
export async function sendDialogEvent(
  ws: WebSocket,
  event: number,
  payload: Record<string, any>,
  options?: SendDialogEventOptions,
) {
  const compression = options?.compression ?? CompressionBits.Gzip
  const message = createMessage(
    options?.msgType ?? MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  message.event = event as EventType
  message.sessionId = options?.sessionId
  message.serialization = options?.serialization ?? SerializationBits.JSON
  message.compression = compression
  message.payload = applyCompression(encodeJsonPayload(payload), compression)
  await sendRawProtocol(ws, marshalMessage(message))
}

export async function sendChatTextQuery(ws: WebSocket, sessionId: string, content: string) {
  await sendDialogEvent(ws, dialogEventCode.chatTextQuery, { content }, { sessionId })
}

export async function sendSayHello(ws: WebSocket, sessionId: string) {
  await sendDialogEvent(ws, dialogEventCode.sayHello, {
    content: '你好，我是你的语音对话助手，有什么可以帮助你的？',
  }, { sessionId })
}

/**
 * 使用对话协议的二进制传输格式发送一帧音频数据。
 */
export async function sendAudioTaskChunk(
  ws: WebSocket,
  sessionId: string,
  rawAudio: Uint8Array,
) {
  const message = createMessage(MsgType.AudioOnlyClient, MsgTypeFlagBits.WithEvent)
  message.event = dialogEventCode.taskRequest as EventType
  message.sessionId = sessionId
  message.serialization = SerializationBits.Raw
  message.compression = CompressionBits.Gzip
  message.payload = applyCompression(rawAudio, message.compression)
  await sendRawProtocol(ws, marshalMessage(message))
}

/**
 * 创建一个与本地 `protocols.ts` 工具兼容的 socket 实例。
 *
 * 关键点在于保留底层 `socketInstance.onMessage` 能力，
 * 因为 `ReceiveMessage()` 读取的是原始二进制帧，而不是业务层已经解码后的事件对象。
 */
export async function createProtocolSocket(
  options: CreateProtocolSocketOptions,
): Promise<ProtocolSocketBinding> {
  const ws = new WebSocket(options.endpoint)
  const wsEx = ws as any
  const handlers = {
    log: (message: string) => options.onLog?.(`socket: ${message || ''}`),
    open: () => options.onLog?.('socket: open'),
    close: (reason?: string) => options.onLog?.(`socket: close ${reason || ''}`),
    error: (error?: string) => options.onLog?.(`socket: 错误 ${error || ''}`),
  }

  wsEx.on('log', handlers.log)
  wsEx.on('open', handlers.open)
  wsEx.on('close', handlers.close)
  wsEx.on('error', handlers.error)

  wsEx.isCreate = false
  wsEx.isConnect = false
  wsEx.isInitiative = false
  wsEx.socketInstance = uni.connectSocket({
    url: options.endpoint,
    header: {
      'content-type': 'application/json',
      ...options.headers,
    },
    success: () => {
      wsEx.isCreate = true
      ws.emit('connect')
    },
    fail: (error) => {
      const message = JSON.stringify(error)
      if (message.includes('url not in domain list')) {
        ws.emit('error', `当前 Socket 地址未在小程序合法域名列表中：${options.endpoint}`)
      }
      else {
        ws.emit('error', message)
      }
    },
  })

  const socketTask = wsEx.socketInstance as UniNamespace.SocketTask | null
  if (!socketTask) {
    detachSocketListeners(ws, handlers)
    throw new Error('实时对话 socketInstance 创建失败')
  }

  socketTask.onOpen((result) => {
    wsEx.isConnect = true
    ws.emit('open', result)
  })
  socketTask.onClose((event: UniSocketCloseEvent) => {
    wsEx.isConnect = false
    ws.emit('close', event.reason || `close:${event.code ?? ''}`)
  })
  socketTask.onError((error) => {
    wsEx.isConnect = false
    ws.emit('error', JSON.stringify(error))
  })

  await new Promise<void>((resolve, reject) => {
    function cleanupWaiters() {
      ws.off?.('open', onOpen as any)
      ws.off?.('error', onError as any)
    }

    function onOpen() {
      cleanupWaiters()
      resolve()
    }

    function onError(error?: string) {
      cleanupWaiters()
      reject(new Error(error || 'WebSocket 连接失败'))
    }

    ws.on('open', onOpen as any)
    ws.on('error', onError as any)
  })

  return {
    ws,
    detach: () => detachSocketListeners(ws, handlers),
  }
}

function detachSocketListeners(ws: WebSocket, handlers: Record<string, (...args: any[]) => void>) {
  ws.off?.('log', handlers.log as any)
  ws.off?.('open', handlers.open as any)
  ws.off?.('close', handlers.close as any)
  ws.off?.('error', handlers.error as any)
}
