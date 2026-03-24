<route lang="json" type="page">
{
  "style": {
    "navigationBarTitleText": "播客 TTS 测试"
  }
}
</route>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { speakerOptions } from '../boke/voice'
import { APPID, AccessToken, SecretKey, sockBaseUrl, sockBaseUrlMpWx } from './access'
import {
  EventType,
  FinishConnection,
  FinishSession,
  MsgType,
  ReceiveMessage,
  StartConnection,
  StartSession,
  WaitForEvent,
} from './protocols'
import { WebSocket } from '@/store/modules/socket/webSocket'
import { isApp, isWeixin } from '@/utils/helpers/system'

interface PodcastRoundText {
  speaker: string
  text: string
}

interface UniSocketCloseEvent {
  code?: number
  reason?: string
}

interface GenerateModeOption {
  label: string
  value: 0 | 3 | 4
  desc: string
}

interface PodcastNlpText {
  speaker: string
  text: string
}

const generateModeOptions: GenerateModeOption[] = [
  { label: '摘要生成播客', value: 0, desc: '根据 input_text 总结生成播客' },
  { label: '对话直出播客', value: 3, desc: '根据 nlp_texts 直接生成播客' },
  { label: 'Prompt 联网播客', value: 4, desc: '根据 prompt_text 联网生成播客' },
]

const inputText = ref('什么是脑机接口')
const promptText = ref('医疗领域')
const selectedGenerateModeIndex = ref(0)
const nlpTextsInput = ref('[\n  {\n    "speaker": "嘉宾A",\n    "text": "今天我们聊聊怎么平衡工作和生活。"\n  },\n  {\n    "speaker": "嘉宾B",\n    "text": "我觉得先从管理精力开始，比管理时间更重要。"\n  }\n]')
const selectedSpeakerIndex = ref(0)
const selectedSpeakerIndex2 = ref(1)
const useHeadMusic = ref(false)
const useTailMusic = ref(false)
const isLoading = ref(false)
const statusText = ref('等待输入')
const errorText = ref('')
const logs = ref<string[]>([])
const audioSrc = ref('')
const audioBytes = ref(0)
const audioData = ref<Uint8Array | null>(null)
const podcastTexts = ref<PodcastRoundText[]>([])
const audioEl = ref<HTMLAudioElement | null>(null)
const isDownloading = ref(false)

let currentSocket: WebSocket | null = null
let currentLogHandler: ((msg: string) => void) | null = null
const selectedGenerateMode = computed(() => generateModeOptions[selectedGenerateModeIndex.value] ?? generateModeOptions[0])
const selectedSpeaker = computed(() => speakerOptions[selectedSpeakerIndex.value] ?? speakerOptions[0])
const selectedSpeaker2 = computed(() => speakerOptions[selectedSpeakerIndex2.value] ?? speakerOptions[1] ?? speakerOptions[0])

/**
 * 获取运行时全局 `Buffer`。
 *
 * 优先使用它处理 UTF-8 编解码，以兼容不同运行环境。
 *
 * @returns 可用的全局 `Buffer`，不存在时返回 `undefined`
 */
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

/**
 * 将字符串编码为 UTF-8 字节数组。
 *
 * 编码策略：
 * - 优先使用运行时全局 `Buffer.from(value, 'utf8')`
 * - 不存在 `Buffer` 时回退到纯 JavaScript UTF-8 编码
 *
 * @param value - 待编码的字符串
 * @returns UTF-8 字节数组
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
 * 将 UTF-8 字节数组解码为字符串。
 *
 * 为兼容部分运行环境，这里使用纯 JavaScript 实现，
 * 避免依赖 `TextDecoder`。
 *
 * @param bytes - 待解码的字节数组
 * @returns 解码后的字符串
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
 * 写入页面日志，并仅保留最近 50 条记录。
 *
 * @param message - 日志文本
 */
