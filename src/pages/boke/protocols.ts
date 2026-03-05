import type { WebSocket } from '@/store/modules/socket/webSocket'

/**
 * 协议层内部使用的 Socket 适配类型。
 *
 * 基础类型直接使用你项目中的 `@/store/modules/socket/webSocket` 导出的 `WebSocket`，
 * 再额外声明若干“可能存在”的事件/发送方法，便于兼容不同运行环境或底层封装差异。
 *
 * 注意：这不会修改你的 `WebSocket` 类实现，只是协议文件内部的类型补充。
 */
type ProtocolSocket = WebSocket & {
  send?: (data: Uint8Array | ArrayBuffer, callback?: (error?: Error) => void) => void
  sendMessage?: (
    data: Uint8Array | ArrayBuffer | Record<string, unknown>,
    callback?: (error?: Error) => void,
  ) => Promise<unknown> | void
  on?: (event: string, handler: (...args: any[]) => void) => void
  once?: (event: string, handler: (...args: any[]) => void) => void
  removeListener?: (event: string, handler: (...args: any[]) => void) => void
  off?: (event: string, handler: (...args: any[]) => void) => void
  socketInstance?: {
    send?: (options: {
      data: string | ArrayBuffer
      success?: () => void
      fail?: (error: unknown) => void
    }) => void
    onMessage?: (callback: (res: { data: unknown }) => void) => void
  } | null
}

/**
 * 获取运行时全局 Buffer（若当前环境不提供则返回 `undefined`）。
 *
 * App / uni-app 环境通常没有 `node:buffer` 模块，因此不能静态导入。
 */
function getRuntimeBuffer():
  | {
    from: (value: string, encoding?: string) => Uint8Array
    isBuffer: (value: unknown) => boolean
  }
  | undefined {
  const runtime = (globalThis as unknown as { Buffer?: any }).Buffer
  if (!runtime)
    return undefined
  if (typeof runtime.from !== 'function' || typeof runtime.isBuffer !== 'function')
    return undefined
  return runtime
}

/**
 * 将字符串编码为 UTF-8 字节。
 *
 * 优先使用运行时 `Buffer.from(str, 'utf8')`，无 Buffer 时使用纯 JS UTF-8 编码。
 *
 * @param value - 待编码文本。
 * @returns UTF-8 字节数组。
 */
function encodeUtf8(value: string): Uint8Array {
  const runtimeBuffer = getRuntimeBuffer()
  if (runtimeBuffer) {
    return new Uint8Array(runtimeBuffer.from(value, 'utf8'))
  }

  const bytes: number[] = []
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)

    if (code < 0x80) {
      bytes.push(code)
    }
    else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6))
      bytes.push(0x80 | (code & 0x3F))
    }
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        const point = ((code - 0xD800) << 10) + (next - 0xDC00) + 0x10000
        bytes.push(0xF0 | (point >> 18))
        bytes.push(0x80 | ((point >> 12) & 0x3F))
        bytes.push(0x80 | ((point >> 6) & 0x3F))
        bytes.push(0x80 | (point & 0x3F))
        i++
      }
      else {
        bytes.push(0xE0 | (code >> 12))
        bytes.push(0x80 | ((code >> 6) & 0x3F))
        bytes.push(0x80 | (code & 0x3F))
      }
    }
    else {
      bytes.push(0xE0 | (code >> 12))
      bytes.push(0x80 | ((code >> 6) & 0x3F))
      bytes.push(0x80 | (code & 0x3F))
    }
  }

  return new Uint8Array(bytes)
}

/**
 * 将 UTF-8 字节解码为字符串。
 *
 * 使用纯 JS UTF-8 解码（避免依赖 `TextDecoder`）。
 *
 * @param bytes - 待解码字节数组。
 * @returns 解码后的字符串。
 */
