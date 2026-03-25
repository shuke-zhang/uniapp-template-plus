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
import { isApp } from '@/utils/helpers/system'

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
  { label: 'Prompt 联网播客', value: 4, desc: '根据 prompt_text 联网生成播客' },
  { label: '摘要生成播客', value: 0, desc: '根据 input_text 总结生成播客' },
  { label: '对话直出播客', value: 3, desc: '根据 nlp_texts 直接生成播客' },
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
const isSavingAudio = ref(false)
const audioLocalPath = ref('')
const isSharingAudio = ref(false)
const isAudioPlaying = ref(false)
const audioDurationSeconds = ref(0)
const audioCurrentTimeSeconds = ref(0)
const isSeekingAudio = ref(false)

let currentSocket: WebSocket | null = null
let currentLogHandler: ((msg: string) => void) | null = null
let innerAudioContext: UniNamespace.InnerAudioContext | null = null

const selectedGenerateMode = computed(
  () => generateModeOptions[selectedGenerateModeIndex.value] ?? generateModeOptions[0],
)
const selectedSpeaker = computed(
  () => speakerOptions[selectedSpeakerIndex.value] ?? speakerOptions[0],
)
const selectedSpeaker2 = computed(
  () => speakerOptions[selectedSpeakerIndex2.value] ?? speakerOptions[1] ?? speakerOptions[0],
)
const audioDisplayPath = computed(() => audioLocalPath.value || audioSrc.value)
const audioPlayButtonText = computed(() => (isAudioPlaying.value ? '重新播放' : '播放音频'))
const audioStatusLabel = computed(() => {
  if (!audioSrc.value) {
    return '未生成'
  }

  return isAudioPlaying.value ? '播放中' : '已生成'
})

const audioSizeLabel = computed(() => formatBytes(audioBytes.value))
const audioDurationLabel = computed(() => formatDuration(audioDurationSeconds.value))
const durationMetaLabel = '时长'
const storageMetaLabel = '保存位置'
const sizeMetaLabel = '大小'
const localFileMetaLabel = '本地文件'
const audioCurrentTimeLabel = computed(() => formatDuration(audioCurrentTimeSeconds.value))
const audioRemainingTimeLabel = computed(() => {
  const remaining = Math.max(0, audioDurationSeconds.value - audioCurrentTimeSeconds.value)
  return formatDuration(remaining)
})
const audioProgressPercent = computed(() => {
  if (audioDurationSeconds.value <= 0) {
    return 0
  }

  return Math.min(100, Math.max(0, (audioCurrentTimeSeconds.value / audioDurationSeconds.value) * 100))
})
const audioStorageText = computed(() => {
  if (!audioLocalPath.value) {
    return '未保存'
  }

  return isMpWeixinRuntime() ? '小程序沙盒' : '应用沙盒'
})
const audioStorageLabel = computed(() => {
  if (!audioLocalPath.value) {
    return 'æœªä¿å­˜'
  }

  return isMpWeixinRuntime() ? 'å°ç¨‹åºæ²™ç›’' : 'åº”ç”¨æ²™ç›’'
})

function handleAudioLoadedMetadata(event: Event): void {
  const target = event.target as HTMLAudioElement | null
  updateAudioDuration(target?.duration)
}

function handleAudioEnded(): void {
  isAudioPlaying.value = false
  audioCurrentTimeSeconds.value = audioDurationSeconds.value
}

function handleAudioPauseEvent(): void {
  if (!isSeekingAudio.value) {
    isAudioPlaying.value = false
  }
}

/**
 * 获取当前运行平台。
 *
 * @returns 平台标识
 */
function getRuntimePlatform(): string {
  const info = uni.getSystemInfoSync() as Record<string, any>
  return String(info?.uniPlatform || info?.platform || '').toLowerCase()
}

/**
 * 是否为微信小程序环境。
 *
 * @returns 是否微信小程序
 */
