import { computed, onBeforeUnmount, ref } from 'vue'
import {
  MsgType,
  ReceiveMessage,
  WaitForEvent,
} from '../../../protocols'
import {
  dialogDefaultFormModel,
  dialogDefaultRuntimeModel,
  dialogEventCode,
  dialogFileStreamConfig,
  dialogLogConfig,
  dialogServiceConfig,
  dialogSessionConfig,
  dialogSpeakerOptions,
} from '../config/dialog'
import type { ChatItem, ChatRole, DialogAudioFormat, DialogMode } from '../model/dialog'
import {
  buildStartSessionPayload,
  createDialogHeaders,
  createProtocolSocket,
  gunzipMaybe,
  parsePayloadJson,
  resolveDialogSocketEndpoint,
  sendAudioTaskChunk,
  sendChatTextQuery,
  sendDialogEvent,
  sendSayHello,
} from '../service/dialogProtocol'
import { decodeUtf8, genId, sleep } from '../utils/binary'
import { useDialogAudioOutput } from './useDialogAudioOutput'
import { useDialogRecorder } from './useDialogRecorder'
import type { WebSocket } from '@/store/modules/socket/webSocket'

/**
 * 实时对话页面的一体化编排 hook。
 *
 * 这个文件保留的是较早的一体化实现，内部同时管理页面状态、连接流程、
 * 录音发送和音频播放。虽然现在已经拆出更细的 `state/session/recorder/audio` 模块，
 * 但这里仍能作为完整流程的参考实现存在。
 *
 * 它负责的状态机大致包括：
 * 1. 建立 websocket 连接
 * 2. 启动对话会话
 * 3. 分发文本、麦克风或文件输入
 * 4. 接收流式文本与音频结果
 * 5. 在断开连接或页面卸载时释放资源
 */