function decodeUtf8(bytes: Uint8Array): string {
  let result = ''
  let i = 0
  while (i < bytes.length) {
    const b1 = bytes[i++]

    if (b1 < 0x80) {
      result += String.fromCharCode(b1)
      continue
    }

    if (b1 < 0xE0) {
      const b2 = bytes[i++] & 0x3F
      result += String.fromCharCode(((b1 & 0x1F) << 6) | b2)
      continue
    }

    if (b1 < 0xF0) {
      const b2 = bytes[i++] & 0x3F
      const b3 = bytes[i++] & 0x3F
      result += String.fromCharCode(((b1 & 0x0F) << 12) | (b2 << 6) | b3)
      continue
    }

    const b2 = bytes[i++] & 0x3F
    const b3 = bytes[i++] & 0x3F
    const b4 = bytes[i++] & 0x3F
    const point = ((b1 & 0x07) << 18) | (b2 << 12) | (b3 << 6) | b4
    const cp = point - 0x10000
    result += String.fromCharCode((cp >> 10) + 0xD800, (cp & 0x3FF) + 0xDC00)
  }

  return result
}

/**
 * 协议事件类型枚举（与后端约定的事件编号保持一致）。
 *
 * 这些值会写入消息体中的 `event` 字段，用于标识当前消息属于哪类业务流程事件。
 */
export enum EventType {
  // 默认事件：当消息不需要事件语义时使用
  None = 0,

  // 连接阶段事件（1-99）
  StartConnection = 1,
  // StartTask = 1（历史别名/保留注释）
  FinishConnection = 2,
  // FinishTask = 2（历史别名/保留注释）
  ConnectionStarted = 50,
  // TaskStarted = 50（历史别名/保留注释）
  ConnectionFailed = 51,
  // TaskFailed = 51（历史别名/保留注释）
  ConnectionFinished = 52,
  // TaskFinished = 52（历史别名/保留注释）

  // 会话阶段事件（100-199）
  StartSession = 100,
  CancelSession = 101,
  FinishSession = 102,
  SessionStarted = 150,
  SessionCanceled = 151,
  SessionFinished = 152,
  SessionFailed = 153,
  UsageResponse = 154,
  // ChargeData = 154（历史别名/保留注释）

  // 通用业务事件（200-299）
  TaskRequest = 200,
  UpdateConfig = 201,
  AudioMuted = 250,

  // TTS 事件（300-399）
  SayHello = 300,
  TTSSentenceStart = 350,
  TTSSentenceEnd = 351,
  TTSResponse = 352,
  TTSEnded = 359,
  PodcastRoundStart = 360,
  PodcastRoundResponse = 361,
  PodcastRoundEnd = 362,
  PodcastEnd = 363,

  // ASR 事件（450-499）
  ASRInfo = 450,
  ASRResponse = 451,
  ASREnded = 459,

  // 对话事件（500-599）
  ChatTTSText = 500,
  ChatResponse = 550,
  ChatEnded = 559,

  // 字幕事件（650-699）
  SourceSubtitleStart = 650,
  SourceSubtitleResponse = 651,
  SourceSubtitleEnd = 652,
  TranslationSubtitleStart = 653,
  TranslationSubtitleResponse = 654,
  TranslationSubtitleEnd = 655,
}

/**
 * 协议消息类型枚举（消息头 `type` 字段）。
 *
 * 不同类型决定消息体中后续字段布局，例如是否包含 `sequence`、`errorCode` 等。
 */
export enum MsgType {
  Invalid = 0,
  FullClientRequest = 0b1,
  AudioOnlyClient = 0b10,
  FullServerResponse = 0b1001,
  AudioOnlyServer = 0b1011,
  FrontEndResultServer = 0b1100,
  Error = 0b1111,
}

/** 服务端 ACK 使用的消息类型别名。 */
export const MsgTypeServerACK = MsgType.AudioOnlyServer

/**
 * 消息标志位枚举（消息头 `flag` 字段）。
 *
 * 当前协议实现中该字段按“模式值”使用，而不是任意位组合。
 */
export enum MsgTypeFlagBits {
  NoSeq = 0,
  PositiveSeq = 0b1,
  LastNoSeq = 0b10,
  NegativeSeq = 0b11,
  WithEvent = 0b100,
}

/** 协议版本号枚举（写入消息头高 4 bit）。 */
export enum VersionBits {
  Version1 = 1,
  Version2 = 2,
  Version3 = 3,
  Version4 = 4,
}