function isMpWeixinRuntime(): boolean {
  return getRuntimePlatform() === 'mp-weixin'
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const digits = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[unitIndex]}`
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--:--'
  }

  const totalSeconds = Math.max(0, Math.round(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainSeconds = totalSeconds % 60

  if (hours > 0) {
    return [hours, minutes, remainSeconds].map(item => String(item).padStart(2, '0')).join(':')
  }

  return [minutes, remainSeconds].map(item => String(item).padStart(2, '0')).join(':')
}

function getAudioStorageHint(path: string): string {
  if (!path) {
    return 'æœªä¿å­˜åˆ°æœ¬åœ°'
  }

  if (isMpWeixinRuntime()) {
    return `å°ç¨‹åºæ²™ç›’æ–‡ä»¶ï¼š${path}`
  }

  if (isApp) {
    return `App æ²™ç›’æ–‡ä»¶ï¼š${path}`
  }

  return `æœ¬åœ°æ–‡ä»¶ï¼š${path}`
}

/**
 * 从 Uint8Array 安全提取当前视图对应的 ArrayBuffer。
 *
 * @param bytes 音频字节
 * @returns ArrayBuffer
 */
function getSafeArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const rawBuffer = bytes.buffer

  if (rawBuffer instanceof SharedArrayBuffer) {
    const copied = new Uint8Array(bytes.byteLength)
    copied.set(
      new Uint8Array(
        rawBuffer,
        bytes.byteOffset,
        bytes.byteLength,
      ),
    )
    return copied.buffer
  }

  return rawBuffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  )
}

/**
 * 获取运行时全局 Buffer。
 *
 * @returns Buffer 构造对象
 */
function getRuntimeBuffer():
  | {
    from: (value: string, encoding?: string) => Uint8Array
  }
  | undefined {
  const runtime = (globalThis as unknown as { Buffer?: any }).Buffer
  if (!runtime || typeof runtime.from !== 'function') {
    return undefined
  }
  return runtime
}

/**
 * 将字符串编码为 UTF-8 字节数组。
 *
 * @param value 待编码字符串
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
 * @param bytes 待解码字节
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
 * 写入页面日志，只保留最近 50 条。
 *
 * @param message 日志文本
 */
function pushLog(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`
  logs.value = [line, ...logs.value].slice(0, 50)
}

/**
 * 生成连接或会话使用的唯一 ID。
 *
 * @returns ID 字符串
 */
function genId(): string {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)

  return `${Date.now().toString(16)}-${random()}-${random()}-${random()}-${random()}${random()}`
}

/**
 * 等待指定毫秒数。
 *
 * @param ms 毫秒数
 * @returns Promise
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 合并多段音频字节数据。
 *
 * @param chunks 音频分片数组
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

function getAudioFileName(format: 'mp3' | 'wav' = 'mp3'): string {
  return `podcast_${Date.now()}.${format}`
}

function getLocalAudioDirectory(): string {
  if (isApp && typeof plus !== 'undefined') {
    return plus.io.convertLocalFileSystemURL('_doc/')
  }

  if (isMpWeixinRuntime()) {
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

function canPersistAudioLocally(): boolean {
  return Boolean(getLocalAudioDirectory())
}

function buildAudioBlob(bytes: Uint8Array, format: 'mp3' | 'wav'): Blob {
  const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg'
  return new Blob([getSafeArrayBuffer(bytes)], { type: mime })
}

/**
 * App 环境下写入本地 mp3 文件。
 *
 * @param bytes 音频字节
 * @param format 音频格式
 * @returns 本地路径
 */
async function writeAudioToLocalFileForApp(
  bytes: Uint8Array,
  format: 'mp3' | 'wav' = 'mp3',
): Promise<string> {
  const fileName = getAudioFileName(format)

  return await new Promise<string>((resolve, reject) => {
    plus.io.resolveLocalFileSystemURL(
      '_doc',
      (rootEntry: any) => {
        rootEntry.getFile(
          fileName,
          { create: true },
          (fileEntry: any) => {
            fileEntry.createWriter(
              (writer: any) => {
                writer.onwrite = () => {
                  resolve(`${plus.io.convertLocalFileSystemURL('_doc/')}${fileName}`)
                }

                writer.onerror = (error: any) => {
                  reject(error)
                }

                writer.write(buildAudioBlob(bytes, format))
              },
              (error: any) => {
                reject(error)
              },
            )
          },
          (error: any) => {
            reject(error)
          },
        )
      },
      (error: any) => {
        reject(error)
      },
    )
  })
}

/**
 * 微信小程序环境下写入本地 mp3 文件。
 *
 * @param bytes 音频字节
 * @param format 音频格式
 * @returns 本地路径
 */
