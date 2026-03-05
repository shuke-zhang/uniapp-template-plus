<route lang="json" type="page">
{
  "style": {
    "navigationBarTitleText": "鎾 TTS 娴嬭瘯"
  }
}
</route>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
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

interface PodcastRoundText {
  speaker: string
  text: string
}

interface UniSocketCloseEvent {
  code?: number
  reason?: string
}

interface SpeakerOption {
  label: string
  value: string
}

const speakerOptions: SpeakerOption[] = [
  { label: 'Black Cat Host', value: 'zh_female_mizaitongxue_v2_saturn_bigtts' },
  { label: '澶т竴鍏堢敓', value: 'zh_male_dayixiansheng_v2_saturn_bigtts' },
  { label: '鍒橀', value: 'zh_male_liufei_v2_saturn_bigtts' },
  { label: '灏忕', value: 'zh_male_xiaolei_v2_saturn_bigtts' },
]

const inputText = ref('Hello, please create a short podcast intro.')
const promptText = ref('')
const selectedSpeakerIndex = ref(0)
const selectedSpeakerIndex2 = ref(1)
const useHeadMusic = ref(true)
const useTailMusic = ref(false)
const isLoading = ref(false)
const statusText = ref('绛夊緟杈撳叆')
const errorText = ref('')
const logs = ref<string[]>([])
const audioSrc = ref('')
const audioBytes = ref(0)
const podcastTexts = ref<PodcastRoundText[]>([])
const audioEl = ref<HTMLAudioElement | null>(null)

let currentSocket: WebSocket | null = null
let currentLogHandler: ((msg: string) => void) | null = null
const selectedSpeaker = computed(() => speakerOptions[selectedSpeakerIndex.value] ?? speakerOptions[0])
const selectedSpeaker2 = computed(() => speakerOptions[selectedSpeakerIndex2.value] ?? speakerOptions[1] ?? speakerOptions[0])

/**
 * 鑾峰彇杩愯鏃跺叏灞€ Buffer锛堝瓨鍦ㄦ椂浼樺厛鐢ㄤ簬 UTF-8 缂栬В鐮侊級銆?
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
 * 灏嗗瓧绗︿覆缂栫爜涓?UTF-8 瀛楄妭鏁扮粍锛堝吋瀹?App 鐜锛夈€?
 *
 * @param value - 寰呯紪鐮佸瓧绗︿覆銆?
 * 缂栫爜绛栫暐锛?
 * - 浼樺厛浣跨敤杩愯鏃跺叏灞€ `Buffer.from(str, 'utf8')`
 * - 鏃?Buffer 鏃朵娇鐢ㄧ函 JS UTF-8 缂栫爜
 *
 * @param value - 寰呯紪鐮佸瓧绗︿覆銆?
 * @returns UTF-8 瀛楄妭鏁扮粍銆?
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
 * 灏?UTF-8 瀛楄妭鏁扮粍瑙ｇ爜涓哄瓧绗︿覆锛堝吋瀹?App 鐜锛夈€?
 *
 * 瑙ｇ爜绛栫暐锛?
 * - 浣跨敤绾?JS UTF-8 瑙ｇ爜锛堥伩鍏嶄緷璧?`TextDecoder`锛?
 *
 * @param bytes - 寰呰В鐮佸瓧鑺傛暟缁勩€?
 * @returns 瑙ｇ爜鍚庣殑瀛楃涓层€?
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
 * 鍐欏叆椤甸潰鏃ュ織锛堜繚鐣欐渶杩?50 鏉★級銆?
 *
 * @param message - 鏃ュ織鏂囨湰銆?
 */
