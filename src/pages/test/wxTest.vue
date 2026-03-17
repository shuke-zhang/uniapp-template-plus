<route lang="json" type="page">
{
  "style": {
    "navigationBarTitleText": "测试"
  }
}
</route>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { gzip, ungzip } from 'pako'
import {
  CompressionBits,
  EventType,
  type Message,
  MsgType,
  MsgTypeFlagBits,
  ReceiveMessage,
  SerializationBits,
  WaitForEvent,
  createMessage,
  marshalMessage,
} from './protocols'
import {
  DIALOG_ACCESS_TOKEN,
  DIALOG_APPID,
  DIALOG_APP_KEY,
  DIALOG_ENDPOINT,
  DIALOG_ENDPOINT_MP_WX,
  DIALOG_RESOURCE_ID,
  DIALOG_SPEAKERS,
} from './duan/access'
import { WebSocket } from '@/store/modules/socket/webSocket'

type ChatRole = 'user' | 'assistant' | 'system'

interface ChatItem {
  id: string
  role: ChatRole
  text: string
  audioUrl?: string
}

interface UniSocketCloseEvent {
  code?: number
  reason?: string
}

type DialogMode = 'text' | 'audio' | 'audio_file'

type RecorderEventType = 'start' | 'stop' | 'error' | 'process'

interface RecorderPermissionResult {
  granted?: boolean
  ok?: boolean
  message?: string
}

interface RecorderProcessFrame {
  [sampleIndex: string]: number
}

interface RecorderEventPayload {
  event?: RecorderEventType
  message?: string
  buffers?: RecorderProcessFrame[]
  volume?: number
  duration?: number
  sampleRate?: number
}

interface RecorderStartParams {
  type?: string
  sampleRate?: number
}

type RecorderCallback<T> = (res: T | string) => void

interface ShukeRecorderPlugin {
  requestPermission: (cb: RecorderCallback<RecorderPermissionResult>) => void
  startRecord: (params: RecorderStartParams, cb: RecorderCallback<RecorderEventPayload>) => void
  stopRecord: (cb?: RecorderCallback<{ ok?: boolean, message?: string }>) => void
}

type RecorderBackend = 'native_plugin' | 'uni_recorder'

const userInput = ref('你好，先做个自我介绍，然后推荐一个适合今晚的轻松话题。')
const botName = ref('柚子')
const systemRole = ref('你使用自然、亲切、简洁的中文女声进行对话，回答尽量清晰、口语化。')
const speakingStyle = ref('语速适中，语调自然，表达有耐心。')
const recvTimeout = ref(30)
const speakerIndex = ref(1)
const format = ref<'pcm_s16le' | 'pcm'>('pcm_s16le')
const showAdvanced = ref(false)
const dialogMode = ref<DialogMode>('text')
const audioFilePath = ref('')
const isConnecting = ref(false)
const isReady = ref(false)
const isSending = ref(false)
const helloFinished = ref(false)
const isRecording = ref(false)
const isSendingFile = ref(false)
const statusText = ref('未连接')
const errorText = ref('')
const chatList = ref<ChatItem[]>([])
const logs = ref<string[]>([])
const currentAudioUrl = ref('')
const audioEl = ref<HTMLAudioElement | null>(null)

let wsRef: WebSocket | null = null
let sessionIdRef = ''
let disposed = false
let currentAssistantAudioChunks: Uint8Array[] = []
let currentAssistantTextChunks: string[] = []
let currentLogHandler: ((msg: string) => void) | null = null
let receiveLoopTaskToken = 0
let recorderPlugin: ShukeRecorderPlugin | null = null
let recorderManager: UniNamespace.RecorderManager | null = null
let recorderFrameHandler: ((res: any) => void) | null = null
let recorderStopHandler: (() => void) | null = null
let recorderErrorHandler: ((res: any) => void) | null = null
let activeRecorderBackend: RecorderBackend | null = null
let sentAudioChunkCount = 0
let sentAudioBytes = 0
let assistantAudioFlushTimer: ReturnType<typeof setTimeout> | null = null
let frameWatchTimer: ReturnType<typeof setTimeout> | null = null
let innerAudioContext: UniNamespace.InnerAudioContext | null = null

const selectedSpeaker = computed(() => DIALOG_SPEAKERS[speakerIndex.value] ?? DIALOG_SPEAKERS[0])

const DialogEvent = {
  StartConnection: 1,
  FinishConnection: 2,
  StartSession: 100,
  FinishSession: 102,
  SessionStarted: 150,
  SessionFinished: 152,
  SessionFailed: 153,
  SayHello: 300,
  TTSSentenceStart: 350,
  TTSEnded: 359,
  ASRInfo: 450,
  ASRResponse: 451,
  ASREnded: 459,
  TaskRequest: 200,
  ChatTTSText: 500,
  ChatTextQuery: 501,
  ChatRAGText: 502,
  ChatResponse: 550,
} as const