export enum HeaderSizeBits {
  HeaderSize4 = 1,
  HeaderSize8 = 2,
  HeaderSize12 = 3,
  HeaderSize16 = 4,
}

export enum SerializationBits {
  Raw = 0,
  JSON = 0b1,
  Thrift = 0b11,
  Custom = 0b1111,
}

export enum CompressionBits {
  None = 0,
  Gzip = 0b1,
  Custom = 0b1111,
}

/**
 * 协议消息结构定义。
 *
 * 该接口表示“已解析后的消息对象”或“待序列化的消息对象”。
 * 某些字段是否需要出现，取决于 `type`、`flag`、`event` 的组合。
 */
export interface Message {
  version: VersionBits
  headerSize: HeaderSizeBits
  type: MsgType
  flag: MsgTypeFlagBits
  serialization: SerializationBits
  compression: CompressionBits
  event?: EventType
  sessionId?: string
  connectId?: string
  sequence?: number
  errorCode?: number
  payload: Uint8Array
}

export function getEventTypeName(eventType: EventType): string {
  return EventType[eventType] || `invalid event type: ${eventType}`
}

export function getMsgTypeName(msgType: MsgType): string {
  return MsgType[msgType] || `invalid message type: ${msgType}`
}

/**
 * 将协议消息格式化为便于调试查看的字符串。
 *
 * 说明：
 * - 音频类消息默认输出 `PayloadSize`，避免二进制数据污染日志。
 * - 文本类消息会尝试将 `payload` 按 UTF-8 解码输出。
 *
 * @param msg - 协议消息对象。
 * @returns 单行调试字符串。
 */
export function messageToString(msg: Message): string {
  const eventStr
    = msg.event !== undefined ? getEventTypeName(msg.event) : 'NoEvent'
  const typeStr = getMsgTypeName(msg.type)

  switch (msg.type) {
    case MsgType.AudioOnlyServer:
    case MsgType.AudioOnlyClient:
      if (
        msg.flag === MsgTypeFlagBits.PositiveSeq
        || msg.flag === MsgTypeFlagBits.NegativeSeq
      ) {
        return `MsgType: ${typeStr}, EventType: ${eventStr}, Sequence: ${msg.sequence}, PayloadSize: ${msg.payload.length}`
      }
      return `MsgType: ${typeStr}, EventType: ${eventStr}, PayloadSize: ${msg.payload.length}`

    case MsgType.Error:
      return `MsgType: ${typeStr}, EventType: ${eventStr}, ErrorCode: ${msg.errorCode}, Payload: ${decodeUtf8(msg.payload)}`

    default:
      if (
        msg.flag === MsgTypeFlagBits.PositiveSeq
        || msg.flag === MsgTypeFlagBits.NegativeSeq
      ) {
        return `MsgType: ${typeStr}, EventType: ${eventStr}, Sequence: ${msg.sequence}, Payload: ${decodeUtf8(msg.payload)}`
      }

      return `MsgType: ${typeStr}, EventType: ${eventStr}, Payload: ${decodeUtf8(msg.payload)}`
  }
}

// 为了给 Message 增加便于调试的 toString 能力，这里在创建时动态挂载方法
export function createMessage(
  msgType: MsgType,
  flag: MsgTypeFlagBits,
): Message {
  const msg = {
    type: msgType,
    flag,
    version: VersionBits.Version1,
    headerSize: HeaderSizeBits.HeaderSize4,
    serialization: SerializationBits.JSON,
    compression: CompressionBits.None,
    payload: new Uint8Array(0),
  }

  // 使用不可枚举属性挂载 toString，避免影响序列化
  Object.defineProperty(msg, 'toString', {
    enumerable: false,
    configurable: true,
    writable: true,
    value() {
      return messageToString(this)
    },
  })

  return msg as Message
}

/**
 * 将 `Message` 序列化为协议二进制数据。
 *
 * 编码顺序必须与 `unmarshalMessage()` 的读取顺序严格一致。
 *
 * @param msg - 待编码的协议消息。
 * @returns 可直接发送的二进制字节流。
 */
