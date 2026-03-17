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
import { dialogAudioConfig, dialogEventCode, dialogServiceConfig, dialogSessionConfig } from '../config/dialog'
import type { DialogStartSessionPayloadOptions, UniSocketCloseEvent } from '../model/dialog'
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

interface ProtocolSocketBinding {
  ws: WebSocket
  detach: () => void
}

/**
 * 火山引擎实时对话协议层辅助函数。
 *
 * 这个旧路径文件只处理协议细节：
 * - 二进制编解码
 * - websocket 握手 header
 * - 协议事件发送
 * - 与 `protocols.ts` 兼容的 socket 创建
 *
 * 它不直接管理页面状态或 UI 引用。
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

export function parsePayloadJson(msg: Message): unknown {
  const bytes = gunzipMaybe(msg.payload, msg.compression)
  if (msg.serialization === SerializationBits.JSON) {
    const text = decodeUtf8(bytes)
    return text ? JSON.parse(text) : {}
  }
  return bytes
}

/**
 * 构建实时对话 websocket 所需的请求头。
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
 * 将这部分映射逻辑集中放在一个函数里，可以避免页面层随着模式和格式变化
 * 出现越来越多的条件分支。
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
 * 当前页面绝大多数业务消息都走 `FullClientRequest + WithEvent + gzip + json`，
 * 但这里仍预留选项参数，以支持原始音频等特殊负载场景。
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
 * 关键约束是保留 `socketInstance.onMessage` 能力，
 * 因为 `ReceiveMessage()` 读取的是底层 `SocketTask` 的原始二进制帧。
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