function pushLog(message: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`
  logs.value = [line, ...logs.value].slice(0, 120)
}

function genId(): string {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)
  return `${Date.now().toString(16)}-${random()}-${random()}-${random()}-${random()}${random()}`
}

function getRuntimeBuffer():
  | {
    from: (value: string, encoding?: string) => Uint8Array
  }
  | undefined {
  const runtime = (globalThis as unknown as { Buffer?: any }).Buffer
  if (!runtime || typeof runtime.from !== 'function')
    return undefined
  return runtime
}

function encodeUtf8(value: string): Uint8Array {
  const runtimeBuffer = getRuntimeBuffer()
  if (runtimeBuffer)
    return new Uint8Array(runtimeBuffer.from(value, 'utf8'))

  const bytes: number[] = []
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
    }
    else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
    }
    else if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        const point = ((code - 0xD800) << 10) + (next - 0xDC00) + 0x10000
        bytes.push(
          0xF0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3F),
          0x80 | ((point >> 6) & 0x3F),
          0x80 | (point & 0x3F),
        )
        i++
      }
      else {
        bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
      }
    }
    else {
      bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
    }
  }
  return new Uint8Array(bytes)
}

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

function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength)
  copied.set(bytes)
  return copied.buffer
}

function parseRecorderPayload(payload: unknown): RecorderEventPayload {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as RecorderEventPayload
    }
    catch {
      return { event: 'error', message: payload }
    }
  }
  if (payload && typeof payload === 'object')
    return payload as RecorderEventPayload
  return {}
}

function detectRecorderEventType(payload: RecorderEventPayload): RecorderEventType | '' {
  if (payload.event === 'start' || payload.event === 'stop' || payload.event === 'error' || payload.event === 'process')
    return payload.event
  if (Array.isArray(payload.buffers) && payload.buffers.length > 0)
    return 'process'
  return ''
}

function frameToPcmChunk(frame: RecorderProcessFrame): Uint8Array | null {
  const keys = Object.keys(frame)
  if (!keys.length)
    return null

  keys.sort((a, b) => Number(a) - Number(b))
  const bytes = new Uint8Array(keys.length * 2)
  for (let i = 0; i < keys.length; i++) {
    const raw = Number(frame[keys[i]])
    const value = Number.isFinite(raw) ? Math.max(-32768, Math.min(32767, Math.trunc(raw))) : 0
    bytes[i * 2] = value & 0xFF
    bytes[i * 2 + 1] = (value >> 8) & 0xFF
  }
  return bytes
}

function extractPcmChunk(payload: RecorderEventPayload): Uint8Array | null {
  if (!Array.isArray(payload.buffers) || payload.buffers.length === 0)
    return null
  for (const frame of payload.buffers) {
    if (!frame || typeof frame !== 'object')
      continue
    const chunk = frameToPcmChunk(frame)
    if (chunk && chunk.length > 0)
      return chunk
  }
  return null
}

function resolveRecorderBackend(runtimeInfo?: Record<string, any>): RecorderBackend {
  const info = runtimeInfo ?? (uni.getSystemInfoSync() as Record<string, any>)
  const uniPlatform = String(info?.uniPlatform || info?.platform || '').toLowerCase()
  if (uniPlatform === 'app' || uniPlatform === 'android' || uniPlatform === 'ios' || uniPlatform === 'app-plus')
    return 'native_plugin'
  return 'uni_recorder'
}

function resolveSocketEndpoint(runtimeInfo?: Record<string, any>): string {
  const info = runtimeInfo ?? (uni.getSystemInfoSync() as Record<string, any>)
  const uniPlatform = String(info?.uniPlatform || info?.platform || '').toLowerCase()
  if (uniPlatform === 'mp-weixin' && DIALOG_ENDPOINT_MP_WX)
    return DIALOG_ENDPOINT_MP_WX
  return DIALOG_ENDPOINT
}

function normalizeUniFrameChunk(input: unknown): Uint8Array | null {
  if (input instanceof ArrayBuffer)
    return new Uint8Array(input)

  if (typeof input === 'string') {
    const uniAny = uni as unknown as {
      base64ToArrayBuffer?: (base64: string) => ArrayBuffer
    }
    if (typeof uniAny.base64ToArrayBuffer === 'function') {
      try {
        return new Uint8Array(uniAny.base64ToArrayBuffer(input))
      }
      catch {}
    }
  }

  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
  }

  return null
}

function clearUniRecorderListeners() {
  if (!recorderManager)
    return

  const managerAny = recorderManager as Record<string, any>
  if (recorderFrameHandler && typeof managerAny.offFrameRecorded === 'function') {
    try {
      managerAny.offFrameRecorded(recorderFrameHandler)
    }
    catch {}
  }
  if (recorderStopHandler && typeof managerAny.offStop === 'function') {
    try {
      managerAny.offStop(recorderStopHandler)
    }
    catch {}
  }
  if (recorderErrorHandler && typeof managerAny.offError === 'function') {
    try {
      managerAny.offError(recorderErrorHandler)
    }
    catch {}
  }

  recorderFrameHandler = null
  recorderStopHandler = null
  recorderErrorHandler = null
}

function buildWavFromPcm16(bytes: Uint8Array, sampleRate = 24000, channels = 1): Uint8Array {
  const byteRate = sampleRate * channels * 2
  const blockAlign = channels * 2
  const wav = new Uint8Array(44 + bytes.length)
  const view = new DataView(wav.buffer)

  // RIFF header
  wav.set([0x52, 0x49, 0x46, 0x46], 0) // RIFF
  view.setUint32(4, 36 + bytes.length, true)
  wav.set([0x57, 0x41, 0x56, 0x45], 8) // WAVE
  wav.set([0x66, 0x6D, 0x74, 0x20], 12) // fmt
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  wav.set([0x64, 0x61, 0x74, 0x61], 36) // data
  view.setUint32(40, bytes.length, true)
  wav.set(bytes, 44)
  return wav
}

function buildAudioUrl(bytes: Uint8Array, audioFormat: 'pcm_s16le' | 'pcm'): string {
  let mime = 'audio/wav'
  let sourceBytes = bytes

  if (audioFormat === 'pcm_s16le') {
    sourceBytes = buildWavFromPcm16(bytes, 24000, 1)
    mime = 'audio/wav'
  }
  else {
    throw new Error('当前页面暂不支持直接播放 float32/原始 pcm，请使用 pcm_s16le')
  }

  if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    return URL.createObjectURL(new Blob([toArrayBuffer(sourceBytes)], { type: mime }))
  }

  const uniAny = uni as unknown as {
    arrayBufferToBase64?: (buffer: ArrayBuffer) => string
  }
  const fsAny = uni as unknown as {
    getFileSystemManager?: () => {
      writeFileSync?: (filePath: string, data: string, encoding?: string) => void
    }
  }
  const runtimeInfo = uni.getSystemInfoSync() as Record<string, any>
  const uniPlatform = String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase()
  const isMpWx = uniPlatform === 'mp-weixin'
  if (isMpWx && typeof uniAny.arrayBufferToBase64 === 'function' && typeof fsAny.getFileSystemManager === 'function') {
    try {
      const fs = fsAny.getFileSystemManager()
      const wxAny = globalThis as unknown as {
        wx?: {
          env?: {
            USER_DATA_PATH?: string
          }
        }
      }
      const baseDir = wxAny.wx?.env?.USER_DATA_PATH || ''
      if (baseDir && typeof fs?.writeFileSync === 'function') {
        const ext = mime === 'audio/wav' ? 'wav' : 'mp3'
        const filePath = `${baseDir}/dialog_audio_${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`
        const base64 = uniAny.arrayBufferToBase64(toArrayBuffer(sourceBytes))
        fs.writeFileSync(filePath, base64, 'base64')
        return filePath
      }
    }
    catch (e) {
      pushLog(`写入本地音频文件失败，回退 dataUrl: ${String(e)}`)
    }
  }

  if (typeof uniAny.arrayBufferToBase64 === 'function') {
    const base64 = uniAny.arrayBufferToBase64(toArrayBuffer(sourceBytes))
    return `data:${mime};base64,${base64}`
  }

  throw new Error('当前环境不支持创建音频播放地址')
}

function revokeAudioUrl(url: string) {
  if (url && typeof URL !== 'undefined' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function clearAssistantAudioFlushTimer() {
  if (assistantAudioFlushTimer) {
    clearTimeout(assistantAudioFlushTimer)
    assistantAudioFlushTimer = null
  }
}

function scheduleAssistantAudioFlush() {
  clearAssistantAudioFlushTimer()
  assistantAudioFlushTimer = setTimeout(() => {
    void finalizeAssistantAudioIfAny().catch((e) => {
      pushLog(`音频合并失败: ${String(e)}`)
    })
  }, 650)
}

function clearFrameWatchTimer() {
  if (frameWatchTimer) {
    clearTimeout(frameWatchTimer)
    frameWatchTimer = null
  }
}

function getInnerAudioContext() {
  if (innerAudioContext)
    return innerAudioContext
  const uniAny = uni as unknown as {
    createInnerAudioContext?: () => UniNamespace.InnerAudioContext
  }
  if (typeof uniAny.createInnerAudioContext !== 'function')
    return null

  innerAudioContext = uniAny.createInnerAudioContext()
  try {
    innerAudioContext.autoplay = false
    innerAudioContext.obeyMuteSwitch = false
  }
  catch {}
  innerAudioContext.onError?.((e: any) => {
    pushLog(`innerAudio 错误: ${e?.errMsg || JSON.stringify(e)}`)
  })
  return innerAudioContext
}

function encodeJsonPayload(data: Record<string, any>): Uint8Array {
  return encodeUtf8(JSON.stringify(data))
}

function applyCompression(payload: Uint8Array, compression: CompressionBits): Uint8Array {
  if (compression === CompressionBits.Gzip)
    return gzip(payload)
  return payload
}

function gunzipMaybe(data: Uint8Array, compression: CompressionBits): Uint8Array {
  if (compression === CompressionBits.Gzip)
    return ungzip(data)
  return data
}

function parsePayloadJson(msg: Message): any {
  const bytes = gunzipMaybe(msg.payload, msg.compression)
  if (msg.serialization === SerializationBits.JSON) {
    const text = decodeUtf8(bytes)
    return text ? JSON.parse(text) : {}
  }
  return bytes
}

/**
 * Build websocket handshake headers required by the realtime dialog service.
 *
 * @returns Request header key/value pairs.
 */
function createHeaders() {
  return {
    'X-Api-App-Id': DIALOG_APPID,
    'X-Api-App-Key': DIALOG_APP_KEY,
    'X-Api-Access-Key': DIALOG_ACCESS_TOKEN,
    'X-Api-Resource-Id': DIALOG_RESOURCE_ID,
    'X-Api-Connect-Id': genId(),
  }
}

async function sendRawProtocol(ws: WebSocket, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    const socketTask = (ws as any).socketInstance as UniNamespace.SocketTask | null
    if (socketTask?.send) {
      socketTask.send({
        data: toArrayBuffer(bytes),
        success: () => resolve(),
        fail: err => reject(err),
      })
      return
    }
    reject(new Error('socketInstance.send is not available'))
  })
}

async function sendDialogEvent(
  ws: WebSocket,
  event: number,
  payload: Record<string, any>,
  options?: {
    sessionId?: string
    msgType?: MsgType
    serialization?: SerializationBits
    compression?: CompressionBits
  },
) {
  const compression = options?.compression ?? CompressionBits.Gzip
  const rawPayload = encodeJsonPayload(payload)
  const msg = createMessage(
    options?.msgType ?? MsgType.FullClientRequest,
    MsgTypeFlagBits.WithEvent,
  )
  msg.event = event as EventType
  msg.sessionId = options?.sessionId
  msg.serialization = options?.serialization ?? SerializationBits.JSON
  msg.compression = compression
  msg.payload = applyCompression(rawPayload, compression)
  await sendRawProtocol(ws, marshalMessage(msg))
}

async function sendChatTextQuery(ws: WebSocket, sessionId: string, content: string) {
  await sendDialogEvent(ws, DialogEvent.ChatTextQuery, { content }, { sessionId })
}

async function sendSayHello(ws: WebSocket, sessionId: string) {
  await sendDialogEvent(ws, DialogEvent.SayHello, {
    content: '你好，我是你的语音对话助手，有什么可以帮助你的？',
  }, { sessionId })
}

/**
 * Build StartSession payload according to current UI selections.
 *
 * @returns Session initialization payload.
 */
function buildStartSessionPayload() {
  return {
    asr: {
      extra: {
        end_smooth_window_ms: 1500,
      },
    },
    tts: {
      speaker: selectedSpeaker.value.value,
      audio_config: {
        channel: 1,
        format: format.value,
        sample_rate: 24000,
      },
    },
    dialog: {
      bot_name: botName.value.trim() || '助手',
      system_role: systemRole.value.trim(),
      speaking_style: speakingStyle.value.trim(),
      location: {
        city: '北京',
      },
      extra: {
        strict_audit: false,
        audit_response: '支持客户端自定义安全审核回复话术。',
        recv_timeout: Number(recvTimeout.value) || 30,
        input_mod: dialogMode.value === 'audio_file' ? 'audio_file' : dialogMode.value,
      },
    },
  }
}

/**
 * Send a single audio chunk in binary mode.
 *
 * @param ws - Active websocket instance.
 * @param sessionId - Current dialog session id.
 * @param rawAudio - Raw audio bytes for this chunk.
 */
async function sendAudioTaskChunk(ws: WebSocket, sessionId: string, rawAudio: Uint8Array) {
  const msg = createMessage(MsgType.AudioOnlyClient, MsgTypeFlagBits.WithEvent)
  msg.event = DialogEvent.TaskRequest as any
  msg.sessionId = sessionId
  msg.serialization = SerializationBits.Raw
  msg.compression = CompressionBits.Gzip
  msg.payload = applyCompression(rawAudio, msg.compression)
  await sendRawProtocol(ws, marshalMessage(msg))
  sentAudioChunkCount += 1
  sentAudioBytes += rawAudio.length
  if (sentAudioChunkCount % 20 === 0)
    pushLog(`已发送音频帧 ${sentAudioChunkCount}，累计 ${Math.round(sentAudioBytes / 1024)}KB`)
}

/**
 * Read selected local audio file and stream it in chunks to server.
 */
async function sendAudioFileChunks() {
  if (!wsRef || !sessionIdRef) {
    throw new Error('会话未建立')
  }
  if (!audioFilePath.value.trim()) {
    throw new Error('请先选择音频文件')
  }

  const fs = uni.getFileSystemManager()
  const fileData = await new Promise<ArrayBuffer>((resolve, reject) => {
    fs.readFile({
      filePath: audioFilePath.value.trim(),
      success: (res: any) => {
        if (res.data instanceof ArrayBuffer) {
          resolve(res.data)
        }
        else {
          reject(new Error('读取文件失败：返回数据不是 ArrayBuffer'))
        }
      },
      fail: reject,
    })
  })

  let bytes = new Uint8Array(fileData)
  const isWav
    = bytes.length > 44
      && bytes[0] === 0x52
      && bytes[1] === 0x49
      && bytes[2] === 0x46
      && bytes[3] === 0x46
      && bytes[8] === 0x57
      && bytes[9] === 0x41
      && bytes[10] === 0x56
      && bytes[11] === 0x45
  if (isWav) {
    bytes = bytes.slice(44)
    pushLog('检测到 WAV 文件，已剥离文件头后按 PCM 帧发送')
  }
  const chunkSize = 6400
  const chunkIntervalMs = 200
  isSendingFile.value = true
  isSending.value = true
  statusText.value = '音频文件发送中...'
  appendChat('system', `开始发送音频文件：${audioFilePath.value}`)

  try {
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.slice(offset, Math.min(offset + chunkSize, bytes.length))
      await sendAudioTaskChunk(wsRef, sessionIdRef, chunk)
      await new Promise(resolve => setTimeout(resolve, chunkIntervalMs))
    }
    appendChat('system', '音频文件发送完成，等待服务端处理')
  }
  finally {
    isSendingFile.value = false
    isSending.value = false
    if (isReady.value)
      statusText.value = '文件已发送，等待回复'
  }
}

function getRecorderPlugin(): ShukeRecorderPlugin {
  if (recorderPlugin)
    return recorderPlugin

  const plugin = uni.requireNativePlugin('shuke_recorder') as ShukeRecorderPlugin | null
  if (!plugin || typeof plugin.startRecord !== 'function' || typeof plugin.requestPermission !== 'function') {
    throw new Error('当前环境未加载 shuke_recorder 原生插件')
  }
  recorderPlugin = plugin
  return plugin
}

function getUniRecorderManager(): UniNamespace.RecorderManager {
  if (recorderManager)
    return recorderManager
  recorderManager = uni.getRecorderManager()
  return recorderManager
}

/**
 * Stop microphone recording and reset send status.
 */
function stopRecorder() {
  const backend = activeRecorderBackend
  clearFrameWatchTimer()

  if (backend === 'native_plugin') {
    try {
      recorderPlugin?.stopRecord?.()
    }
    catch {}
  }
  else if (backend === 'uni_recorder') {
    try {
      recorderManager?.stop()
    }
    catch {}
    clearUniRecorderListeners()
  }
  else {
    try {
      recorderPlugin?.stopRecord?.()
    }
    catch {}
    try {
      recorderManager?.stop()
    }
    catch {}
    clearUniRecorderListeners()
  }

  const wasRecording = isRecording.value || isSending.value
  isRecording.value = false
  isSending.value = false
  activeRecorderBackend = null
  if (isReady.value)
    statusText.value = '麦克风已停止'
  if (wasRecording)
    pushLog(`录音结束，累计发送 ${sentAudioChunkCount} 帧，约 ${Math.round(sentAudioBytes / 1024)}KB`)
}

/**
 * Ensure record permission is granted before starting microphone capture.
 */
async function ensureRecordPermission(backend: RecorderBackend): Promise<void> {
  if (backend === 'native_plugin') {
    const plugin = getRecorderPlugin()
    await new Promise<void>((resolve, reject) => {
      plugin.requestPermission((res) => {
        const result = parseRecorderPayload(res) as RecorderPermissionResult
        if (result?.granted) {
          resolve()
          return
        }
        reject(new Error(result?.message || '麦克风权限未授权，请在系统设置中开启录音权限后重试'))
      })
    })
    return
  }

  const uniAny = uni as unknown as {
    authorize?: (options: {
      scope: string
      success: () => void
      fail: (err: unknown) => void
    }) => void
  }
  if (typeof uniAny.authorize !== 'function')
    return

  await new Promise<void>((resolve, reject) => {
    uniAny.authorize?.({
      scope: 'scope.record',
      success: resolve,
      fail: err => reject(new Error(err ? String(err) : '麦克风权限未授权，请在系统设置中开启录音权限后重试')),
    })
  })
}

/**
 * Start live microphone capture and send frame chunks to server.
 */
async function startMicrophoneStreaming() {
  if (!wsRef || !sessionIdRef) {
    throw new Error('会话未建立')
  }
  if (isRecording.value)
    return

  const localWs = wsRef
  const localSessionId = sessionIdRef
  const runtimeInfo = uni.getSystemInfoSync() as any
  const backend = resolveRecorderBackend(runtimeInfo)
  await ensureRecordPermission(backend)
  activeRecorderBackend = backend
  let hasFrameOutput = false

  sentAudioChunkCount = 0
  sentAudioBytes = 0
  isRecording.value = true
  isSending.value = true
  statusText.value = '麦克风采集中...'
  appendChat('system', `已开始麦克风采集并实时发送音频帧（${backend === 'native_plugin' ? 'native plugin' : 'uni recorder'} + gzip）`)
  pushLog(`运行平台: ${runtimeInfo.uniPlatform || runtimeInfo.platform || 'unknown'}, 系统: ${runtimeInfo.system || 'unknown'}`)
  pushLog(`录音后端: ${backend === 'native_plugin' ? 'shuke_recorder' : 'uni.getRecorderManager'}`)
  pushLog('录音基础参数: sampleRate=16000, channels=1')

  try {
    if (backend === 'native_plugin') {
      const plugin = getRecorderPlugin()
      plugin.startRecord({ type: 'pcm', sampleRate: 16000 }, (eventRes) => {
        const payload = parseRecorderPayload(eventRes)
        const eventType = detectRecorderEventType(payload)

        if (eventType === 'start') {
          pushLog('原生录音已启动')
          return
        }

        if (eventType === 'stop') {
          if (!isRecording.value && !isSending.value)
            return
          isRecording.value = false
          isSending.value = false
          activeRecorderBackend = null
          if (isReady.value)
            statusText.value = '麦克风已停止'
          pushLog('录音已停止')
          return
        }

        if (eventType === 'error') {
          const message = payload.message || '录音错误'
          isRecording.value = false
          isSending.value = false
          activeRecorderBackend = null
          errorText.value = message
          if (isReady.value)
            statusText.value = '麦克风异常停止'
          pushLog(`录音错误: ${message}`)
          return
        }

        if (eventType !== 'process')
          return
        if (!wsRef || wsRef !== localWs || !isRecording.value)
          return

        const chunk = extractPcmChunk(payload)
        if (!chunk || chunk.length === 0)
          return

        if (!hasFrameOutput) {
          hasFrameOutput = true
          clearFrameWatchTimer()
          pushLog(`录音帧开始产出，sampleRate=${payload.sampleRate || 16000}, volume=${payload.volume ?? 0}`)
        }

        void sendAudioTaskChunk(localWs, localSessionId, chunk).catch((e) => {
          pushLog(`录音帧发送失败: ${String(e)}`)
        })
      })
      return
    }

    const manager = getUniRecorderManager()
    clearUniRecorderListeners()
    console.log(manager, 'manager')

    recorderFrameHandler = (res: any) => {
      console.log(res, 'recorderFrameHandler')

      if (!wsRef || wsRef !== localWs || !isRecording.value)
        return

      const frameBuffer = res?.frameBuffer ?? res?.data ?? res?.buffer
      const chunk = normalizeUniFrameChunk(frameBuffer)
      if (!chunk || chunk.length === 0) {
        pushLog(`录音帧类型异常: ${typeof frameBuffer}`)
        return
      }

      if (!hasFrameOutput) {
        hasFrameOutput = true
        clearFrameWatchTimer()
        pushLog('录音帧开始产出（uni recorder）')
      }

      void sendAudioTaskChunk(localWs, localSessionId, chunk).catch((e) => {
        pushLog(`录音帧发送失败: ${String(e)}`)
      })
    }

    recorderStopHandler = () => {
      clearFrameWatchTimer()
      if (!isRecording.value && !isSending.value)
        return
      isRecording.value = false
      isSending.value = false
      activeRecorderBackend = null
      if (isReady.value)
        statusText.value = '麦克风已停止'
      pushLog('录音已停止')
    }

    recorderErrorHandler = (e: any) => {
      clearFrameWatchTimer()
      const message = e?.errMsg || '录音错误'
      isRecording.value = false
      isSending.value = false
      activeRecorderBackend = null
      errorText.value = message
      if (isReady.value)
        statusText.value = '麦克风异常停止'
      pushLog(`录音错误: ${message}`)
    }

    const managerAny = manager as Record<string, any>
    if (typeof managerAny.onFrameRecorded !== 'function') {
      throw new TypeError('当前平台 uni.getRecorderManager 不支持 onFrameRecorded')
    }

    manager.onFrameRecorded(recorderFrameHandler)
    manager.onStop(recorderStopHandler)
    manager.onError(recorderErrorHandler)
    manager.start({
      duration: 600000,
      sampleRate: 16000,
      numberOfChannels: 1,
      format: 'pcm' as any,
      frameSize: 16,
    })
    pushLog('uni recorder 已启动')
    clearFrameWatchTimer()
    frameWatchTimer = setTimeout(() => {
      if (isRecording.value && !hasFrameOutput) {
        pushLog('3秒内未收到录音帧：请检查小程序基础库、录音权限，以及 Recorder format/frameSize 参数兼容性')
      }
    }, 3000)
  }
  catch (e) {
    clearFrameWatchTimer()
    isRecording.value = false
    isSending.value = false
    activeRecorderBackend = null
    clearUniRecorderListeners()
    throw e
  }
}

async function pickAudioFile() {
  return new Promise<void>((resolve, reject) => {
    uni.chooseFile({
      count: 1,
      type: 'all',
      extension: ['wav', 'pcm'],
      success: (res: any) => {
        const file = res?.tempFiles?.[0] || res?.files?.[0]
        const path = file?.path || file?.tempFilePath || ''
        if (!path) {
          reject(new Error('未获取到文件路径'))
          return
        }
        audioFilePath.value = path
        resolve()
      },
      fail: reject,
    })
  })
}

async function createProtocolSocket(headers: Record<string, string>, endpoint: string): Promise<WebSocket> {
  const ws = new WebSocket(endpoint)
  const wsEx = ws as any

  currentLogHandler = (msg: string) => pushLog(`socket: ${msg}`)
  wsEx.on('log', (res: string) => {
    console.log(res, '自己封装socket打印')
    currentLogHandler?.(res || '')
  })
  wsEx.on('open', () => pushLog('socket: open'))
  wsEx.on('close', reason => pushLog(`socket: close ${reason || ''}`))
  wsEx.on('error', err => pushLog(`socket: 错误 ${err || ''}`))

  wsEx.isCreate = false
  wsEx.isConnect = false
  wsEx.isInitiative = false
  wsEx.socketInstance = uni.connectSocket({
    url: endpoint,
    header: {
      'content-type': 'application/json',
      ...headers,
    },
    success: (res) => {
      wsEx.isCreate = true
      ws.emit('connect')
      console.log(res, 'socket连接成功')
    },
    fail: (err) => {
      const message = JSON.stringify(err)
      console.log(message, 'socket连接失败')

      if (message.includes('url not in domain list')) {
        ws.emit('error', `当前 Socket 地址未在小程序合法域名列表中：${endpoint}`)
      }
      else {
        ws.emit('error', message)
      }
    },
    complete: (res) => {
      console.log(res, 'complete')
    },
  })

  const socketTask = wsEx.socketInstance as UniNamespace.SocketTask | null
  if (!socketTask) {
    throw new Error('实时对话 socketInstance 创建失败')
  }

  socketTask.onOpen((res) => {
    wsEx.isConnect = true
    ws.emit('open', res)
  })
  socketTask.onClose((e: UniSocketCloseEvent) => {
    wsEx.isConnect = false
    ws.emit('close', e.reason || `close:${e.code ?? ''}`)
  })
  socketTask.onError((e) => {
    wsEx.isConnect = false
    console.log('捕获到了错误啦', e)

    ws.emit('error', JSON.stringify(e))
  })

  await new Promise<void>((resolve, reject) => {
    function cleanup() {
      ws.off?.('open', onOpen as any)
      ws.off?.('error', onError as any)
    }
    function onOpen() {
      cleanup()
      resolve()
    }
    function onError(err?: string) {
      cleanup()
      reject(new Error(err || 'WebSocket 连接失败'))
    }
    ws.on('open', onOpen as any)
    ws.on('error', onError as any)
  })

  return ws
}

function resetStreamingBuffers() {
  currentAssistantAudioChunks = []
  currentAssistantTextChunks = []
  sentAudioChunkCount = 0
  sentAudioBytes = 0
}

function appendChat(role: ChatRole, text: string, audioUrl?: string) {
  chatList.value = [
    ...chatList.value,
    { id: genId(), role, text, audioUrl },
  ]
}

async function finalizeAssistantAudioIfAny() {
  clearAssistantAudioFlushTimer()
  if (!currentAssistantAudioChunks.length)
    return
  const merged = concatUint8Arrays(currentAssistantAudioChunks)
  currentAssistantAudioChunks = []
  const url = buildAudioUrl(merged, format.value)
  revokeAudioUrl(currentAudioUrl.value)
  currentAudioUrl.value = url

  const text = currentAssistantTextChunks.join('').trim() || '（语音回复）'
  currentAssistantTextChunks = []
  appendChat('assistant', text, url)

  const innerAudio = getInnerAudioContext()
  if (innerAudio) {
    try {
      innerAudio.stop()
    }
    catch {}
    innerAudio.src = url
    innerAudio.play()
  }

  await nextTick()
  try {
    await audioEl.value?.play?.()
  }
  catch (e) {
    pushLog(`自动播放失败: ${String(e)}`)
  }
}

async function receiveLoop(ws: WebSocket, token: number) {
  while (true) {
    if (disposed || wsRef !== ws || token !== receiveLoopTaskToken)
      break

    const msg = await ReceiveMessage(ws)

    if (msg.type === MsgType.Error) {
      const payload = gunzipMaybe(msg.payload, msg.compression)
      throw new Error(decodeUtf8(payload) || '服务端错误')
    }

    if (msg.type === MsgType.AudioOnlyServer) {
      const payload = gunzipMaybe(msg.payload, msg.compression)
      currentAssistantAudioChunks.push(payload)
      scheduleAssistantAudioFlush()
      continue
    }

    if (msg.type !== MsgType.FullServerResponse) {
      continue
    }

    const payload = parsePayloadJson(msg)
    const event = msg.event ?? 0

    if (event === DialogEvent.SessionStarted) {
      isReady.value = true
      statusText.value = '会话已建立'
      pushLog('收到 SessionStarted')
    }
    else if (event === DialogEvent.ChatResponse) {
      if (payload && typeof payload === 'object') {
        const text = payload.content || payload.reply || payload.text || ''
        if (text)
          currentAssistantTextChunks.push(String(text))
      }
    }
    else if (event === DialogEvent.TTSEnded) {
      if (!helloFinished.value) {
        helloFinished.value = true
        if (dialogMode.value === 'text')
          statusText.value = '已就绪，可输入文本对话'
        pushLog('欢迎语播放结束')
      }
      await finalizeAssistantAudioIfAny()
      if (dialogMode.value === 'text')
        isSending.value = false
    }
    else if (event === DialogEvent.ASRInfo || event === DialogEvent.ASRResponse || event === DialogEvent.ASREnded) {
      pushLog(`ASR事件: ${event}`)
    }
    else if (event === DialogEvent.SessionFinished || event === DialogEvent.SessionFailed) {
      statusText.value = event === DialogEvent.SessionFinished ? '会话结束' : '会话失败'
      isReady.value = false
      break
    }
  }
}

/**
 * Create websocket connection, start dialog session and enter selected mode.
 */
async function connectDialog() {
  if (isConnecting.value || isReady.value)
    return

  errorText.value = ''
  isConnecting.value = true
  statusText.value = '连接中...'
  resetStreamingBuffers()

  try {
    const runtimeInfo = uni.getSystemInfoSync() as Record<string, any>
    const endpoint = resolveSocketEndpoint(runtimeInfo)
    if (String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase() === 'mp-weixin' && !DIALOG_ENDPOINT_MP_WX) {
      throw new Error('微信小程序未配置 VITE_MP_WX_DIALOG_ENDPOINT。请使用已在微信后台配置为合法域名的 wss 代理地址。')
    }
    pushLog(`连接地址: ${endpoint}`)
    const ws = await createProtocolSocket(createHeaders(), endpoint)
    pushLog(`连接成功: await createProtocolSocket(createHeaders(), endpoint)`)

    wsRef = ws
    sessionIdRef = genId()
    receiveLoopTaskToken += 1
    const token = receiveLoopTaskToken

    pushLog('发送 StartConnection')
    await sendDialogEvent(ws, DialogEvent.StartConnection, {})
    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.ConnectionStarted)

    await sendDialogEvent(ws, DialogEvent.StartSession, buildStartSessionPayload(), {
      sessionId: sessionIdRef,
    })
    await WaitForEvent(ws, MsgType.FullServerResponse, DialogEvent.SessionStarted as any)
    isReady.value = true
    statusText.value = '会话已建立'
    pushLog('收到 SessionStarted')

    void receiveLoop(ws, token).catch((e) => {
      const msg = e instanceof Error ? e.message : String(e)
      errorText.value = msg
      statusText.value = '接收中断'
      pushLog(`接收循环异常: ${msg}`)
    })

    if (dialogMode.value === 'text') {
      await sendHello()
    }
    else if (dialogMode.value === 'audio') {
      await sendHello()
      await waitForHelloEnded()
      await sendChatTextQuery(ws, sessionIdRef, '你好，我也叫豆包')
      await startMicrophoneStreaming()
    }
    else if (dialogMode.value === 'audio_file') {
      await sendAudioFileChunks()
    }
  }
  catch (e) {
    errorText.value = e instanceof Error ? e.message : String(e)
    console.log(errorText.value, 'errorText.value')

    statusText.value = '连接失败'
    pushLog(`连接失败: ${errorText.value}`)
    await disconnectDialog()
  }
  finally {
    isConnecting.value = false
  }
}

async function sendHello() {
  if (!wsRef || !sessionIdRef)
    return
  helloFinished.value = false
  await sendSayHello(wsRef, sessionIdRef)
  statusText.value = '欢迎语播放中...'
}

async function waitForHelloEnded(timeoutMs = 20000) {
  const start = Date.now()
  while (isReady.value && !helloFinished.value && Date.now() - start < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  if (!helloFinished.value)
    pushLog('未在超时时间内收到 TTSEnded，继续后续流程')
}

async function sendText() {
  const content = userInput.value.trim()
  if (!content) {
    errorText.value = '请输入文本内容'
    return
  }
  if (!wsRef || !isReady.value) {
    errorText.value = '请先建立对话连接'
    return
  }

  errorText.value = ''
  isSending.value = true
  appendChat('user', content)
  userInput.value = ''
  currentAssistantTextChunks = []
  currentAssistantAudioChunks = []
  statusText.value = '发送文本并等待回复...'

  try {
    await sendChatTextQuery(wsRef, sessionIdRef, content)
  }
  catch (e) {
    isSending.value = false
    errorText.value = e instanceof Error ? e.message : String(e)
  }
}

async function disconnectDialog() {
  const ws = wsRef
  clearAssistantAudioFlushTimer()
  clearFrameWatchTimer()
  try {
    innerAudioContext?.stop()
  }
  catch {}
  wsRef = null
  isReady.value = false
  helloFinished.value = false
  isSending.value = false
  isSendingFile.value = false
  stopRecorder()
  receiveLoopTaskToken += 1
  statusText.value = '已断开'

  if (!ws)
    return

  try {
    if (sessionIdRef) {
      // Dialogue FinishSession 使用 gzip
      await sendDialogEvent(ws, DialogEvent.FinishSession, {}, { sessionId: sessionIdRef })
    }
  }
  catch (e) {
    pushLog(`FinishSession 失败: ${String(e)}`)
  }

  try {
    await sendDialogEvent(ws, DialogEvent.FinishConnection, {})
    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.ConnectionFinished)
  }
  catch (e) {
    pushLog(`FinishConnection 失败: ${String(e)}`)
  }

  try {
    ws.closeSocket?.('manual-close')
  }
  catch {
    try {
      ;(ws as any).socketInstance?.close?.({ reason: 'manual-close' })
    }
    catch {}
  }

  if (currentLogHandler) {
    ws.off?.('log', currentLogHandler as any)
    currentLogHandler = null
  }
}

async function handleConnectAction() {
  if (!isReady.value && !isConnecting.value) {
    await connectDialog()
  }
  else {
    await disconnectDialog()
  }
}

function handleSpeakerChange(event: { detail?: { value?: string | number } }) {
  const index = Number(event?.detail?.value)
  if (!Number.isNaN(index) && index >= 0 && index < DIALOG_SPEAKERS.length) {
    speakerIndex.value = index
  }
}

onBeforeUnmount(async () => {
  disposed = true
  clearAssistantAudioFlushTimer()
  clearFrameWatchTimer()
  revokeAudioUrl(currentAudioUrl.value)
  try {
    innerAudioContext?.stop()
    innerAudioContext?.destroy?.()
  }
  catch {}
  innerAudioContext = null
  for (const item of chatList.value) {
    if (item.audioUrl)
      revokeAudioUrl(item.audioUrl)
  }
  await disconnectDialog()
})
</script>

<template>
  <view class="dialog-page">
    <view class="panel hero">
      <view class="hero-top">
        <view>
          <view class="eyebrow">
            Realtime Dialogue
          </view>
          <view class="title">
            实时对话
          </view>
          <!-- <view class="subtitle">
            复用同一协议流程：StartConnection / StartSession / ChatTextQuery / 接收流式音频 / FinishSession
          </view> -->
        </view>
        <view class="status" :class="{ active: isReady, loading: isConnecting }">
          {{ statusText }}
        </view>
      </view>

      <view class="grid-two">
        <view class="field">
          <view class="label">
            运行模式
          </view>
          <radio-group class="radio-row">
            <label class="radio-item">
              <radio value="text" :checked="dialogMode === 'text'" :disabled="isReady || isConnecting" @click="dialogMode = 'text'" />
              <text>纯文本对话</text>
            </label>
            <label class="radio-item">
              <radio value="audio" :checked="dialogMode === 'audio'" :disabled="isReady || isConnecting" @click="dialogMode = 'audio'" />
              <text>麦克风实时输入（App）</text>
            </label>
            <label class="radio-item">
              <radio value="audio_file" :checked="dialogMode === 'audio_file'" :disabled="isReady || isConnecting" @click="dialogMode = 'audio_file'" />
              <text>音频文件输入</text>
            </label>
          </radio-group>
        </view>

        <view class="field">
          <view class="label">
            发音人
          </view>
          <picker
            mode="selector"
            :range="DIALOG_SPEAKERS"
            range-key="label"
            :value="speakerIndex"
            :disabled="isReady || isConnecting"
            @change="handleSpeakerChange"
          >
            <view class="select-box">
              <view class="select-title">
                {{ selectedSpeaker.label }}
              </view>
              <view class="select-sub">
                {{ selectedSpeaker.value }}
              </view>
            </view>
          </picker>
        </view>

        <view class="field">
          <view class="label">
            音频格式（推荐 pcm_s16le）
          </view>
          <radio-group class="radio-row">
            <label class="radio-item">
              <radio value="pcm_s16le" :checked="format === 'pcm_s16le'" :disabled="isReady || isConnecting" @click="format = 'pcm_s16le'" />
              <text>pcm_s16le（可播放，前端封装为 wav）</text>
            </label>
            <label class="radio-item">
              <radio value="pcm" :checked="format === 'pcm'" :disabled="isReady || isConnecting" @click="format = 'pcm'" />
              <text>pcm（仅调试，页面不直接播放）</text>
            </label>
          </radio-group>
        </view>
      </view>

      <view v-if="dialogMode === 'audio_file'" class="field">
        <view class="label">
          音频文件（App 本地路径）
        </view>
        <view class="row">
          <view class="field grow">
            <input v-model="audioFilePath" class="input" placeholder="请选择或输入本地音频文件路径" :disabled="isReady || isConnecting || isSendingFile">
          </view>
          <button class="secondary-btn small-btn" :disabled="isReady || isConnecting || isSendingFile" @click="pickAudioFile">
            选择文件
          </button>
        </view>
      </view>

      <view class="field">
        <button class="secondary-btn ghost-btn" :disabled="isReady || isConnecting" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '收起高级参数' : '展开高级参数' }}
        </button>
      </view>

      <view v-if="showAdvanced" class="field">
        <view class="label">
          Bot 名称
        </view>
        <input v-model="botName" class="input" :disabled="isReady || isConnecting">
      </view>

      <view v-if="showAdvanced" class="field">
        <view class="label">
          system_role
        </view>
        <textarea v-model="systemRole" class="textarea small" :disabled="isReady || isConnecting" />
      </view>

      <view v-if="showAdvanced" class="field">
        <view class="label">
          speaking_style
        </view>
        <textarea v-model="speakingStyle" class="textarea small" :disabled="isReady || isConnecting" />
      </view>

      <view class="row">
        <view v-if="showAdvanced" class="field grow">
          <view class="label">
            recv_timeout（10-120）
          </view>
          <input v-model="recvTimeout" type="number" class="input" :disabled="isReady || isConnecting">
        </view>
        <button class="connect-btn" :class="{ danger: isReady }" :loading="isConnecting" @click="handleConnectAction">
          {{ isReady || isConnecting ? (isConnecting ? '连接中...' : '断开会话') : '建立会话' }}
        </button>
      </view>

      <view v-if="dialogMode === 'audio'" class="empty" style="margin-top: 6rpx; margin-bottom: 10rpx;">
        麦克风模式会在建立会话成功后自动开始采集并发送；“停止麦克风”仅用于调试中断采集。
      </view>

      <view v-if="errorText" class="error-box">
        {{ errorText }}
      </view>
    </view>

    <view class="panel">
      <view class="section-title">
        文本对话
      </view>
      <view class="composer">
        <textarea
          v-model="userInput"
          class="textarea"
          :maxlength="2000"
          :placeholder="dialogMode === 'text' ? '输入要发送给对话模型的文本' : '当前模式不使用文本输入'"
          :disabled="dialogMode !== 'text' || !isReady || isSending"
        />
        <view class="composer-actions">
          <button class="secondary-btn" :disabled="!isReady || dialogMode !== 'text'" @click="sendHello">
            发送欢迎语
          </button>
          <button
            v-if="dialogMode === 'text'"
            class="primary-btn"
            type="primary"
            :disabled="!isReady || isSending"
            @click="sendText"
          >
            {{ isSending ? '等待回复中...' : '发送文本' }}
          </button>
          <button
            v-else-if="dialogMode === 'audio'"
            class="primary-btn"
            type="primary"
            :disabled="!isReady"
            @click="isRecording ? stopRecorder() : startMicrophoneStreaming()"
          >
            {{ isRecording ? '停止麦克风（调试）' : '重新开始麦克风' }}
          </button>
          <button
            v-else
            class="primary-btn"
            type="primary"
            :disabled="!isReady || isSendingFile || !audioFilePath"
            @click="sendAudioFileChunks"
          >
            {{ isSendingFile ? '发送文件中...' : '发送音频文件' }}
          </button>
        </view>
      </view>
      <audio ref="audioEl" class="audio-player" :src="currentAudioUrl" controls autoplay />
    </view>

    <view class="panel">
      <view class="section-title">
        对话记录
      </view>
      <view v-if="!chatList.length" class="empty">
        建立会话后发送文本，这里会显示用户消息和助手回复（含音频）。
      </view>
      <view v-else class="chat-list">
        <view v-for="item in chatList" :key="item.id" class="chat-item" :class="item.role">
          <view class="chat-role">
            {{ item.role === 'user' ? '我' : item.role === 'assistant' ? '助手' : '系统' }}
          </view>
          <view class="chat-text">
            {{ item.text }}
          </view>
          <audio v-if="item.audioUrl" class="chat-audio" :src="item.audioUrl" controls />
        </view>
      </view>
    </view>

    <view class="panel">
      <view class="section-title">
        运行日志
      </view>
      <scroll-view scroll-y class="log-box">
        <view v-for="(line, idx) in logs" :key="`${idx}-${line}`" class="log-line">
          {{ line }}
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.dialog-page {
  min-height: 100vh;
  padding: 24rpx;
  background:
    radial-gradient(circle at 8% 6%, rgba(251, 191, 36, 0.18), transparent 44%),
    radial-gradient(circle at 88% 10%, rgba(14, 165, 233, 0.16), transparent 42%),
    linear-gradient(180deg, #f6f8fc 0%, #eef2f7 100%);
}

.panel {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24rpx;
  padding: 22rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 10rpx 30rpx rgba(15, 23, 42, 0.06);
}

.hero-top {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: flex-start;
  margin-bottom: 18rpx;
}

.eyebrow {
  display: inline-block;
  font-size: 20rpx;
  color: #7c3e00;
  background: #ffefc2;
  border-radius: 999rpx;
  padding: 5rpx 12rpx;
  margin-bottom: 10rpx;
}

.title {
  font-size: 34rpx;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.28;
}

.subtitle {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #64748b;
  line-height: 1.45;
}

.status {
  flex-shrink: 0;
  max-width: 300rpx;
  background: #eef2f7;
  color: #334155;
  border: 1px solid #dbe4ee;
  border-radius: 16rpx;
  padding: 10rpx 14rpx;
  font-size: 22rpx;
}

.status.loading {
  background: #e0f2fe;
  border-color: #bae6fd;
  color: #075985;
}

.status.active {
  background: #ecfdf5;
  border-color: #bbf7d0;
  color: #166534;
}

.grid-two {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14rpx;
}

.field {
  margin-bottom: 14rpx;
}

.field.grow {
  flex: 1;
  margin-bottom: 0;
}

.label {
  font-size: 23rpx;
  color: #1e293b;
  font-weight: 600;
  margin-bottom: 10rpx;
}

.input,
.textarea,
.select-box {
  width: 100%;
  box-sizing: border-box;
  border-radius: 16rpx;
  border: 1px solid #dbe4ee;
  background: #fbfdff;
  color: #0f172a;
}

.input {
  height: 82rpx;
  padding: 0 16rpx;
  font-size: 26rpx;
}

.textarea {
  min-height: 180rpx;
  padding: 16rpx;
  font-size: 26rpx;
  line-height: 1.5;
}

.textarea.small {
  min-height: 130rpx;
}

.select-box {
  padding: 16rpx;
}

.select-title {
  font-size: 24rpx;
  font-weight: 600;
}

.select-sub {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #64748b;
  word-break: break-all;
}

.radio-row {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 14rpx 16rpx;
  border-radius: 16rpx;
  border: 1px solid #dbe4ee;
  background: #fbfdff;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: #334155;
  font-size: 22rpx;
}

.row {
  display: flex;
  gap: 14rpx;
  align-items: flex-end;
}

.connect-btn {
  min-width: 180rpx;
  height: 82rpx;
  line-height: 82rpx;
  border-radius: 16rpx;
  background: #0ea5e9;
  color: #fff;
  border: none;
}

.connect-btn.danger {
  background: #ef4444;
}

.error-box {
  margin-top: 10rpx;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #be123c;
  border-radius: 16rpx;
  padding: 14rpx;
  font-size: 23rpx;
}

.section-title {
  font-size: 25rpx;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 12rpx;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.composer-actions {
  display: flex;
  gap: 12rpx;
}

.primary-btn,
.secondary-btn {
  flex: 1;
  border-radius: 16rpx;
}

.secondary-btn {
  background: #e2e8f0;
  color: #1e293b;
}

.ghost-btn {
  width: 100%;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  color: #334155;
}

.small-btn {
  flex: 0 0 auto;
  min-width: 140rpx;
}

.audio-player {
  width: 100%;
  margin-top: 12rpx;
}

.empty {
  color: #64748b;
  font-size: 22rpx;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.chat-item {
  border-radius: 16rpx;
  padding: 14rpx;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.chat-item.user {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.chat-item.assistant {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.chat-role {
  display: inline-block;
  margin-bottom: 8rpx;
  font-size: 20rpx;
  padding: 4rpx 10rpx;
  border-radius: 999rpx;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
}

.chat-text {
  font-size: 24rpx;
  line-height: 1.55;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-audio {
  width: 100%;
  margin-top: 10rpx;
}

.log-box {
  max-height: 340rpx;
  background: #0b1220;
  border-radius: 16rpx;
  padding: 12rpx;
  box-sizing: border-box;
}

.log-line {
  font-size: 20rpx;
  color: #cbd5e1;
  font-family: Consolas, 'Courier New', monospace;
  line-height: 1.5;
  margin-bottom: 6rpx;
  word-break: break-all;
}

@media (min-width: 768px) {
  .dialog-page {
    max-width: 980px;
    margin: 0 auto;
    padding: 24px;
  }

  .grid-two {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