async function writeAudioToLocalFile(
  bytes: Uint8Array,
  format: 'mp3' | 'wav' = 'mp3',
): Promise<string> {
  if (isApp && typeof plus !== 'undefined') {
    return await writeAudioToLocalFileForApp(bytes, format)
  }

  const uniAny = uni as unknown as {
    getFileSystemManager?: () => {
      writeFile?: (options: {
        filePath: string
        data: ArrayBuffer
        encoding?: string
        success?: () => void
        fail?: (error: unknown) => void
      }) => void
      writeFileSync?: (filePath: string, data: ArrayBuffer | string, encoding?: string) => void
    }
  }

  const fs = uniAny.getFileSystemManager?.()
  const baseDir = getLocalAudioDirectory()

  if (!fs || !baseDir) {
    throw new Error('当前小程序环境不支持文件系统写入')
  }

  const filePath = `${baseDir}${baseDir.endsWith('/') ? '' : '/'}${getAudioFileName(format)}`
  const arrayBuffer = getSafeArrayBuffer(bytes)

  if (typeof fs.writeFile === 'function') {
    await new Promise<void>((resolve, reject) => {
      fs.writeFile?.({
        filePath,
        data: arrayBuffer,
        success: () => resolve(),
        fail: error => reject(error),
      })
    })

    return filePath
  }

  if (typeof fs.writeFileSync === 'function') {
    fs.writeFileSync(filePath, arrayBuffer)
    return filePath
  }

  throw new Error('å½“å‰æ–‡ä»¶ç³»ç»Ÿä¸æ”¯æŒéŸ³é¢‘å†™å…¥')
}

/**
 * 将音频字节写成本地 mp3 文件路径。
 *
 * 规则：
 * - App：写入 _doc
 * - 微信小程序：写入 USER_DATA_PATH
 * - H5：无法生成真实本地路径，降级为 blob URL
 *
 * @param bytes 音频字节
 * @param format 音频格式
 * @returns 可播放地址
 */
async function buildAudioPlaybackUrl(
  bytes: Uint8Array,
  format: 'mp3' | 'wav',
): Promise<string> {
  if (!isMpWeixinRuntime() && typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    return URL.createObjectURL(buildAudioBlob(bytes, format))
  }

  return await writeAudioToLocalFile(bytes, format)
}

/**
 * 释放旧的 Blob URL。
 *
 * @param url 地址
 */
function revokeAudioUrl(url: string): void {
  if (!url) {
    return
  }

  if (typeof URL !== 'undefined' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/**
 * 确保当前音频存在可复用的 mp3 路径。
 *
 * @returns 本地音频路径或当前可播放地址
 */
async function ensureAudioLocalPath(): Promise<string> {
  if (audioLocalPath.value) {
    return audioLocalPath.value
  }

  if (!audioData.value || audioData.value.length === 0) {
    throw new Error('当前没有可保存的音频数据')
  }

  if (!canPersistAudioLocally()) {
    if (audioSrc.value) {
      return audioSrc.value
    }

    const playbackUrl = await buildAudioPlaybackUrl(audioData.value, 'mp3')
    audioSrc.value = playbackUrl
    return playbackUrl
  }

  const localPath = await writeAudioToLocalFile(audioData.value, 'mp3')
  audioLocalPath.value = localPath

  if (!audioSrc.value) {
    audioSrc.value = localPath
  }

  pushLog(`已补生成音频路径：${localPath}`)

  return localPath
}

function updateAudioDuration(duration: number | undefined): void {
  if (!Number.isFinite(duration) || !duration || duration <= 0) {
    return
  }

  audioDurationSeconds.value = Number(duration)
}

function updateAudioCurrentTime(currentTime: number | undefined): void {
  if (isSeekingAudio.value || !Number.isFinite(currentTime) || currentTime == null || currentTime < 0) {
    return
  }

  audioCurrentTimeSeconds.value = Number(currentTime)
}

async function waitForAudioReady(getDuration: () => number | undefined): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    const duration = getDuration()

    if (Number.isFinite(duration) && Number(duration) > 0) {
      updateAudioDuration(duration)
      return
    }

    await sleep(100)
  }
}

function syncAudioTimeFromInnerAudio(): void {
  updateAudioCurrentTime(innerAudioContext?.currentTime)
}

function handleAudioTimeUpdate(event: Event): void {
  const target = event.target as HTMLAudioElement | null
  updateAudioCurrentTime(target?.currentTime)
}

function seekAudioTo(seconds: number): void {
  const targetTime = Math.min(Math.max(0, seconds), audioDurationSeconds.value || 0)
  audioCurrentTimeSeconds.value = targetTime
  const innerAudio = getInnerAudioContext()
  if (innerAudio) {
    innerAudio.seek?.(targetTime)
    return
  }

  if (audioEl.value) {
    audioEl.value.currentTime = targetTime
  }
}

function handleAudioSeekChanging(event: { detail?: { value?: number } }): void {
  isSeekingAudio.value = true
  const percent = Number(event?.detail?.value ?? 0)
  audioCurrentTimeSeconds.value = (audioDurationSeconds.value * percent) / 100
}