export function marshalMessage(msg: Message): Uint8Array {
  const buffers: Uint8Array[] = []

  // 构建基础消息头
  const headerSize = 4 * msg.headerSize
  const header = new Uint8Array(headerSize)

  header[0] = (msg.version << 4) | msg.headerSize
  header[1] = (msg.type << 4) | msg.flag
  header[2] = (msg.serialization << 4) | msg.compression

  buffers.push(header)

  // 根据消息类型与标志位写入后续字段
  const writers = getWriters(msg)
  for (const writer of writers) {
    const data = writer(msg)
    if (data)
      buffers.push(data)
  }

  // 合并所有分段缓冲区
  const totalLength = buffers.reduce((sum, buf) => sum + buf.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.length
  }

  return result
}

/**
 * 将协议二进制数据反序列化为 `Message`。
 *
 * 该函数只处理协议层拆包，不负责自动解析业务 payload（如 JSON）。
 *
 * @param data - 原始二进制消息数据。
 * @returns 解析后的协议消息对象。
 */
export function unmarshalMessage(data: Uint8Array): Message {
  if (data.length < 3) {
    throw new Error(
      `data too short: expected at least 3 bytes, got ${data.length}`,
    )
  }

  let offset = 0

  // 读取基础消息头
  const versionAndHeaderSize = data[offset++]
  const typeAndFlag = data[offset++]
  const serializationAndCompression = data[offset++]

  const msg = {
    version: (versionAndHeaderSize >> 4) as VersionBits,
    headerSize: (versionAndHeaderSize & 0b00001111) as HeaderSizeBits,
    type: (typeAndFlag >> 4) as MsgType,
    flag: (typeAndFlag & 0b00001111) as MsgTypeFlagBits,
    serialization: (serializationAndCompression >> 4) as SerializationBits,
    compression: (serializationAndCompression & 0b00001111) as CompressionBits,
    payload: new Uint8Array(0),
  }

  Object.defineProperty(msg, 'toString', {
    enumerable: false,
    configurable: true,
    writable: true,
    value() {
      return messageToString(this)
    },
  })

  // 跳过剩余头部字节
  offset = 4 * msg.headerSize

  // 根据消息类型与标志位读取字段
  const readers = getReaders(msg as Message)
  for (const reader of readers) {
    offset = reader(msg as Message, data, offset)
  }

  return msg as Message
}

// 序列化/反序列化内部辅助函数
function getWriters(msg: Message): Array<(msg: Message) => Uint8Array | null> {
  const writers: Array<(msg: Message) => Uint8Array | null> = []

  if (msg.flag === MsgTypeFlagBits.WithEvent) {
    writers.push(writeEvent, writeSessionId)
  }

  switch (msg.type) {
    case MsgType.AudioOnlyClient:
    case MsgType.AudioOnlyServer:
    case MsgType.FrontEndResultServer:
    case MsgType.FullClientRequest:
    case MsgType.FullServerResponse:
      if (
        msg.flag === MsgTypeFlagBits.PositiveSeq
        || msg.flag === MsgTypeFlagBits.NegativeSeq
      ) {
        writers.push(writeSequence)
      }
      break
    case MsgType.Error:
      writers.push(writeErrorCode)
      break
    default:
      throw new Error(`unsupported message type: ${msg.type}`)
  }

  writers.push(writePayload)
  return writers
}

function getReaders(
  msg: Message,
): Array<(msg: Message, data: Uint8Array, offset: number) => number> {
  const readers: Array<
    (msg: Message, data: Uint8Array, offset: number) => number
  > = []

  switch (msg.type) {
    case MsgType.AudioOnlyClient:
    case MsgType.AudioOnlyServer:
    case MsgType.FrontEndResultServer:
    case MsgType.FullClientRequest:
    case MsgType.FullServerResponse:
      if (
        msg.flag === MsgTypeFlagBits.PositiveSeq
        || msg.flag === MsgTypeFlagBits.NegativeSeq
      ) {
        readers.push(readSequence)
      }
      break
    case MsgType.Error:
      readers.push(readErrorCode)
      break
    default:
      throw new Error(`unsupported message type: ${msg.type}`)
  }

  if (msg.flag === MsgTypeFlagBits.WithEvent) {
    readers.push(readEvent, readSessionId, readConnectId)
  }

  readers.push(readPayload)
  return readers
}