export function useRealtimeDialog() {
  const userInput = ref(dialogDefaultFormModel.userInput)
  const botName = ref(dialogDefaultFormModel.botName)
  const systemRole = ref(dialogDefaultFormModel.systemRole)
  const speakingStyle = ref(dialogDefaultFormModel.speakingStyle)
  const recvTimeout = ref(dialogDefaultFormModel.recvTimeout)
  const speakerIndex = ref(dialogDefaultFormModel.speakerIndex)
  const format = ref<DialogAudioFormat>(dialogDefaultFormModel.format)
  const showAdvanced = ref(dialogDefaultFormModel.showAdvanced)
  const dialogMode = ref<DialogMode>(dialogDefaultFormModel.dialogMode)
  const audioFilePath = ref(dialogDefaultFormModel.audioFilePath)

  const isConnecting = ref(dialogDefaultRuntimeModel.isConnecting)
  const isReady = ref(dialogDefaultRuntimeModel.isReady)
  const isSending = ref(dialogDefaultRuntimeModel.isSending)
  const helloFinished = ref(dialogDefaultRuntimeModel.helloFinished)
  const isRecording = ref(dialogDefaultRuntimeModel.isRecording)
  const isSendingFile = ref(dialogDefaultRuntimeModel.isSendingFile)
  const statusText = ref(dialogDefaultRuntimeModel.statusText)
  const errorText = ref(dialogDefaultRuntimeModel.errorText)
  const chatList = ref<ChatItem[]>([])
  const logs = ref<string[]>([])
  const audioEl = ref<HTMLAudioElement | null>(null)

  const speakerOptions = dialogSpeakerOptions
  const selectedSpeaker = computed(() => speakerOptions[speakerIndex.value] ?? speakerOptions[0])

  let wsRef: WebSocket | null = null
  let sessionIdRef = ''
  let receiveLoopTaskToken = 0
  let sentAudioChunkCount = 0
  let sentAudioBytes = 0
  let detachSocketBinding: (() => void) | null = null
  let disposed = false

  function pushLog(message: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`
    logs.value = [line, ...logs.value].slice(0, dialogLogConfig.maxLines)
  }

  function appendChat(role: ChatRole, text: string, audioUrl?: string) {
    chatList.value = [
      ...chatList.value,
      { id: genId(), role, text, audioUrl },
    ]
  }

  function resetTransferStats() {
    sentAudioChunkCount = 0
    sentAudioBytes = 0
  }

  function buildTransferSummary(prefix = '录音结束') {
    if (!sentAudioChunkCount)
      return ''
    return `${prefix}，累计发送 ${sentAudioChunkCount} 帧，约 ${Math.round(sentAudioBytes / 1024)}KB`
  }

  function trackAudioChunkSent(chunkLength: number) {
    sentAudioChunkCount += 1
    sentAudioBytes += chunkLength
    if (sentAudioChunkCount % 20 === 0)
      pushLog(`已发送音频帧 ${sentAudioChunkCount}，累计 ${Math.round(sentAudioBytes / 1024)}KB`)
  }

  const {
    currentAudioUrl,
    appendAssistantAudioChunk,
    appendAssistantTextChunk,
    clearAssistantAudioFlushTimer,
    disposeAudio,
    finalizeAssistantAudioIfAny,
    resetStreamingBuffers: resetAudioBuffers,
    stopPlayback,
  } = useDialogAudioOutput({
    audioEl,
    format,
    appendChat,
    pushLog,
  })

  function resetStreamingBuffers() {
    clearAssistantAudioFlushTimer()
    resetAudioBuffers()
    resetTransferStats()
  }

  /**
   * 对协议层发送音频的能力做一层包装。
   *
   * 包装的主要目的不是改变发送逻辑，而是把传输统计统一收口，
   * 例如分片数量和累计字节数都在这里更新。
   */
  async function sendAudioChunk(rawAudio: Uint8Array) {
    if (!wsRef || !sessionIdRef)
      throw new Error('会话未建立')

    await sendAudioTaskChunk(wsRef, sessionIdRef, rawAudio)
    trackAudioChunkSent(rawAudio.length)
  }

  const { startMicrophoneStreaming, stopRecorder } = useDialogRecorder({
    isReady,
    isRecording,
    isSending,
    statusText,
    errorText,
    pushLog,
    appendChat,
    sendAudioChunk,
    hasActiveSession: () => Boolean(wsRef && sessionIdRef),
    getTransferSummary: () => buildTransferSummary(),
  })

  async function sendAudioFileChunks() {
    if (!wsRef || !sessionIdRef)
      throw new Error('会话未建立')
    if (!audioFilePath.value.trim())
      throw new Error('请先选择音频文件')

    const fs = uni.getFileSystemManager()
    const fileData = await new Promise<ArrayBuffer>((resolve, reject) => {
      fs.readFile({
        filePath: audioFilePath.value.trim(),
        success: (result: any) => {
          if (result.data instanceof ArrayBuffer) {
            resolve(result.data)
            return
          }
          reject(new Error('读取文件失败：返回数据不是 ArrayBuffer'))
        },
        fail: reject,
      })
    })

    let bytes = new Uint8Array(fileData)
    const isWav = (
      bytes.length > 44
      && bytes[0] === 0x52
      && bytes[1] === 0x49
      && bytes[2] === 0x46
      && bytes[3] === 0x46
      && bytes[8] === 0x57
      && bytes[9] === 0x41
      && bytes[10] === 0x56
      && bytes[11] === 0x45
    )

    resetStreamingBuffers()
    if (isWav) {
      bytes = bytes.slice(44)
      pushLog('检测到 WAV 文件，已剥离文件头后按 PCM 帧发送')
    }

    isSendingFile.value = true
    isSending.value = true
    statusText.value = '音频文件发送中...'
    appendChat('system', `开始发送音频文件：${audioFilePath.value}`)

    try {
      for (let offset = 0; offset < bytes.length; offset += dialogFileStreamConfig.chunkSize) {
        const chunk = bytes.slice(offset, Math.min(offset + dialogFileStreamConfig.chunkSize, bytes.length))
        await sendAudioChunk(chunk)
        await sleep(dialogFileStreamConfig.chunkIntervalMs)
      }
      appendChat('system', '音频文件发送完成，等待服务端处理')
      if (isReady.value)
        statusText.value = '文件已发送，等待回复'
    }
    finally {
      isSendingFile.value = false
      isSending.value = false
    }
  }

  async function pickAudioFile() {
    return new Promise<void>((resolve, reject) => {
      uni.chooseFile({
        count: 1,
        type: 'all',
        extension: ['wav', 'pcm'],
        success: (result: any) => {
          const file = result?.tempFiles?.[0] || result?.files?.[0]
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

  async function receiveLoop(ws: WebSocket, token: number) {
    while (true) {
      if (disposed || wsRef !== ws || token !== receiveLoopTaskToken)
        break

      const msg = await ReceiveMessage(ws)

      if (msg.type === MsgType.Error) {
        const payload = gunzipMaybe(msg.payload, msg.compression)
        throw new Error((payload && payload.length > 0) ? decodeUtf8(payload) : '服务端错误')
      }

      if (msg.type === MsgType.AudioOnlyServer) {
        appendAssistantAudioChunk(gunzipMaybe(msg.payload, msg.compression))
        continue
      }

      if (msg.type !== MsgType.FullServerResponse)
        continue

      const payload = parsePayloadJson(msg)
      const event = msg.event ?? 0

      if (event === dialogEventCode.sessionStarted) {
        isReady.value = true
        statusText.value = '会话已建立'
        pushLog('收到 SessionStarted')
        continue
      }

      if (event === dialogEventCode.chatResponse) {
        const text = resolvePayloadText(payload)
        if (text)
          appendAssistantTextChunk(text)
        continue
      }

      if (event === dialogEventCode.ttsEnded) {
        if (!helloFinished.value) {
          helloFinished.value = true
          if (dialogMode.value === 'text')
            statusText.value = '已就绪，可输入文本对话'
          pushLog('欢迎语播放结束')
        }
        await finalizeAssistantAudioIfAny()
        if (dialogMode.value === 'text')
          isSending.value = false
        continue
      }

      if (
        event === dialogEventCode.asrInfo
        || event === dialogEventCode.asrResponse
        || event === dialogEventCode.asrEnded
      ) {
        pushLog(`ASR事件: ${event}`)
        continue
      }

      if (event === dialogEventCode.sessionFinished || event === dialogEventCode.sessionFailed) {
        statusText.value = event === dialogEventCode.sessionFinished ? '会话结束' : '会话失败'
        isReady.value = false
        break
      }
    }
  }

  /**
   * 建立 websocket 连接，并进入当前选中的对话模式。
   *
   * 关键流程顺序如下：
   * 1. 建立 socket
   * 2. 发送 `StartConnection`
   * 3. 等待连接建立确认
   * 4. 发送 `StartSession`
   * 5. 等待会话启动确认
   * 6. 根据模式切换到文本、麦克风或文件输入流程
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
      const endpoint = resolveDialogSocketEndpoint(runtimeInfo)
      if (String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase() === 'mp-weixin' && !dialogServiceConfig.endpointMpWx) {
        throw new Error('微信小程序未配置 VITE_MP_WX_DIALOG_ENDPOINT。请使用已在微信后台配置为合法域名的 wss 代理地址。')
      }

      pushLog(`连接地址: ${endpoint}`)
      const binding = await createProtocolSocket({
        endpoint,
        headers: createDialogHeaders(),
        onLog: pushLog,
      })

      wsRef = binding.ws
      detachSocketBinding = binding.detach
      sessionIdRef = genId()
      receiveLoopTaskToken += 1
      const loopToken = receiveLoopTaskToken

      pushLog('发送 StartConnection')
      await sendDialogEvent(binding.ws, dialogEventCode.startConnection, {})
      await WaitForEvent(binding.ws, MsgType.FullServerResponse, dialogEventCode.connectionStarted as any)

      await sendDialogEvent(
        binding.ws,
        dialogEventCode.startSession,
        buildStartSessionPayload({
          speaker: selectedSpeaker.value.value,
          format: format.value,
          botName: botName.value,
          systemRole: systemRole.value,
          speakingStyle: speakingStyle.value,
          recvTimeout: Number(recvTimeout.value) || 30,
          dialogMode: dialogMode.value,
        }),
        { sessionId: sessionIdRef },
      )
      await WaitForEvent(binding.ws, MsgType.FullServerResponse, dialogEventCode.sessionStarted as any)

      isReady.value = true
      statusText.value = '会话已建立'
      pushLog('收到 SessionStarted')

      void receiveLoop(binding.ws, loopToken).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        errorText.value = message
        statusText.value = '接收中断'
        pushLog(`接收循环异常: ${message}`)
      })

      if (dialogMode.value === 'text') {
        await sendHello()
      }
      else if (dialogMode.value === 'audio') {
        await sendHello()
        await waitForHelloEnded()
        await sendChatTextQuery(binding.ws, sessionIdRef, '你好，我也叫豆包')
        await startMicrophoneStreaming()
      }
      else if (dialogMode.value === 'audio_file') {
        await sendAudioFileChunks()
      }
    }
    catch (error) {
      errorText.value = error instanceof Error ? error.message : String(error)
      pushLog(`连接失败: ${errorText.value}`)
      await disconnectDialog()
      statusText.value = '连接失败'
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

  async function waitForHelloEnded(timeoutMs = dialogSessionConfig.helloTimeoutMs) {
    const startTime = Date.now()
    while (isReady.value && !helloFinished.value && Date.now() - startTime < timeoutMs) {
      await sleep(dialogSessionConfig.helloPollingIntervalMs)
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
    resetStreamingBuffers()
    statusText.value = '发送文本并等待回复...'

    try {
      await sendChatTextQuery(wsRef, sessionIdRef, content)
    }
    catch (error) {
      isSending.value = false
      errorText.value = error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * 按“先本地停机、再尽力通知后端”的顺序关闭当前会话。
   *
   * 这样做可以先阻止页面继续录音或播放，避免 UI 仍在更新；
   * 随后再尽最大努力发送 `FinishSession` 和 `FinishConnection`，
   * 即使后端通知失败，也不会影响本地资源释放。
   */
  async function disconnectDialog() {
    const ws = wsRef
    const sessionId = sessionIdRef

    clearAssistantAudioFlushTimer()
    stopPlayback()
    receiveLoopTaskToken += 1
    wsRef = null
    sessionIdRef = ''
    isReady.value = false
    helloFinished.value = false
    isSending.value = false
    isSendingFile.value = false
    stopRecorder({ silent: true })
    statusText.value = '已断开'

    if (!ws) {
      detachSocketBinding?.()
      detachSocketBinding = null
      return
    }

    try {
      if (sessionId)
        await sendDialogEvent(ws, dialogEventCode.finishSession, {}, { sessionId })
    }
    catch (error) {
      pushLog(`FinishSession 失败: ${String(error)}`)
    }

    try {
      await sendDialogEvent(ws, dialogEventCode.finishConnection, {})
      await WaitForEvent(ws, MsgType.FullServerResponse, dialogEventCode.connectionFinished as any)
    }
    catch (error) {
      pushLog(`FinishConnection 失败: ${String(error)}`)
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

    detachSocketBinding?.()
    detachSocketBinding = null
  }

  async function handleConnectAction() {
    if (!isReady.value && !isConnecting.value) {
      await connectDialog()
      return
    }
    await disconnectDialog()
  }

  function handleSpeakerChange(event: { detail?: { value?: string | number } }) {
    const index = Number(event?.detail?.value)
    if (!Number.isNaN(index) && index >= 0 && index < speakerOptions.length)
      speakerIndex.value = index
  }

  onBeforeUnmount(async () => {
    disposed = true
    await disconnectDialog()
    disposeAudio(chatList.value.map(item => item.audioUrl).filter((url): url is string => Boolean(url)))
  })

  return {
    audioEl,
    audioFilePath,
    botName,
    chatList,
    currentAudioUrl,
    dialogMode,
    errorText,
    format,
    handleConnectAction,
    handleSpeakerChange,
    helloFinished,
    isConnecting,
    isReady,
    isRecording,
    isSending,
    isSendingFile,
    logs,
    pickAudioFile,
    recvTimeout,
    selectedSpeaker,
    sendAudioFileChunks,
    sendHello,
    sendText,
    showAdvanced,
    speakerIndex,
    speakerOptions,
    speakingStyle,
    startMicrophoneStreaming,
    statusText,
    stopRecorder,
    systemRole,
    userInput,
  }
}

function resolvePayloadText(payload: unknown): string {
  if (!payload || typeof payload !== 'object')
    return ''

  const record = payload as Record<string, unknown>
  const value = record.content ?? record.reply ?? record.text
  return value ? String(value) : ''
}