function handleAudioSeekChange(event: { detail?: { value?: number } }): void {
  const percent = Number(event?.detail?.value ?? 0)
  const nextTime = (audioDurationSeconds.value * percent) / 100
  seekAudioTo(nextTime)
  isSeekingAudio.value = false
}

function getInnerAudioContext(): UniNamespace.InnerAudioContext | null {
  if (innerAudioContext) {
    return innerAudioContext
  }

  const uniAny = uni as unknown as {
    createInnerAudioContext?: () => UniNamespace.InnerAudioContext
  }

  if (typeof uniAny.createInnerAudioContext !== 'function') {
    return null
  }

  innerAudioContext = uniAny.createInnerAudioContext()

  try {
    innerAudioContext.autoplay = false
    innerAudioContext.obeyMuteSwitch = false
  }
  catch {}

  innerAudioContext.onPlay?.(() => {
    isAudioPlaying.value = true
    syncAudioTimeFromInnerAudio()
    statusText.value = '播放中'
  })
  innerAudioContext.onCanplay?.(() => {
    setTimeout(() => {
      updateAudioDuration(innerAudioContext?.duration)
      syncAudioTimeFromInnerAudio()
    }, 120)
  })
  innerAudioContext.onTimeUpdate?.(() => {
    syncAudioTimeFromInnerAudio()
  })
  innerAudioContext.onPause?.(() => {
    isAudioPlaying.value = false
    statusText.value = '已暂停'
  })
  innerAudioContext.onStop?.(() => {
    isAudioPlaying.value = false
    audioCurrentTimeSeconds.value = 0
    statusText.value = '已停止'
  })
  innerAudioContext.onEnded?.(() => {
    isAudioPlaying.value = false
    audioCurrentTimeSeconds.value = audioDurationSeconds.value
    statusText.value = '音频已生成'
  })
  innerAudioContext.onError?.((error: any) => {
    isAudioPlaying.value = false
    statusText.value = '音频播放失败'
    pushLog(`innerAudio 播放失败：${error?.errMsg || JSON.stringify(error)}`)
  })

  return innerAudioContext
}

async function playCurrentAudio(): Promise<void> {
  if (!audioSrc.value) {
    throw new Error('当前没有可播放的音频')
  }

  const innerAudio = getInnerAudioContext()

  if (innerAudio) {
    try {
      innerAudio.stop()
    }
    catch {}

    audioCurrentTimeSeconds.value = 0
    innerAudio.src = audioSrc.value
    innerAudio.play()
    await waitForAudioReady(() => innerAudio.duration)
    return
  }

  await nextTick()
  audioCurrentTimeSeconds.value = 0
  audioEl.value?.load?.()
  const playResult = audioEl.value?.play?.()

  if (playResult && typeof playResult.then === 'function') {
    await playResult
  }

  await waitForAudioReady(() => audioEl.value?.duration)

  isAudioPlaying.value = true
  statusText.value = '播放中'
}

async function handlePlayAudio(): Promise<void> {
  try {
    await playCurrentAudio()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    statusText.value = '音频播放失败'
    pushLog(`手动播放失败：${message}`)
    uni.showToast({
      title: message || '播放失败',
      icon: 'none',
    })
  }
}

function handlePauseAudio(): void {
  const innerAudio = getInnerAudioContext()

  if (innerAudio) {
    try {
      innerAudio.pause()
    }
    catch {}
  }
  else {
    audioEl.value?.pause?.()
  }

  isAudioPlaying.value = false
  statusText.value = '已暂停'
}

/**
 * 解析 nlp_texts 输入。
 *
 * @param value 输入字符串
 * @returns 解析后的数组
 */