function pushLog(message: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`
  logs.value = [line, ...logs.value].slice(0, 50)
}

/**
 * 生成连接或会话使用的唯一 ID。
 *
 * @returns 简单的 UUID 风格字符串
 */
function genId(): string {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)
  return `${Date.now().toString(16)}-${random()}-${random()}-${random()}-${random()}${random()}`
}

/**
 * 等待指定的毫秒数。
 *
 * @param ms - 毫秒数
 * @returns 在等待结束后完成的 Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 合并多段音频字节数据。
 *
 * @param chunks - 音频分片数组
 * @returns 合并后的字节数据
 */
function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, item) => sum + item.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength)
  copied.set(bytes)
  return copied.buffer
}

/**
 * 将二进制音频转换为可播放地址。
 *
 * 优先生成 `Blob URL`，回退时再尝试生成 Base64 Data URL。
 *
 * @param bytes - 音频字节数据
 * @param format - 音频格式，例如 `mp3`
 * @returns 可直接绑定到 `<audio>` 的播放地址
 */
function buildAudioUrl(bytes: Uint8Array, format: string): string {
  const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg'

  if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    let arrayBuffer: ArrayBuffer

    const rawBuffer = bytes.buffer

    if (rawBuffer instanceof SharedArrayBuffer) {
      // 必须复制为真正的 ArrayBuffer
      const copied = new Uint8Array(bytes.byteLength)
      copied.set(
        new Uint8Array(
          rawBuffer,
          bytes.byteOffset,
          bytes.byteLength,
        ),
      )
      arrayBuffer = copied.buffer
    }
    else {
      // 这里可以安全地收窄为 ArrayBuffer
      arrayBuffer = rawBuffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      )
    }

    return URL.createObjectURL(
      new Blob([arrayBuffer], { type: mime }),
    )
  }

  const uniAny = uni as unknown as {
    arrayBufferToBase64?: (buffer: ArrayBuffer) => string
  }

  if (typeof uniAny.arrayBufferToBase64 === 'function') {
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer

    const base64 = uniAny.arrayBufferToBase64(buffer)

    return `data:${mime};base64,${base64}`
  }

  throw new Error('当前环境不支持生成音频播放地址')
}

/**
 * 释放旧的 Blob URL，避免重复创建后占用内存。
 *
 * @param url - 旧的音频地址
 */
function revokeAudioUrl(url: string) {
  if (!url)
    return
  if (typeof URL !== 'undefined' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

function getAudioFileName() {
  return `podcast_${Date.now()}.mp3`
}

function parseNlpTextsInput(value: string): PodcastNlpText[] {
  const trimmed = value.trim()
  if (!trimmed)
    return []

  const parsed = JSON.parse(trimmed)
  if (!Array.isArray(parsed)) {
    throw new TypeError('nlp_texts 必须是数组')
  }

  return parsed.map((item, index) => {
    const speaker = String(item?.speaker ?? '').trim()
    const text = String(item?.text ?? '').trim()
    if (!speaker || !text) {
      throw new TypeError(`nlp_texts 第 ${index + 1} 项缺少 speaker 或 text`)
    }
    return { speaker, text }
  })
}

function getLocalAudioDirectory() {
  if (isApp && typeof plus !== 'undefined') {
    return `${plus.io.convertLocalFileSystemURL('_doc/')}/`
  }

  if (isWeixin) {
    const wxAny = globalThis as unknown as {
      wx?: {
        env?: {
          USER_DATA_PATH?: string
        }
      }
    }
    return wxAny.wx?.env?.USER_DATA_PATH || ''
  }

  return ''
}

function saveBlobAudio(bytes: Uint8Array) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    throw new TypeError('当前环境不支持浏览器下载')
  }

  const link = document.createElement('a')
  const objectUrl = URL.createObjectURL(new Blob([toArrayBuffer(bytes)], { type: 'audio/mpeg' }))
  link.href = objectUrl
  link.download = getAudioFileName()
  link.click()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

function writeAudioToLocalFile(bytes: Uint8Array) {
  const uniAny = uni as unknown as {
    arrayBufferToBase64?: (buffer: ArrayBuffer) => string
    getFileSystemManager?: () => {
      writeFileSync?: (filePath: string, data: string, encoding?: string) => void
    }
    saveFile?: (options: {
      tempFilePath: string
      success?: (res: { savedFilePath: string }) => void
      fail?: (err: unknown) => void
    }) => void
  }

  if (typeof uniAny.arrayBufferToBase64 !== 'function' || typeof uniAny.getFileSystemManager !== 'function') {
    throw new TypeError('当前环境不支持写入本地音频文件')
  }

  const fs = uniAny.getFileSystemManager()
  const baseDir = getLocalAudioDirectory()
  if (!baseDir || typeof fs?.writeFileSync !== 'function') {
    throw new Error('当前环境缺少可写目录')
  }

  const tempFilePath = `${baseDir}/${getAudioFileName()}`
  const base64 = uniAny.arrayBufferToBase64(toArrayBuffer(bytes))
  fs.writeFileSync(tempFilePath, base64, 'base64')

  return new Promise<string>((resolve, reject) => {
    if (typeof uniAny.saveFile !== 'function') {
      resolve(tempFilePath)
      return
    }

    uniAny.saveFile({
      tempFilePath,
      success: res => resolve(res.savedFilePath || tempFilePath),
      fail: err => reject(err),
    })
  })
}

async function downloadAudio() {
  if (!audioData.value?.length) {
    uni.showToast({
      title: '请先生成音频',
      icon: 'none',
    })
    return
  }

  isDownloading.value = true
  try {
    if (typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      saveBlobAudio(audioData.value)
      pushLog('已触发浏览器音频下载')
      uni.showToast({
        title: '开始下载',
        icon: 'success',
      })
      return
    }

    const savedFilePath = await writeAudioToLocalFile(audioData.value)
    pushLog(`音频已保存: ${savedFilePath}`)
    uni.showModal({
      title: '下载完成',
      content: `音频已保存到：${savedFilePath}`,
      showCancel: false,
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    pushLog(`下载失败: ${message}`)
    uni.showToast({
      title: '下载失败',
      icon: 'none',
    })
  }
  finally {
    isDownloading.value = false
  }
}

/**
 * 创建供协议层使用的 WebSocket 实例，而不修改现有 `WebSocket` 类文件。
 *
 * 处理方式：
 * - 仍然使用 `new WebSocket(...)` 创建实例
 * - 由页面层通过 `uni.connectSocket` 传入鉴权请求头
 * - 将底层 `SocketTask` 挂到实例的 `socketInstance` 上
 * - 仅向协议层转发 `open`、`close`、`error` 事件，消息体仍由 `socketInstance.onMessage` 处理
 *
 * @param headers - 连接请求头
 * @param endpoint - WebSocket 连接地址
 * @returns 已完成连接的 `WebSocket` 实例
 */
function resolveSocketEndpoint(runtimeInfo?: Record<string, any>) {
  const info = runtimeInfo ?? (uni.getSystemInfoSync() as Record<string, any>)
  const uniPlatform = String(info?.uniPlatform || info?.platform || '').toLowerCase()
  if (uniPlatform === 'mp-weixin' && sockBaseUrlMpWx)
    return sockBaseUrlMpWx
  return sockBaseUrl
}

async function createProtocolSocket(headers: Record<string, string>, endpoint: string): Promise<WebSocket> {
  const ws = new WebSocket(endpoint)
  const wsEx = ws as any

  // 接入页面日志，复用封装类自身的事件体系，便于排查连接状态
  currentLogHandler = (msg: string) => pushLog(`socket: ${msg}`)
  ws.on('log', currentLogHandler as any)
  ws.on('open', () => pushLog('socket: open'))
  ws.on('close', reason => pushLog(`socket: close ${reason || ''}`))
  ws.on('error', err => pushLog(`socket: error ${err || ''}`))

  wsEx.isCreate = false
  wsEx.isConnect = false
  wsEx.isInitiative = false

  // 不修改你现有封装源码，这里只负责创建带鉴权请求头的底层 SocketTask。
  // 随后再挂回现有 WebSocket 实例，后续协议层仍按原来的方式使用该实例。
  wsEx.socketInstance = uni.connectSocket({
    url: endpoint,
    header: {
      'content-type': 'application/json',
      ...headers,
    },
    success: () => {
      wsEx.isCreate = true
      ws.emit('connect')
    },
    fail: (err) => {
      const message = JSON.stringify(err)
      if (message.includes('url not in domain list')) {
        ws.emit('error', `当前 Socket 地址未在小程序合法域名列表中：${endpoint}`)
      }
      else {
        pushLog(`连接创建失败: ${message}`)
        ws.emit('error', message)
      }
    },
  })

  const socketTask = wsEx.socketInstance as UniNamespace.SocketTask | null
  if (!socketTask) {
    throw new Error('socketInstance 创建失败')
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

  pushLog('WebSocket connected')
  return ws
}

/**
 * 关闭当前 socket（如果存在）。
 */
function closeCurrentSocket() {
  if (!currentSocket)
    return
  try {
    currentSocket.closeSocket?.('page-close')
  }
  catch {
    try {
      ;(currentSocket as any).socketInstance?.close?.({
        reason: 'page-close',
      })
    }
    catch {}
  }

  if (currentLogHandler) {
    currentSocket.off?.('log', currentLogHandler as any)
    currentLogHandler = null
  }
  currentSocket = null
}

/**
 * 根据页面输入构建播客 TTS 请求参数。
 *
 * @returns 发送前会被 `JSON.stringify` 的请求对象
 */
function buildRequestParams() {
  const action = selectedGenerateMode.value.value
  const nlpTexts = action === 3 ? parseNlpTextsInput(nlpTextsInput.value) : []

  return {
    input_id: `podcast_${Date.now()}`,
    input_text: action === 4 ? '' : inputText.value.trim(),
    prompt_text: action === 4 ? promptText.value.trim() : '',
    action,
    speaker_info: {
      random_order: false,
      // 发音人
      speakers: [selectedSpeaker.value.value, selectedSpeaker2.value.value],
    },
    nlp_texts: nlpTexts,
    use_head_music: useHeadMusic.value,
    use_tail_music: useTailMusic.value,
    input_info: {
      input_url: '',
      return_audio_url: false,
      only_nlp_text: false,
    },
    audio_config: {
      format: 'mp3',
      sample_rate: 24000,
      speech_rate: 0,
    },
  }
}

/**
 * 处理发音人选择变化。
 *
 * @param event - `picker` 变更事件
 */
function handleSpeakerChange(event: { detail?: { value?: string | number } }) {
  const index = Number(event?.detail?.value)
  if (!Number.isNaN(index) && index >= 0 && index < speakerOptions.length) {
    selectedSpeakerIndex.value = index
  }
}

/**
 * 处理第二个发音人选择变化。
 *
 * @param event - `picker` 变更事件
 */
function handleSpeakerChange2(event: { detail?: { value?: string | number } }) {
  const index = Number(event?.detail?.value)
  if (!Number.isNaN(index) && index >= 0 && index < speakerOptions.length) {
    selectedSpeakerIndex2.value = index
  }
}

/**
 * 处理生成模式选择变化。
 *
 * @param event - `picker` 变更事件
 */
function handleGenerateModeChange(event: { detail?: { value?: string | number } }) {
  const index = Number(event?.detail?.value)
  if (!Number.isNaN(index) && index >= 0 && index < generateModeOptions.length) {
    selectedGenerateModeIndex.value = index
  }
}

/**
 * 生成播客音频并自动播放。
 */
async function generatePodcast() {
  const action = selectedGenerateMode.value.value
  const text = inputText.value.trim()
  const prompt = promptText.value.trim()

  if ((action === 0 || action === 3) && !text) {
    errorText.value = '请输入 input_text'
    return
  }

  if (action === 4 && !prompt) {
    errorText.value = 'action = 4 时请填写 prompt_text'
    return
  }

  if (action === 3) {
    try {
      parseNlpTextsInput(nlpTextsInput.value)
    }
    catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
      return
    }
  }

  if (!APPID || !AccessToken || !SecretKey) {
    errorText.value = '请先在 access.ts 中配置 APPID / AccessToken / SecretKey'
    return
  }

  if (selectedSpeaker.value.value === selectedSpeaker2.value.value) {
    errorText.value = 'Please select two different speakers'
    return
  }

  revokeAudioUrl(audioSrc.value)
  audioSrc.value = ''
  audioBytes.value = 0
  audioData.value = null
  podcastTexts.value = []
  errorText.value = ''
  logs.value = []
  isLoading.value = true
  statusText.value = '正在连接服务...'

  const headers = {
    'X-Api-App-Id': String(APPID),
    'X-Api-App-Key': String(SecretKey),
    'X-Api-Access-Key': String(AccessToken),
    'X-Api-Resource-Id': 'volc.service_type.10050',
    'X-Api-Connect-Id': genId(),
  }

  const audioChunks: Uint8Array[] = []
  let ws: WebSocket | null = null

  try {
    pushLog('准备建立连接')
    const runtimeInfo = uni.getSystemInfoSync() as Record<string, any>
    const endpoint = resolveSocketEndpoint(runtimeInfo)
    if (String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase() === 'mp-weixin' && !sockBaseUrlMpWx) {
      throw new Error('微信小程序未配置 VITE_MP_WX_PODCAST_ENDPOINT。请使用已在微信后台配置为合法域名的 wss 代理地址。')
    }
    pushLog(`连接地址: ${endpoint}`)
    ws = await createProtocolSocket(headers, endpoint)
    currentSocket = ws

    statusText.value = '发送连接初始化...'
    await StartConnection(ws)
    pushLog('已发送 StartConnection')

    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.ConnectionStarted)
    pushLog('收到 ConnectionStarted')

    const sessionId = genId()
    const reqParams = buildRequestParams()
    statusText.value = '发送会话请求...'
    await StartSession(
      ws,
      encodeUtf8(JSON.stringify(reqParams)),
      sessionId,
    )
    pushLog(`已发送 StartSession: ${sessionId}`)

    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.SessionStarted)
    pushLog('收到 SessionStarted')

    await FinishSession(ws, sessionId)
    pushLog('已发送 FinishSession，等待服务端流式返回')
    statusText.value = '正在生成音频，请稍候...'

    while (true) {
      const msg = await ReceiveMessage(ws)

      if (msg.type === MsgType.Error) {
        throw new Error(decodeUtf8(msg.payload) || 'Server returned an error')
      }

      if (
        msg.type === MsgType.AudioOnlyServer
        && msg.event === EventType.PodcastRoundResponse
      ) {
        audioChunks.push(msg.payload)
        audioBytes.value += msg.payload.length
        statusText.value = `正在接收音频... ${Math.round(audioBytes.value / 1024)} KB`
        continue
      }

      if (msg.type === MsgType.FullServerResponse) {
        if (msg.event === EventType.PodcastRoundStart) {
          try {
            const data = JSON.parse(decodeUtf8(msg.payload))
            podcastTexts.value = [
              ...podcastTexts.value,
              {
                speaker: data.speaker || 'speaker',
                text: data.text || '',
              },
            ]
            pushLog(`RoundStart: ${data.round_id ?? '-'} ${data.speaker ?? ''}`)
          }
          catch {
            pushLog('RoundStart parse failed, skipped text rendering')
          }
        }

        if (msg.event === EventType.PodcastRoundEnd) {
          pushLog('收到 PodcastRoundEnd')
        }

        if (msg.event === EventType.PodcastEnd) {
          pushLog('收到 PodcastEnd')
        }
      }

      if (msg.event === EventType.SessionFinished) {
        pushLog('收到 SessionFinished')
        break
      }
    }

    statusText.value = '关闭连接中...'
    await FinishConnection(ws)
    pushLog('已发送 FinishConnection')
    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.ConnectionFinished)
    pushLog('收到 ConnectionFinished')

    if (audioChunks.length === 0) {
      throw new Error('No audio data received from server')
    }

    const merged = concatUint8Arrays(audioChunks)
    audioData.value = merged
    audioBytes.value = merged.length
    audioSrc.value = buildAudioUrl(merged, 'mp3')
    statusText.value = 'Generation complete, preparing playback'
    pushLog(`音频生成完成，${Math.round(merged.length / 1024)} KB`)

    await nextTick()
    try {
      await audioEl.value?.play?.()
      pushLog('Auto play started')
    }
    catch (err) {
      pushLog(`自动播放失败，请手动点击播放：${String(err)}`)
    }
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    errorText.value = msg
    statusText.value = '生成失败'
    pushLog(`错误：${msg}`)
  }
  finally {
    isLoading.value = false
    if (ws) {
      try {
        await sleep(100)
      }
      catch {}
    }
    closeCurrentSocket()
  }
}

onBeforeUnmount(() => {
  revokeAudioUrl(audioSrc.value)
  closeCurrentSocket()
})
</script>

<template>
  <view class="podcast-page">
    <view class="hero-card">
      <view class="hero-head">
        <view>
          <text class="eyebrow">
            Podcast TTS
          </text>
          <view class="hero-title">
            火山播客语音生成测试
          </view>
          <view class="hero-subtitle">
            输入文本后通过 WebSocket 协议生成音频，返回后自动播放
          </view>
        </view>
        <view class="status-pill" :class="{ loading: isLoading }">
          {{ statusText }}
        </view>
      </view>

      <view class="form-block">
        <view class="field-label">
          输入文本
        </view>
        <textarea
          v-model="inputText"
          class="text-input"
          :maxlength="3000"
          placeholder="请输入需要生成播客语音的内容"
          :disabled="isLoading"
        />
      </view>

      <view class="form-block compact">
        <view class="field-label">
          生成方式
        </view>
        <picker
          mode="selector"
          :range="generateModeOptions"
          range-key="label"
          :value="selectedGenerateModeIndex"
          :disabled="isLoading"
          @change="handleGenerateModeChange"
        >
          <view class="selector-box">
            <view class="selector-main">
              <view class="selector-title">
                {{ selectedGenerateMode.label }}
              </view>
              <view class="selector-sub">
                action={{ selectedGenerateMode.value }} · {{ selectedGenerateMode.desc }}
              </view>
            </view>
            <view class="selector-arrow">
              切换
            </view>
          </view>
        </picker>
      </view>

      <view class="form-block compact">
        <view class="field-label">
          Prompt（可选）
        </view>
        <input
          v-model="promptText"
          class="mini-input"
          placeholder="optional"
          :disabled="isLoading"
        >
      </view>

      <view v-if="selectedGenerateMode.value === 3" class="form-block">
        <view class="field-label">
          nlp_texts（JSON）
        </view>
        <textarea
          v-model="nlpTextsInput"
          class="text-input nlp-input"
          :maxlength="-1"
          placeholder="请输入 nlp_texts JSON 数组"
          :disabled="isLoading"
        />
      </view>

      <view class="form-block compact">
        <view class="field-label">
          发音人 1
        </view>
        <picker
          mode="selector"
          :range="speakerOptions"
          range-key="label"
          :value="selectedSpeakerIndex"
          :disabled="isLoading"
          @change="handleSpeakerChange"
        >
          <view class="selector-box">
            <view class="selector-main">
              <view class="selector-title">
                {{ selectedSpeaker.label }}
              </view>
              <view class="selector-sub">
                {{ selectedSpeaker.value }}
              </view>
            </view>
            <view class="selector-arrow">
              切换
            </view>
          </view>
        </picker>
      </view>

      <view class="form-block compact">
        <view class="field-label">
          发音人 2
        </view>
        <picker
          mode="selector"
          :range="speakerOptions"
          range-key="label"
          :value="selectedSpeakerIndex2"
          :disabled="isLoading"
          @change="handleSpeakerChange2"
        >
          <view class="selector-box">
            <view class="selector-main">
              <view class="selector-title">
                {{ selectedSpeaker2.label }}
              </view>
              <view class="selector-sub">
                {{ selectedSpeaker2.value }}
              </view>
            </view>
            <view class="selector-arrow">
              切换
            </view>
          </view>
        </picker>
      </view>

      <view class="form-block compact">
        <view class="field-label">
          音效设置
        </view>
        <view class="toggle-grid">
          <view class="toggle-item">
            <view class="toggle-text">
              <view class="toggle-title">
                开头音效
              </view>
              <view class="toggle-desc">
                use_head_music
              </view>
            </view>
            <switch
              :checked="useHeadMusic"
              :disabled="isLoading"
              color="#2563eb"
              @change="useHeadMusic = !!$event.detail.value"
            />
          </view>

          <view class="toggle-item">
            <view class="toggle-text">
              <view class="toggle-title">
                结尾音效
              </view>
              <view class="toggle-desc">
                use_tail_music
              </view>
            </view>
            <switch
              :checked="useTailMusic"
              :disabled="isLoading"
              color="#2563eb"
              @change="useTailMusic = !!$event.detail.value"
            />
          </view>
        </view>
      </view>

      <view class="action-row">
        <button
          class="generate-btn"
          type="primary"
          :loading="isLoading"
          :disabled="isLoading"
          @click="generatePodcast"
        >
          {{ isLoading ? '生成中...' : '生成并播放' }}
        </button>
        <view class="meta-info">
          <text>发音人 1：{{ selectedSpeaker.label }}</text>
          <text>发音人 2：{{ selectedSpeaker2.label }}</text>
          <text>音频大小：{{ Math.round(audioBytes / 1024) }} KB</text>
          <text>文本段数：{{ podcastTexts.length }}</text>
        </view>
      </view>

      <view v-if="errorText" class="error-box">
        {{ errorText }}
      </view>
    </view>

    <view class="result-card">
      <view class="section-title">
        音频结果
      </view>
      <button
        class="download-btn"
        :disabled="!audioSrc || isDownloading"
        @click="downloadAudio"
      >
        {{ isDownloading ? '下载中...' : '下载音频' }}
      </button>
      <audio
        ref="audioEl"
        class="audio-player"
        :src="audioSrc"
        controls
        autoplay
      />
      <view v-if="!audioSrc" class="empty-tip">
        生成完成后会在这里自动播放音频
      </view>
    </view>

    <view v-if="podcastTexts.length" class="result-card">
      <view class="section-title">
        播客文本片段
      </view>
      <view class="text-list">
        <view
          v-for="(item, index) in podcastTexts"
          :key="`${item.speaker}-${index}`"
          class="text-item"
        >
          <view class="speaker-tag">
            {{ item.speaker || 'speaker' }}
          </view>
          <view class="speaker-text">
            {{ item.text || '-' }}
          </view>
        </view>
      </view>
    </view>

    <view class="result-card">
      <view class="section-title">
        运行日志
      </view>
      <scroll-view scroll-y class="log-box">
        <view
          v-for="(line, index) in logs"
          :key="`${index}-${line}`"
          class="log-line"
        >
          {{ line }}
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.podcast-page {
  min-height: 100vh;
  padding: 28rpx;
  background:
    radial-gradient(circle at 12% 8%, rgba(255, 212, 138, 0.28), transparent 48%),
    radial-gradient(circle at 88% 12%, rgba(112, 180, 255, 0.22), transparent 45%),
    linear-gradient(180deg, #f5f7fb 0%, #eef2f7 100%);
}

.hero-card,
.result-card {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(14, 28, 45, 0.08);
  border-radius: 28rpx;
  box-shadow: 0 12rpx 40rpx rgba(25, 43, 70, 0.08);
  backdrop-filter: blur(8px);
}

.hero-card {
  padding: 28rpx;
  margin-bottom: 24rpx;
}

.hero-head {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  align-items: flex-start;
  margin-bottom: 24rpx;
}

.eyebrow {
  display: inline-block;
  font-size: 22rpx;
  color: #8a5a10;
  background: #fff2cf;
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
  margin-bottom: 12rpx;
}

.hero-title {
  font-size: 38rpx;
  line-height: 1.25;
  font-weight: 700;
  color: #0f172a;
}

.hero-subtitle {
  margin-top: 10rpx;
  font-size: 24rpx;
  line-height: 1.5;
  color: #5b6472;
}

.status-pill {
  flex-shrink: 0;
  max-width: 300rpx;
  padding: 12rpx 18rpx;
  border-radius: 18rpx;
  font-size: 22rpx;
  line-height: 1.35;
  color: #334155;
  background: #edf2f7;
  border: 1px solid #d9e2ec;
}

.status-pill.loading {
  color: #0c4a6e;
  background: #e0f2fe;
  border-color: #bae6fd;
}

.form-block {
  margin-bottom: 20rpx;
}

.form-block.compact {
  margin-bottom: 18rpx;
}

.field-label {
  font-size: 24rpx;
  font-weight: 600;
  color: #243142;
  margin-bottom: 12rpx;
}

.text-input {
  width: 100%;
  min-height: 260rpx;
  padding: 20rpx;
  box-sizing: border-box;
  border-radius: 20rpx;
  background: #fbfcfe;
  border: 1px solid #dbe4ee;
  color: #111827;
  font-size: 28rpx;
  line-height: 1.55;
}

.nlp-input {
  min-height: 220rpx;
  font-family: Consolas, 'Courier New', monospace;
}

.mini-input {
  width: 100%;
  height: 84rpx;
  padding: 0 20rpx;
  box-sizing: border-box;
  border-radius: 18rpx;
  background: #fbfcfe;
  border: 1px solid #dbe4ee;
  color: #111827;
  font-size: 26rpx;
}

.selector-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 18rpx;
  background: #fbfcfe;
  border: 1px solid #dbe4ee;
}

.selector-main {
  min-width: 0;
  flex: 1;
}

.selector-title {
  font-size: 26rpx;
  color: #111827;
  font-weight: 600;
  line-height: 1.4;
}

.selector-sub {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #64748b;
  line-height: 1.4;
  word-break: break-all;
}

.selector-arrow {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #1d4ed8;
  background: #dbeafe;
  border-radius: 999rpx;
  padding: 6rpx 14rpx;
}

.toggle-grid {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 18rpx;
  border-radius: 18rpx;
  background: #fbfcfe;
  border: 1px solid #dbe4ee;
}

.toggle-text {
  min-width: 0;
  flex: 1;
}

.toggle-title {
  font-size: 24rpx;
  color: #111827;
  font-weight: 600;
  line-height: 1.4;
}

.toggle-desc {
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #64748b;
  line-height: 1.35;
}

.action-row {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.generate-btn {
  border-radius: 20rpx;
  background: linear-gradient(135deg, #0ea5e9, #2563eb);
  border: none;
}

.meta-info {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  font-size: 22rpx;
  color: #5b6472;
}

.error-box {
  margin-top: 16rpx;
  border-radius: 18rpx;
  padding: 16rpx 18rpx;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #be123c;
  font-size: 24rpx;
  line-height: 1.5;
}

.result-card {
  padding: 24rpx;
  margin-bottom: 20rpx;
}

.section-title {
  font-size: 26rpx;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 14rpx;
}

.audio-player {
  width: 100%;
  min-height: 72rpx;
}

.download-btn {
  margin-bottom: 16rpx;
  border-radius: 18rpx;
  background: #e0f2fe;
  color: #075985;
  border: 1px solid #bae6fd;
}

.empty-tip {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #64748b;
}

.text-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.text-item {
  padding: 16rpx;
  border-radius: 18rpx;
  background: #f8fafc;
  border: 1px solid #e5edf5;
}

.speaker-tag {
  display: inline-block;
  font-size: 20rpx;
  color: #1d4ed8;
  background: #dbeafe;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
  margin-bottom: 8rpx;
}

.speaker-text {
  font-size: 24rpx;
  line-height: 1.55;
  color: #1f2937;
}

.log-box {
  max-height: 360rpx;
  background: #0b1220;
  border-radius: 18rpx;
  padding: 14rpx;
  box-sizing: border-box;
}

.log-line {
  color: #cbd5e1;
  font-family: Consolas, 'Courier New', monospace;
  font-size: 21rpx;
  line-height: 1.55;
  margin-bottom: 8rpx;
  word-break: break-all;
}

@media (min-width: 768px) {
  .podcast-page {
    max-width: 960px;
    margin: 0 auto;
    padding: 28px;
  }

  .hero-card,
  .result-card {
    border-radius: 20px;
  }

  .hero-card {
    padding: 22px;
  }

  .result-card {
    padding: 20px;
  }
}
</style>