// 写入函数
function writeEvent(msg: Message): Uint8Array | null {
  if (msg.event === undefined)
    return null
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setInt32(0, msg.event, false)
  return new Uint8Array(buffer)
}

function writeSessionId(msg: Message): Uint8Array | null {
  if (msg.event === undefined)
    return null

  switch (msg.event) {
    case EventType.StartConnection:
    case EventType.FinishConnection:
    case EventType.ConnectionStarted:
    case EventType.ConnectionFailed:
      return null
  }

  const sessionId = msg.sessionId || ''
  const sessionIdBytes = encodeUtf8(sessionId)
  const sizeBuffer = new ArrayBuffer(4)
  const sizeView = new DataView(sizeBuffer)
  sizeView.setUint32(0, sessionIdBytes.length, false)

  const result = new Uint8Array(4 + sessionIdBytes.length)
  result.set(new Uint8Array(sizeBuffer), 0)
  result.set(sessionIdBytes, 4)

  return result
}

function writeSequence(msg: Message): Uint8Array | null {
  if (msg.sequence === undefined)
    return null
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setInt32(0, msg.sequence, false)
  return new Uint8Array(buffer)
}

function writeErrorCode(msg: Message): Uint8Array | null {
  if (msg.errorCode === undefined)
    return null
  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)
  view.setUint32(0, msg.errorCode, false)
  return new Uint8Array(buffer)
}

function writePayload(msg: Message): Uint8Array | null {
  const payloadSize = msg.payload.length
  const sizeBuffer = new ArrayBuffer(4)
  const sizeView = new DataView(sizeBuffer)
  sizeView.setUint32(0, payloadSize, false)

  const result = new Uint8Array(4 + payloadSize)
  result.set(new Uint8Array(sizeBuffer), 0)
  result.set(msg.payload, 4)

  return result
}

// 读取函数
function readEvent(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for event')
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4)
  msg.event = view.getInt32(0, false)
  return offset + 4
}

function readSessionId(msg: Message, data: Uint8Array, offset: number): number {
  if (msg.event === undefined)
    return offset

  switch (msg.event) {
    case EventType.StartConnection:
    case EventType.FinishConnection:
    case EventType.ConnectionStarted:
    case EventType.ConnectionFailed:
    case EventType.ConnectionFinished:
      return offset
  }

  if (offset + 4 > data.length) {
    throw new Error('insufficient data for session ID size')
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4)
  const size = view.getUint32(0, false)
  offset += 4

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for session ID')
    }
    msg.sessionId = decodeUtf8(data.slice(offset, offset + size))
    offset += size
  }

  return offset
}

function readConnectId(msg: Message, data: Uint8Array, offset: number): number {
  if (msg.event === undefined)
    return offset

  switch (msg.event) {
    case EventType.ConnectionStarted:
    case EventType.ConnectionFailed:
    case EventType.ConnectionFinished:
      break
    default:
      return offset
  }

  if (offset + 4 > data.length) {
    throw new Error('insufficient data for connect ID size')
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4)
  const size = view.getUint32(0, false)
  offset += 4

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for connect ID')
    }
    msg.connectId = decodeUtf8(data.slice(offset, offset + size))
    offset += size
  }

  return offset
}

function readSequence(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for sequence')
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4)
  msg.sequence = view.getInt32(0, false)
  return offset + 4
}

function readErrorCode(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for error code')
  }
  const view = new DataView(data.buffer, data.byteOffset + offset, 4)
  msg.errorCode = view.getUint32(0, false)
  return offset + 4
}

function readPayload(msg: Message, data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error('insufficient data for payload size')
  }

  const view = new DataView(data.buffer, data.byteOffset + offset, 4)
  const size = view.getUint32(0, false)
  offset += 4

  if (size > 0) {
    if (offset + size > data.length) {
      throw new Error('insufficient data for payload')
    }
    msg.payload = data.slice(offset, offset + size)
    offset += size
  }

  return offset
}