function parseNlpTextsInput(value: string): PodcastNlpText[] {
  const trimmed = value.trim()

  if (!trimmed) {
    return []
  }

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

/**
 * 根据运行环境解析实际使用的 Socket 连接地址。
 *
 * @param runtimeInfo 可选的运行环境信息对象
 * @returns 对应环境下应使用的 Socket 地址
 */
function resolveSocketEndpoint(runtimeInfo?: Record<string, any>): string {
  const info = runtimeInfo ?? (uni.getSystemInfoSync() as Record<string, any>)
  const uniPlatform = String(info?.uniPlatform || info?.platform || '').toLowerCase()

  if (uniPlatform === 'mp-weixin' && sockBaseUrlMpWx) {
    return sockBaseUrlMpWx
  }

  return sockBaseUrl
}

/**
 * 创建一个供协议层使用的连接实例。
 *
 * @param headers 请求头
 * @param endpoint 连接地址
 * @returns WebSocket 实例
 */
async function createProtocolSocket(
  headers: Record<string, string>,
  endpoint: string,
): Promise<WebSocket> {
  const ws = new WebSocket(endpoint)
  const wsEx = ws as any

  currentLogHandler = (msg: string) => pushLog(`socket: ${msg}`)
  ws.on('log', currentLogHandler as any)
  ws.on('open', () => pushLog('socket: open'))
  ws.on('close', reason => pushLog(`socket: close ${reason || ''}`))
  ws.on('error', err => pushLog(`socket: error ${err || ''}`))

  wsEx.isCreate = false
  wsEx.isConnect = false
  wsEx.isInitiative = false

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
    function cleanup(): void {
      ws.off?.('open', onOpen as any)
      ws.off?.('error', onError as any)
    }

    function onOpen(): void {
      cleanup()
      resolve()
    }

    function onError(err?: string): void {
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
 * 关闭当前 socket。
 */
function closeCurrentSocket(): void {
  if (!currentSocket) {
    return
  }

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
 * @returns 请求对象
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
 * 处理发音人 1 的选择变更。
 *
 * @param event picker 变更事件
 */
function handleSpeakerChange(event: { detail?: { value?: string | number } }): void {
  const index = Number(event?.detail?.value)

  if (!Number.isNaN(index) && index >= 0 && index < speakerOptions.length) {
    selectedSpeakerIndex.value = index
  }
}

/**
 * 处理发音人 2 的选择变更。
 *
 * @param event picker 变更事件
 */
function handleSpeakerChange2(event: { detail?: { value?: string | number } }): void {
  const index = Number(event?.detail?.value)

  if (!Number.isNaN(index) && index >= 0 && index < speakerOptions.length) {
    selectedSpeakerIndex2.value = index
  }
}

/**
 * 处理生成方式的选择变更。
 *
 * @param event picker 变更事件
 */
function handleGenerateModeChange(event: { detail?: { value?: string | number } }): void {
  const index = Number(event?.detail?.value)

  if (!Number.isNaN(index) && index >= 0 && index < generateModeOptions.length) {
    selectedGenerateModeIndex.value = index
  }
}

/**
 * 生成播客音频并在完成后自动播放。
 */
async function generatePodcast(): Promise<void> {
  const action = selectedGenerateMode.value.value
  const text = inputText.value.trim()
  const prompt = promptText.value.trim()

  if (action === 0 && !text) {
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

  handlePauseAudio()
  revokeAudioUrl(audioSrc.value)
  audioSrc.value = ''
  audioLocalPath.value = ''
  audioBytes.value = 0
  audioData.value = null
  audioDurationSeconds.value = 0
  audioCurrentTimeSeconds.value = 0
  isSeekingAudio.value = false
  isAudioPlaying.value = false
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

    if (
      String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase() === 'mp-weixin'
      && !sockBaseUrlMpWx
    ) {
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

    if (audioChunks.length === 0) {
      throw new Error('No audio data received from server')
    }

    statusText.value = '正在整理音频...'
    try {
      await FinishConnection(ws)
      pushLog('已发送 FinishConnection')
      await WaitForEvent(ws, MsgType.FullServerResponse, EventType.ConnectionFinished)
      pushLog('收到 ConnectionFinished')
    }
    catch (error) {
      pushLog(`FinishConnection 等待失败，将直接使用已收到的音频：${String(error)}`)
    }

    const merged = concatUint8Arrays(audioChunks)
    audioData.value = merged
    audioBytes.value = merged.length

    const playableUrl = await buildAudioPlaybackUrl(merged, 'mp3')
    audioSrc.value = playableUrl
    audioLocalPath.value = playableUrl.startsWith('blob:') && canPersistAudioLocally()
      ? await writeAudioToLocalFile(merged, 'mp3')
      : playableUrl.startsWith('blob:')
        ? ''
        : playableUrl
    isLoading.value = false

    statusText.value = '音频生成完成，准备播放...'
    pushLog(`音频生成完成，${Math.round(merged.length / 1024)} KB`)
    pushLog(`音频播放地址：${playableUrl}`)
    if (audioLocalPath.value) {
      pushLog(`音频本地路径：${audioLocalPath.value}`)
    }

    await nextTick()
    statusText.value = '音频已生成'

    try {
      await playCurrentAudio()
      pushLog('Auto play started')
    }
    catch (err) {
      pushLog(`自动播放失败，请手动点击播放：${String(err)}`)
      statusText.value = '音频已生成，请手动播放'
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

/**
 * 复制音频地址。
 */
function handleCopyAudioSrc(): void {
  const target = audioLocalPath.value || audioSrc.value

  if (!target) {
    uni.showToast({
      title: '音频地址为空',
      icon: 'none',
    })
    return
  }

  uni.setClipboardData({
    data: target,
    success: () => {
      uni.showToast({
        title: '复制成功',
        icon: 'success',
      })
    },
    fail: () => {
      uni.showToast({
        title: '复制失败',
        icon: 'none',
      })
    },
  })
}

/**
 * 下载音频。
 *
 * 说明：
 * - App / 小程序：直接复用已生成的 mp3 文件路径
 * - H5：如果是 blob 地址，则触发浏览器下载
 */
async function handleDownloadAudio(): Promise<void> {
  if (isSavingAudio.value) {
    return
  }

  if (!audioSrc.value && (!audioData.value || audioData.value.length === 0)) {
    uni.showToast({
      title: '暂无可保存音频',
      icon: 'none',
    })
    return
  }

  try {
    isSavingAudio.value = true
    const localPath = await ensureAudioLocalPath()

    if (localPath.startsWith('blob:') && typeof document !== 'undefined') {
      const link = document.createElement('a')
      link.href = localPath
      link.download = `podcast_${Date.now()}.mp3`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      uni.showToast({
        title: '开始下载',
        icon: 'success',
      })
      pushLog(`已通过浏览器下载：${localPath}`)
      return
    }

    const isMpPath = isMpWeixinRuntime()
    uni.showModal({
      title: isMpPath ? '已保存到小程序沙盒' : '已保存到应用目录',
      content: isMpPath
        ? `文件路径：${localPath}\n该路径是小程序沙盒目录，系统文件管理器里通常找不到。可直接点“分享到微信”发送该文件。`
        : `文件路径：${localPath}\n该路径通常位于 App 沙盒目录，可复制后排查。`,
      showCancel: false,
    })

    pushLog(`音频已保存到本地：${localPath}`)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({
      title: message || '保存失败',
      icon: 'none',
    })
    pushLog(`音频保存失败：${message}`)
  }
  finally {
    isSavingAudio.value = false
  }
}

async function handleShareAudio(): Promise<void> {
  if (isSharingAudio.value) {
    return
  }

  try {
    isSharingAudio.value = true
    const localPath = await ensureAudioLocalPath()
    const wxAny = globalThis as unknown as {
      wx?: {
        shareFileMessage?: (options: {
          filePath: string
          fileName?: string
          success?: () => void
          fail?: (error: unknown) => void
        }) => void
      }
    }

    if (typeof wxAny.wx?.shareFileMessage !== 'function') {
      throw new Error('当前环境不支持直接分享到微信文件')
    }

    await new Promise<void>((resolve, reject) => {
      wxAny.wx?.shareFileMessage?.({
        filePath: localPath,
        fileName: getAudioFileName('mp3'),
        success: () => resolve(),
        fail: error => reject(error),
      })
    })

    pushLog(`已触发微信文件分享：${localPath}`)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    uni.showToast({
      title: message || '分享失败',
      icon: 'none',
    })
    pushLog(`音频分享失败：${message}`)
  }
  finally {
    isSharingAudio.value = false
  }
}

onBeforeUnmount(() => {
  revokeAudioUrl(audioSrc.value)
  audioLocalPath.value = ''
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

      <view v-if="selectedGenerateMode.value === 0" class="form-block">
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

      <view v-if="selectedGenerateMode.value === 4" class="form-block compact">
        <view class="field-label">
          Prompt 文本
        </view>

        <textarea
          v-model="promptText"
          class="text-input"
          :maxlength="3000"
          placeholder="请输入 prompt_text"
          :disabled="isLoading"
        />
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
          <text>音频大小：{{ audioSizeLabel }}</text>
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

      <audio
        ref="audioEl"
        class="audio-player-hidden"
        :src="audioSrc"
        preload="auto"
        @loadedmetadata="handleAudioLoadedMetadata"
        @pause="handleAudioPauseEvent"
        @ended="handleAudioEnded"
        @timeupdate="handleAudioTimeUpdate"
      />
      <view v-if="audioSrc.length > 0" class="audio-panel">
        <view class="audio-panel-head">
          <view>
            <view class="audio-panel-title">
              播客音频已生成
            </view>
            <view class="audio-panel-subtitle">
              状态：{{ audioStatusLabel }}
            </view>
          </view>
          <view class="audio-badge" :class="{ active: isAudioPlaying }">
            {{ isAudioPlaying ? 'PLAYING' : 'READY' }}
          </view>
        </view>

        <view class="audio-meta-grid">
          <view class="audio-meta-item">
            <text class="audio-meta-label">{{ durationMetaLabel }}</text>
            <text class="audio-meta-value">{{ audioDurationLabel }}</text>
          </view>
          <view class="audio-meta-item">
            <text class="audio-meta-label">{{ storageMetaLabel }}</text>
            <text class="audio-meta-value">{{ audioStorageText }}</text>
          </view>
          <view class="audio-meta-item">
            <text class="audio-meta-label">{{ sizeMetaLabel }}</text>
            <text class="audio-meta-value">{{ audioSizeLabel }}</text>
          </view>
          <view class="audio-meta-item">
            <text class="audio-meta-label">{{ localFileMetaLabel }}</text>
            <text class="audio-meta-value">{{ audioLocalPath ? '已生成' : '未生成' }}</text>
          </view>
        </view>

        <view class="audio-progress-card">
          <slider
            class="audio-progress-slider"
            :value="audioProgressPercent"
            :min="0"
            :max="100"
            :step="0.1"
            activeColor="#2563eb"
            backgroundColor="#cbd5e1"
            block-color="#ffffff"
            block-size="18"
            @changing="handleAudioSeekChanging"
            @change="handleAudioSeekChange"
          />
          <view class="audio-progress-time">
            <text>{{ audioCurrentTimeLabel }}</text>
            <text>-{{ audioRemainingTimeLabel }}</text>
          </view>
        </view>

        <view class="audio-src-text">
          {{ audioDisplayPath }}
        </view>

        <view class="audio-btn-row">
          <button class="audio-action-btn primary-btn" @click="handlePlayAudio">
            {{ audioPlayButtonText }}
          </button>
          <button class="audio-action-btn" :disabled="!isAudioPlaying" @click="handlePauseAudio">
            暂停
          </button>
        </view>

        <view class="audio-btn-row">
          <button class="audio-action-btn" @click="handleCopyAudioSrc">
            复制地址
          </button>
          <button
            class="audio-action-btn download-btn"
            :disabled="isSavingAudio"
            @click="handleDownloadAudio"
          >
            {{ isSavingAudio ? '保存中...' : '保存到本地' }}
          </button>
        </view>

        <view class="audio-btn-row">
          <button
            class="audio-action-btn share-btn"
            :disabled="isSharingAudio"
            @click="handleShareAudio"
          >
            {{ isSharingAudio ? '分享中...' : '分享到微信' }}
          </button>
        </view>
      </view>
      <view v-if="!audioSrc" class="empty-tip">
        生成完成后会在这里显示自定义播放卡片
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
    radial-gradient(circle at 88% 12%, rgba(59, 130, 246, 0.14), transparent 42%),
    linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%);
  box-sizing: border-box;
}

.hero-card,
.result-card {
  padding: 28rpx;
  margin-bottom: 24rpx;
  background: rgba(255, 255, 255, 0.96);
  border: 1rpx solid rgba(148, 163, 184, 0.18);
  border-radius: 28rpx;
  box-shadow: 0 20rpx 50rpx rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(8px);
}

.hero-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 28rpx;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 8rpx 18rpx;
  margin-bottom: 14rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.1);
  border-radius: 999rpx;
}

.hero-title {
  font-size: 40rpx;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
}

.hero-subtitle {
  margin-top: 12rpx;
  font-size: 25rpx;
  line-height: 1.7;
  color: #475569;
}

.status-pill {
  flex-shrink: 0;
  max-width: 280rpx;
  padding: 14rpx 20rpx;
  font-size: 23rpx;
  font-weight: 600;
  color: #0f172a;
  background: #e2e8f0;
  border-radius: 999rpx;
  text-align: center;
}

.status-pill.loading {
  color: #ffffff;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
}

.form-block {
  margin-bottom: 24rpx;
}

.form-block.compact {
  margin-bottom: 20rpx;
}

.field-label {
  margin-bottom: 12rpx;
  font-size: 25rpx;
  font-weight: 600;
  color: #1e293b;
}

.text-input {
  width: 100%;
  min-height: 220rpx;
  padding: 20rpx;
  font-size: 28rpx;
  color: #0f172a;
  line-height: 1.7;
  background: #f8fafc;
  border: 1rpx solid #dbe2ea;
  border-radius: 20rpx;
  box-sizing: border-box;
}

.nlp-input {
  min-height: 320rpx;
  font-family: monospace;
}

.selector-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 22rpx 24rpx;
  background: #f8fafc;
  border: 1rpx solid #dbe2ea;
  border-radius: 20rpx;
}

.selector-main {
  flex: 1;
  min-width: 0;
}

.selector-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.4;
}

.selector-sub {
  margin-top: 6rpx;
  font-size: 23rpx;
  color: #64748b;
  line-height: 1.5;
  word-break: break-all;
}

.selector-arrow {
  flex-shrink: 0;
  margin-left: 18rpx;
  font-size: 24rpx;
  color: #2563eb;
  font-weight: 600;
}

.toggle-grid {
  display: grid;
  gap: 18rpx;
}

.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx 22rpx;
  background: #f8fafc;
  border: 1rpx solid #dbe2ea;
  border-radius: 20rpx;
}

.toggle-text {
  margin-right: 24rpx;
}

.toggle-title {
  font-size: 27rpx;
  font-weight: 600;
  color: #0f172a;
}

.toggle-desc {
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #64748b;
}

.action-row {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-top: 8rpx;
}

.generate-btn {
  height: 88rpx;
  line-height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
  border-radius: 22rpx;
  background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
}

.meta-info {
  display: grid;
  gap: 10rpx;
  padding: 18rpx 20rpx;
  background: #eff6ff;
  border: 1rpx solid #dbeafe;
  border-radius: 20rpx;
  font-size: 24rpx;
  color: #1e40af;
}

.error-box {
  margin-top: 20rpx;
  padding: 18rpx 20rpx;
  font-size: 24rpx;
  line-height: 1.7;
  color: #b91c1c;
  background: #fef2f2;
  border: 1rpx solid #fecaca;
  border-radius: 18rpx;
}

.section-title {
  margin-bottom: 18rpx;
  font-size: 31rpx;
  font-weight: 700;
  color: #0f172a;
}

.audio-player-hidden {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.audio-panel {
  padding: 24rpx;
  border: 1rpx solid #dbeafe;
  border-radius: 24rpx;
  background: linear-gradient(180deg, #f8fbff 0%, #eef6ff 100%);
}

.audio-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.audio-panel-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #0f172a;
}

.audio-panel-subtitle {
  margin-top: 8rpx;
  font-size: 23rpx;
  color: #475569;
}

.audio-badge {
  flex-shrink: 0;
  padding: 10rpx 16rpx;
  border-radius: 999rpx;
  background: #dbeafe;
  color: #1d4ed8;
  font-size: 22rpx;
  font-weight: 700;
}

.audio-badge.active {
  background: #dcfce7;
  color: #15803d;
}

.audio-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
  margin-top: 20rpx;
}

.audio-meta-item {
  padding: 18rpx;
  border-radius: 18rpx;
  background: rgba(255, 255, 255, 0.9);
}

.audio-meta-label {
  display: block;
  font-size: 22rpx;
  color: #64748b;
}

.audio-meta-value {
  display: block;
  margin-top: 8rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #0f172a;
}

.audio-progress-card {
  margin-top: 18rpx;
  padding: 18rpx 18rpx 14rpx;
  background: rgba(255, 255, 255, 0.84);
  border-radius: 18rpx;
}

.audio-progress-slider {
  margin: 0;
}

.audio-progress-time {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #475569;
}

.audio-src-text {
  margin-top: 18rpx;
  padding: 18rpx;
  font-size: 22rpx;
  color: #334155;
  line-height: 1.6;
  word-break: break-all;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 18rpx;
}

.audio-btn-row {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
}

.audio-action-btn {
  flex: 1;
  height: 78rpx;
  line-height: 78rpx;
  font-size: 27rpx;
  border-radius: 18rpx;
  background: #f8fafc;
  color: #0f172a;
}

.primary-btn,
.download-btn,
.share-btn {
  background: #2563eb;
  color: #ffffff;
}

.empty-tip {
  margin-top: 18rpx;
  font-size: 24rpx;
  color: #94a3b8;
}

.text-list {
  display: grid;
  gap: 16rpx;
}

.text-item {
  padding: 20rpx;
  background: #f8fafc;
  border: 1rpx solid #e2e8f0;
  border-radius: 20rpx;
}

.speaker-tag {
  display: inline-flex;
  padding: 8rpx 16rpx;
  margin-bottom: 12rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #1d4ed8;
  background: rgba(37, 99, 235, 0.1);
  border-radius: 999rpx;
}

.speaker-text {
  font-size: 26rpx;
  line-height: 1.7;
  color: #334155;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-box {
  max-height: 420rpx;
  padding: 18rpx;
  background: #020617;
  border-radius: 20rpx;
  box-sizing: border-box;
}

.log-line {
  margin-bottom: 10rpx;
  font-family: monospace;
  font-size: 22rpx;
  line-height: 1.6;
  color: #cbd5e1;
  word-break: break-all;
}
</style>