function pushLog(message: string) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`
  logs.value = [line, ...logs.value].slice(0, 50)
}

/**
 * 鐢熸垚杩炴帴/浼氳瘽浣跨敤鐨勫敮涓€ ID銆?
 *
 * @returns 绠€鍗?UUID 椋庢牸瀛楃涓层€?
 */
function genId(): string {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)
  return `${Date.now().toString(16)}-${random()}-${random()}-${random()}-${random()}${random()}`
}

/**
 * 绛夊緟鎸囧畾姣鏁般€?
 *
 * @param ms - 姣鏁般€?
 * @returns Promise銆?
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 鍚堝苟澶氭闊抽瀛楄妭銆?
 *
 * @param chunks - 闊抽鍒嗙墖鏁扮粍銆?
 * @returns 鍚堝苟鍚庣殑瀛楄妭鏁版嵁銆?
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

/**
 * 灏嗕簩杩涘埗闊抽杞崲涓哄彲鎾斁鍦板潃锛堜紭鍏堜娇鐢?Blob URL锛夈€?
 *
 * @param bytes - 闊抽瀛楄妭銆?
 * @param format - 闊抽鏍煎紡锛屽 `mp3`銆?
 * @returns 鍙洿鎺ョ粦瀹氬埌 `<audio>` 鐨勫湴鍧€銆?
 */
function buildAudioUrl(bytes: Uint8Array, format: string): string {
  const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg'

  if (typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    let arrayBuffer: ArrayBuffer

    const rawBuffer = bytes.buffer

    if (rawBuffer instanceof SharedArrayBuffer) {
      // 蹇呴』澶嶅埗涓虹湡姝ｇ殑 ArrayBuffer
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
      // 杩欓噷绫诲瀷琚畨鍏ㄦ敹绐勪负 ArrayBuffer
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

  throw new Error('褰撳墠鐜涓嶆敮鎸佺敓鎴愰煶棰戞挱鏀惧湴鍧€')
}

/**
 * 閲婃斁鏃х殑 Blob URL锛岄伩鍏嶉噸澶嶇敓鎴愬悗鍗犵敤鍐呭瓨銆?
 *
 * @param url - 鏃х殑闊抽鍦板潃銆?
 */
function revokeAudioUrl(url: string) {
  if (!url)
    return
  if (typeof URL !== 'undefined' && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

/**
 * 鍦ㄤ笉淇敼 `WebSocket` 绫绘枃浠剁殑鍓嶆彁涓嬶紝鍒涘缓鍙緵鍗忚灞備娇鐢ㄧ殑杩炴帴瀹炰緥銆?
 *
 * 鍋氭硶锛?
 * - 瀹炰緥浠嶇劧浣跨敤 `new WebSocket(...)`
 * - 椤甸潰鑷閫氳繃 `uni.connectSocket` 浼犲叆閴存潈 header
 * - 灏嗗簳灞?`SocketTask` 鎸傚埌瀹炰緥鐨?`socketInstance` 涓?
 * - 鍙浆鍙?`open/close/error` 浜嬩欢缁欏崗璁眰锛涘師濮嬫秷鎭敱鍗忚灞傜洿鎺ョ洃鍚?`socketInstance.onMessage`
 *
 * @param headers - 杩炴帴璇锋眰澶淬€?
 * @returns 宸茶繛鎺ョ殑 `WebSocket` 瀹炰緥銆?
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

  // 椤甸潰鏃ュ織鎺ュ叆浣犲皝瑁呯被鐨勪簨浠剁郴缁燂紙渚夸簬鎺掓煡杩炴帴鐘舵€侊級
  currentLogHandler = (msg: string) => pushLog(`socket: ${msg}`)
  ws.on('log', currentLogHandler as any)
  ws.on('open', () => pushLog('socket: open'))
  ws.on('close', reason => pushLog(`socket: close ${reason || ''}`))
  ws.on('error', err => pushLog(`socket: error ${err || ''}`))

  wsEx.isCreate = false
  wsEx.isConnect = false
  wsEx.isInitiative = false

  // 涓嶄慨鏀逛綘灏佽绫绘簮鐮佺殑鍓嶆彁涓嬶紝杩欓噷浠呰礋璐ｂ€滃甫閴存潈澶粹€濆垱寤哄簳灞?SocketTask锛?
  // 骞剁户缁寕杞藉洖浣犵殑 WebSocket 瀹炰緥锛屽悗缁崗璁眰浠嶇劧浣跨敤璇ュ疄渚嬨€?
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
        pushLog(`杩炴帴鍒涘缓澶辫触: ${message}`)
        ws.emit('error', message)
      }
    },
  })

  const socketTask = wsEx.socketInstance as UniNamespace.SocketTask | null
  if (!socketTask) {
    throw new Error('socketInstance 鍒涘缓澶辫触')
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
      reject(new Error(err || 'WebSocket 杩炴帴澶辫触'))
    }

    ws.on('open', onOpen as any)
    ws.on('error', onError as any)
  })

  pushLog('WebSocket connected')
  return ws
}

/**
 * 鍏抽棴褰撳墠 socket锛堝瀛樺湪锛夈€?
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
 * 鏍规嵁椤甸潰杈撳叆鏋勫缓鎾 TTS 璇锋眰鍙傛暟銆?
 *
 * @returns 璇锋眰瀵硅薄锛堜細鍦ㄥ彂閫佸墠琚?JSON.stringify锛夈€?
 */
function buildRequestParams() {
  return {
    input_id: `podcast_${Date.now()}`,
    input_text: inputText.value.trim(),
    prompt_text: promptText.value.trim(),
    action: 0,
    speaker_info: {
      random_order: false,
      // 鎾妯″紡瑕佹眰浼?2 涓彂闊充汉
      speakers: [selectedSpeaker.value.value, selectedSpeaker2.value.value],
    },
    nlp_texts: [],
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
 * 澶勭悊鍙戦煶浜洪€夋嫨鍙樺寲銆?
 *
 * @param event - `picker` 鍙樻洿浜嬩欢銆?
 */
function handleSpeakerChange(event: { detail?: { value?: string | number } }) {
  const index = Number(event?.detail?.value)
  if (!Number.isNaN(index) && index >= 0 && index < speakerOptions.length) {
    selectedSpeakerIndex.value = index
  }
}

/**
 * 澶勭悊绗簩鍙戦煶浜洪€夋嫨鍙樺寲銆?
 *
 * @param event - `picker` 鍙樻洿浜嬩欢銆?
 */
function handleSpeakerChange2(event: { detail?: { value?: string | number } }) {
  const index = Number(event?.detail?.value)
  if (!Number.isNaN(index) && index >= 0 && index < speakerOptions.length) {
    selectedSpeakerIndex2.value = index
  }
}

/**
 * 鐢熸垚鎾闊抽骞惰嚜鍔ㄦ挱鏀俱€?
 */
async function generatePodcast() {
  const text = inputText.value.trim()
  if (!text) {
    errorText.value = 'Please enter text to generate'
    return
  }

  if (!APPID || !AccessToken || !SecretKey) {
    errorText.value = '璇峰厛鍦?access.ts 涓厤缃?APPID / AccessToken / SecretKey'
    return
  }

  if (selectedSpeaker.value.value === selectedSpeaker2.value.value) {
    errorText.value = 'Please select two different speakers'
    return
  }

  revokeAudioUrl(audioSrc.value)
  audioSrc.value = ''
  audioBytes.value = 0
  podcastTexts.value = []
  errorText.value = ''
  logs.value = []
  isLoading.value = true
  statusText.value = '姝ｅ湪杩炴帴鏈嶅姟...'

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
    pushLog('鍑嗗寤虹珛杩炴帴')
    const runtimeInfo = uni.getSystemInfoSync() as Record<string, any>
    const endpoint = resolveSocketEndpoint(runtimeInfo)
    if (String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase() === 'mp-weixin' && !sockBaseUrlMpWx) {
      throw new Error('微信小程序未配置 VITE_MP_WX_PODCAST_ENDPOINT。请使用已在微信后台配置为合法域名的 wss 代理地址。')
    }
    pushLog(`连接地址: ${endpoint}`)
    ws = await createProtocolSocket(headers, endpoint)
    currentSocket = ws

    statusText.value = '鍙戦€佽繛鎺ュ垵濮嬪寲...'
    await StartConnection(ws)
    pushLog('宸插彂閫?StartConnection')

    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.ConnectionStarted)
    pushLog('鏀跺埌 ConnectionStarted')

    const sessionId = genId()
    const reqParams = buildRequestParams()
    statusText.value = '鍙戦€佷細璇濊姹?..'
    await StartSession(
      ws,
      encodeUtf8(JSON.stringify(reqParams)),
      sessionId,
    )
    pushLog(`宸插彂閫?StartSession: ${sessionId}`)

    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.SessionStarted)
    pushLog('鏀跺埌 SessionStarted')

    await FinishSession(ws, sessionId)
    pushLog('宸插彂閫?FinishSession锛岀瓑寰呮湇鍔＄娴佸紡杩斿洖')
    statusText.value = '姝ｅ湪鐢熸垚闊抽锛岃绋嶅€?..'

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
        statusText.value = `姝ｅ湪鎺ユ敹闊抽... ${Math.round(audioBytes.value / 1024)} KB`
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
          pushLog('鏀跺埌 PodcastRoundEnd')
        }

        if (msg.event === EventType.PodcastEnd) {
          pushLog('鏀跺埌 PodcastEnd')
        }
      }

      if (msg.event === EventType.SessionFinished) {
        pushLog('鏀跺埌 SessionFinished')
        break
      }
    }

    statusText.value = '鍏抽棴杩炴帴涓?..'
    await FinishConnection(ws)
    pushLog('宸插彂閫?FinishConnection')
    await WaitForEvent(ws, MsgType.FullServerResponse, EventType.ConnectionFinished)
    pushLog('鏀跺埌 ConnectionFinished')

    if (audioChunks.length === 0) {
      throw new Error('No audio data received from server')
    }

    const merged = concatUint8Arrays(audioChunks)
    audioBytes.value = merged.length
    audioSrc.value = buildAudioUrl(merged, 'mp3')
    statusText.value = 'Generation complete, preparing playback'
    pushLog(`闊抽鐢熸垚瀹屾垚锛?{Math.round(merged.length / 1024)} KB`)

    await nextTick()
    try {
      await audioEl.value?.play?.()
      pushLog('Auto play started')
    }
    catch (err) {
      pushLog(`鑷姩鎾斁澶辫触锛岃鎵嬪姩鐐瑰嚮鎾斁锛?{String(err)}`)
    }
  }
  catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    errorText.value = msg
    statusText.value = '鐢熸垚澶辫触'
    pushLog(`閿欒锛?{msg}`)
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
            鐏北鎾璇煶鐢熸垚娴嬭瘯
          </view>
          <view class="hero-subtitle">
            杈撳叆鏂囨湰鍚庤蛋 WebSocket 鍗忚鐢熸垚闊抽锛岃繑鍥炲悗鑷姩鎾斁
          </view>
        </view>
        <view class="status-pill" :class="{ loading: isLoading }">
          {{ statusText }}
        </view>
      </view>

      <view class="form-block">
        <view class="field-label">
          杈撳叆鏂囨湰
        </view>
        <textarea
          v-model="inputText"
          class="text-input"
          :maxlength="3000"
          placeholder="璇疯緭鍏ラ渶瑕佺敓鎴愭挱瀹㈣闊崇殑鍐呭"
          :disabled="isLoading"
        />
      </view>

      <view class="form-block compact">
        <view class="field-label">
          Prompt锛堝彲閫夛級
        </view>
        <input
          v-model="promptText"
          class="mini-input"
          placeholder="optional"
          :disabled="isLoading"
        >
      </view>

      <view class="form-block compact">
        <view class="field-label">
          鍙戦煶浜?
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
              鍒囨崲
            </view>
          </view>
        </picker>
      </view>

      <view class="form-block compact">
        <view class="field-label">
          鍙戦煶浜猴紙绗簩浣嶏級
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
              鍒囨崲
            </view>
          </view>
        </picker>
      </view>

      <view class="form-block compact">
        <view class="field-label">
          闊虫晥璁剧疆
        </view>
        <view class="toggle-grid">
          <view class="toggle-item">
            <view class="toggle-text">
              <view class="toggle-title">
                寮€澶撮煶鏁?
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
                缁撳熬闊虫晥
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
          {{ isLoading ? 'Generating...' : 'Generate and Play' }}
        </button>
        <view class="meta-info">
          <text>鍙戦煶浜?锛歿{ selectedSpeaker.label }}</text>
          <text>鍙戦煶浜?锛歿{ selectedSpeaker2.label }}</text>
          <text>闊抽澶у皬锛歿{ Math.round(audioBytes / 1024) }} KB</text>
          <text>鏂囨湰娈垫暟锛歿{ podcastTexts.length }}</text>
        </view>
      </view>

      <view v-if="errorText" class="error-box">
        {{ errorText }}
      </view>
    </view>

    <view class="result-card">
      <view class="section-title">
        闊抽缁撴灉
      </view>
      <audio
        ref="audioEl"
        class="audio-player"
        :src="audioSrc"
        controls
        autoplay
      />
      <view v-if="!audioSrc" class="empty-tip">
        鐢熸垚瀹屾垚鍚庝細鍦ㄨ繖閲岃嚜鍔ㄦ挱鏀鹃煶棰?
      </view>
    </view>

    <view v-if="podcastTexts.length" class="result-card">
      <view class="section-title">
        鎾鏂囨湰鐗囨
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
        杩愯鏃ュ織
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