const messageQueues = new Map<WebSocket, Message[]>()
const messageCallbacks = new Map<WebSocket, ((msg: Message) => void)[]>()

/**
 * 将 socket 消息事件参数归一化为 `Uint8Array`。
 *
 * 兼容输入：
 * - `Uint8Array`
 * - `ArrayBuffer`
 * - `Buffer`（在 Node 环境中）
 * - `{ data: ... }`（uni-app / 浏览器风格 message event）
 *
 * @param raw - `message` 事件回调收到的原始参数。
 * @returns 可用于协议反序列化的二进制字节数组。
 * @throws 当消息不是可识别的二进制类型时抛出异常。
 */
function normalizeSocketMessageData(raw: unknown): Uint8Array {
  const candidate
    = raw && typeof raw === 'object' && 'data' in (raw as Record<string, unknown>)
      ? (raw as { data?: unknown }).data
      : raw

  const runtimeBuffer = getRuntimeBuffer()
  if (runtimeBuffer?.isBuffer(candidate)) {
    return new Uint8Array(candidate as Uint8Array)
  }

  if (candidate instanceof Uint8Array) {
    return candidate
  }

  if (candidate instanceof ArrayBuffer) {
    return new Uint8Array(candidate)
  }

  if (typeof candidate === 'string') {
    return encodeUtf8(candidate)
  }

  throw new TypeError(`Unexpected WebSocket message type: ${typeof candidate}`)
}

/**
 * 为 socket 注册事件监听。
 *
 * @param ws - socket 实例。
 * @param event - 事件名。
 * @param handler - 事件处理函数。
 * @throws 当 socket 不支持 `on` 时抛出异常。
 */
function addSocketListener(
  ws: WebSocket,
  event: string,
  handler: (...args: any[]) => void,
): void {
  const socket = ws as ProtocolSocket
  if (!socket.on) {
    throw new Error('socket.on is not available')
  }
  socket.on(event, handler)
}

/**
 * 为 socket 注册一次性事件监听；若不支持 `once`，则退化为 `on + 手动移除`。
 *
 * @param ws - socket 实例。
 * @param event - 事件名。
 * @param handler - 事件处理函数。
 */
function addSocketOnce(
  ws: WebSocket,
  event: string,
  handler: (...args: any[]) => void,
): void {
  const socket = ws as ProtocolSocket
  if (socket.once) {
    socket.once(event, handler)
    return
  }

  const wrapper = (...args: any[]) => {
    removeSocketListener(ws, event, wrapper)
    handler(...args)
  }

  addSocketListener(ws, event, wrapper)
}

/**
 * 移除 socket 事件监听（兼容 `removeListener` / `off`）。
 *
 * @param ws - socket 实例。
 * @param event - 事件名。
 * @param handler - 原始处理函数。
 */
function removeSocketListener(
  ws: WebSocket,
  event: string,
  handler: (...args: any[]) => void,
): void {
  const socket = ws as ProtocolSocket
  if (socket.removeListener) {
    socket.removeListener(event, handler)
    return
  }

  if (socket.off) {
    socket.off(event, handler)
  }
}

/**
 * 发送协议二进制消息，兼容项目内自定义 socket 与 `ws` 风格 API。
 *
 * @param ws - socket 实例。
 * @param data - 已序列化的协议字节流。
 * @returns 发送完成 Promise。
 */
function sendBinaryMessage(
  ws: WebSocket,
  data: Uint8Array,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = ws as ProtocolSocket
    let settled = false
    const done = (error?: Error | unknown) => {
      if (settled)
        return
      settled = true
      if (error)
        reject(error)
      else
        resolve()
    }

    // 优先使用 uni-app 底层 SocketTask 的二进制发送能力，避免 `sendMessage()` 被 JSON.stringify
    if (socket.socketInstance?.send) {
      const arrayBuffer = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer
      socket.socketInstance.send({
        data: arrayBuffer,
        success: () => done(),
        fail: error => done(error),
      })
      return
    }

    if (socket.send) {
      socket.send(data, (error?: Error) => {
        done(error)
      })
      return
    }

    if (socket.sendMessage) {
      const maybePromise = socket.sendMessage(data, (error?: Error) => {
        done(error)
      })

      // 兼容 `sendMessage` 返回 Promise 且不使用回调的封装（你的 socket 类就是这种）
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        ;(maybePromise as Promise<unknown>).then(() => done()).catch(done)
      }
      return
    }

    done(new Error('socket.send/sendMessage is not available'))
  })
}

/**
 * 为指定 socket 安装消息分发器（仅安装一次）。
 *
 * 该分发器负责将底层 `message` 事件反序列化为协议 `Message`，
 * 并在“等待中的 Promise 回调”和“本地缓存队列”之间分发。
 *
 * @param ws - socket 实例（项目封装或 `ws` 均可）。
 */
function setupMessageHandler(ws: WebSocket) {
  if (!messageQueues.has(ws)) {
    messageQueues.set(ws, [])
    messageCallbacks.set(ws, [])

    const handleProtocolMessage = (data: unknown) => {
      try {
        const uint8Data = normalizeSocketMessageData(data)
        const msg = unmarshalMessage(uint8Data)
        const queue = messageQueues.get(ws)!
        const callbacks = messageCallbacks.get(ws)!

        if (callbacks.length > 0) {
          // 如果存在等待中的回调，则立即分发消息
          const callback = callbacks.shift()!
          callback(msg)
        }
        else {
          // 否则先进入本地队列缓存
          queue.push(msg)
        }
      }
      catch (error) {
        throw new Error(`Error processing message: ${error}`)
      }
    }

    const socket = ws as ProtocolSocket

    // 优先监听底层 SocketTask 原始消息，避免被业务层 `message` 事件预先 JSON.parse 后丢失二进制内容
    if (socket.socketInstance?.onMessage) {
      socket.socketInstance.onMessage((res: { data: unknown }) => {
        handleProtocolMessage(res)
      })
    }
    else {
      addSocketListener(ws, 'message', (data: unknown) => {
        handleProtocolMessage(data)
      })
    }

    addSocketListener(ws, 'close', () => {
      messageQueues.delete(ws)
      messageCallbacks.delete(ws)
    })
  }
}

/**
 * 接收一条协议消息。
 *
 * 行为：
 * - 若内部缓存队列已有消息，则立即返回。
 * - 否则挂起等待下一条 `message` 事件。
 * - 若等待期间触发 socket `error` 事件，则 Promise 拒绝。
 *
 * @param ws - socket 实例。
 * @returns 解析后的协议消息对象。
 */
export async function ReceiveMessage(ws: WebSocket): Promise<Message> {
  setupMessageHandler(ws)

  return new Promise((resolve, reject) => {
    const queue = messageQueues.get(ws)!
    const callbacks = messageCallbacks.get(ws)!

    // 队列已有消息时，直接消费一条
    if (queue.length > 0) {
      resolve(queue.shift()!)
      return
    }
    let resolver: (msg: Message) => void
    // 否则等待下一条消息到达
    const errorHandler = (error: unknown) => {
      const index = callbacks.findIndex(cb => cb === resolver)
      if (index !== -1) {
        callbacks.splice(index, 1)
      }
      reject(error)
    }

    resolver = (msg: Message) => {
      removeSocketListener(ws, 'error', errorHandler)
      resolve(msg)
    }

    callbacks.push(resolver)
    addSocketOnce(ws, 'error', errorHandler)
  })
}

/**
 * 等待并校验下一条消息是否符合指定 `msgType + eventType`。
 *
 * 常用于协议握手流程中的关键确认点，例如：
 * - `ConnectionStarted`
 * - `SessionStarted`
 * - `SessionFinished`
 *
 * @param ws - socket 实例。
 * @param msgType - 期望的消息类型。
 * @param eventType - 期望的事件类型。
 * @returns 匹配成功的消息对象。
 * @throws 当实际消息类型或事件类型不匹配时抛出异常。
 */
export async function WaitForEvent(
  ws: WebSocket,
  msgType: MsgType,
  eventType: EventType,
): Promise<Message> {
  const msg = await ReceiveMessage(ws)
  if (msg.type !== msgType || msg.event !== eventType) {
    throw new Error(
      `Unexpected message: type=${getMsgTypeName(msg.type)}, event=${getEventTypeName(msg.event || 0)}`,
    )
  }
  return msg
}

/**
 * 发送完整客户端请求（无事件、无序号）。
 *
 * @param ws - socket 实例。
 * @param payload - 已编码的业务负载（通常为 JSON 字节）。
 * @returns 发送完成 Promise。
 */
export async function FullClientRequest(
  ws: WebSocket,
  payload: Uint8Array,
): Promise<void> {
  const msg = createMessage(MsgType.FullClientRequest, MsgTypeFlagBits.NoSeq)
  msg.payload = payload
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}

/**
 * 发送纯音频客户端消息。
 *
 * @param ws - socket 实例。
 * @param payload - 音频帧字节数据。
 * @param flag - 消息标志位（可控制是否带序号以及序号方向语义）。
 * @returns 发送完成 Promise。
 */
export async function AudioOnlyClient(
  ws: WebSocket,
  payload: Uint8Array,
  flag: MsgTypeFlagBits,
): Promise<void> {
  const msg = createMessage(MsgType.AudioOnlyClient, flag)
  msg.payload = payload
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}

/**
 * 发送“开始连接”事件。
 *
 * 协议形态：`FullClientRequest + WithEvent(StartConnection)`，负载固定为 `{}`。
 *
 * @param ws - socket 实例。
 * @returns 发送完成 Promise。
 */
export async function StartConnection(ws: WebSocket): Promise<void> {
  const msg = createMessage(
    MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  msg.event = EventType.StartConnection
  msg.payload = encodeUtf8('{}')
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}

/**
 * 发送“结束连接”事件。
 *
 * @param ws - socket 实例。
 * @returns 发送完成 Promise。
 */
export async function FinishConnection(ws: WebSocket): Promise<void> {
  const msg = createMessage(
    MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  msg.event = EventType.FinishConnection
  msg.payload = encodeUtf8('{}')
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}

/**
 * 发送“开始会话”事件。
 *
 * @param ws - socket 实例。
 * @param payload - 会话启动参数（通常为 JSON 字节）。
 * @param sessionId - 会话 ID。
 * @returns 发送完成 Promise。
 */
export async function StartSession(
  ws: WebSocket,
  payload: Uint8Array,
  sessionId: string,
): Promise<void> {
  const msg = createMessage(
    MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  msg.event = EventType.StartSession
  msg.sessionId = sessionId
  msg.payload = payload
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}

/**
 * 发送“结束会话”事件。
 *
 * @param ws - socket 实例。
 * @param sessionId - 会话 ID。
 * @returns 发送完成 Promise。
 */
export async function FinishSession(
  ws: WebSocket,
  sessionId: string,
): Promise<void> {
  const msg = createMessage(
    MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  msg.event = EventType.FinishSession
  msg.sessionId = sessionId
  msg.payload = encodeUtf8('{}')
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}

/**
 * 发送“取消会话”事件。
 *
 * @param ws - socket 实例。
 * @param sessionId - 会话 ID。
 * @returns 发送完成 Promise。
 */
export async function CancelSession(
  ws: WebSocket,
  sessionId: string,
): Promise<void> {
  const msg = createMessage(
    MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  msg.event = EventType.CancelSession
  msg.sessionId = sessionId
  msg.payload = encodeUtf8('{}')
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}

/**
 * 发送会话内通用任务请求事件。
 *
 * @param ws - socket 实例。
 * @param payload - 任务请求负载（通常为 JSON 字节）。
 * @param sessionId - 当前会话 ID。
 * @returns 发送完成 Promise。
 */
export async function TaskRequest(
  ws: WebSocket,
  payload: Uint8Array,
  sessionId: string,
): Promise<void> {
  const msg = createMessage(
    MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  msg.event = EventType.TaskRequest
  msg.sessionId = sessionId
  msg.payload = payload
  console.log(`${msg.toString()}`)
  const data = marshalMessage(msg)
  return sendBinaryMessage(ws, data)
}
