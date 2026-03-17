import {
  MsgType,
  ReceiveMessage,
  WaitForEvent,
} from '../../../protocols'
import { dialogEventCode } from '../config/dialog-events'
import { dialogFileTransferConfig, dialogSessionConfig } from '../config/dialog-runtime'
import { dialogServiceConfig } from '../config/dialog-service'
import type { RealtimeDialogState } from '../state/useRealtimeDialogState'
import {
  readDialogAudioFileAsPcm,
  splitDialogAudioChunks,
} from '../services/dialog-file.service'
import { resolveDialogPayloadText } from '../services/dialog-message.service'
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
} from '../services/dialog-protocol.service'
import { decodeUtf8, genId, sleep } from '../utils/binary'
import { useDialogAudioOutput } from './useDialogAudioOutput'
import { useDialogRecorder } from './useDialogRecorder'
import type { WebSocket } from '@/store/modules/socket/webSocket'

/**
 * 负责“实时对话会话”这一层的完整生命周期。
 *
 * 主要职责：
 * 1. 建立和关闭 websocket
 * 2. 发送 StartConnection / StartSession / FinishSession / FinishConnection
 * 3. 分发文本输入、麦克风输入、音频文件输入
 * 4. 持续接收服务端事件并写回页面状态
 * 5. 协调录音 hook 和音频输出 hook
 *
 * 这个 hook 不创建页面 ref，页面状态由 `useRealtimeDialogState()` 提供，
 * 这里专注于“会话编排”和“协议流程”。
 */
export function useDialogSession(state: RealtimeDialogState) {
  let wsRef: WebSocket | null = null
  let sessionIdRef = ''
  let receiveLoopTaskToken = 0
  let sentAudioChunkCount = 0
  let sentAudioBytes = 0
  let detachSocketBinding: (() => void) | null = null
  let disposed = false

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
    audioEl: state.audioEl,
    format: state.format,
    appendChat: state.appendChat,
    pushLog: state.pushLog,
  })

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
      state.pushLog(`已发送音频帧 ${sentAudioChunkCount}，累计 ${Math.round(sentAudioBytes / 1024)}KB`)
  }

  /**
   * 在每轮请求前清理缓存，防止上一轮回复残留到下一轮。
   */
  function resetStreamingBuffers() {
    clearAssistantAudioFlushTimer()
    resetAudioBuffers()
    resetTransferStats()
  }

  /**
   * 对发送音频帧做一层包装，把统计逻辑集中在这里。
   */
  async function sendAudioChunk(rawAudio: Uint8Array) {
    if (!wsRef || !sessionIdRef)
      throw new Error('会话未建立')

    await sendAudioTaskChunk(wsRef, sessionIdRef, rawAudio)
    trackAudioChunkSent(rawAudio.length)
  }

  const { startMicrophoneStreaming, stopRecorder } = useDialogRecorder({
    isReady: state.isReady,
    isRecording: state.isRecording,
    isSending: state.isSending,
    statusText: state.statusText,
    errorText: state.errorText,
    pushLog: state.pushLog,
    appendChat: state.appendChat,
    sendAudioChunk,
    hasActiveSession: () => Boolean(wsRef && sessionIdRef),
    getTransferSummary: () => buildTransferSummary(),
  })

  /**
   * 发送本地音频文件。
   *
   * 这里不关心文件选择 UI，只消费页面里已经选好的 `audioFilePath`。
   */
  async function sendAudioFileChunks() {
    if (!wsRef || !sessionIdRef)
      throw new Error('会话未建立')
    if (!state.audioFilePath.value.trim())
      throw new Error('请先选择音频文件')

    resetStreamingBuffers()
    const bytes = await readDialogAudioFileAsPcm(
      state.audioFilePath.value.trim(),
      state.pushLog,
    )
    const chunks = splitDialogAudioChunks(bytes)

    state.isSendingFile.value = true
    state.isSending.value = true
    state.statusText.value = '音频文件发送中...'
    state.appendChat('system', `开始发送音频文件：${state.audioFilePath.value}`)

    try {
      for (const chunk of chunks) {
        await sendAudioChunk(chunk)
        await sleep(dialogFileTransferConfig.chunkIntervalMs)
      }
      state.appendChat('system', '音频文件发送完成，等待服务端处理')
      if (state.isReady.value)
        state.statusText.value = '文件已发送，等待回复'
    }
    finally {
      state.isSendingFile.value = false
      state.isSending.value = false
    }
  }

  /**
   * 持续接收服务端消息，直到：
   * - 页面被销毁
   * - 当前会话被替换
   * - 服务端主动结束会话
   */
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
        state.isReady.value = true
        state.statusText.value = '会话已建立'
        state.pushLog('收到 SessionStarted')
        continue
      }

      if (event === dialogEventCode.chatResponse) {
        const text = resolveDialogPayloadText(payload)
        if (text)
          appendAssistantTextChunk(text)
        continue
      }

      if (event === dialogEventCode.ttsEnded) {
        if (!state.helloFinished.value) {
          state.helloFinished.value = true
          if (state.dialogMode.value === 'text')
            state.statusText.value = '已就绪，可输入文本对话'
          state.pushLog('欢迎语播放结束')
        }
        await finalizeAssistantAudioIfAny()
        if (state.dialogMode.value === 'text')
          state.isSending.value = false
        continue
      }

      if (
        event === dialogEventCode.asrInfo
        || event === dialogEventCode.asrResponse
        || event === dialogEventCode.asrEnded
      ) {
        state.pushLog(`ASR事件: ${event}`)
        continue
      }

      if (event === dialogEventCode.sessionFinished || event === dialogEventCode.sessionFailed) {
        state.statusText.value = event === dialogEventCode.sessionFinished ? '会话结束' : '会话失败'
        state.isReady.value = false
        break
      }
    }
  }

  /**
   * 建立会话并进入当前页面选择的输入模式。
   *
   * 核心时序：
   * 1. connect socket
   * 2. StartConnection
   * 3. 等待 ConnectionStarted
   * 4. StartSession
   * 5. 等待 SessionStarted
   * 6. 进入 text / audio / audio_file 对应分支
   */
  async function connectDialog() {
    if (state.isConnecting.value || state.isReady.value)
      return

    state.errorText.value = ''
    state.isConnecting.value = true
    state.statusText.value = '连接中...'
    resetStreamingBuffers()

    try {
      const runtimeInfo = uni.getSystemInfoSync() as Record<string, any>
      const endpoint = resolveDialogSocketEndpoint(runtimeInfo)
      if (String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase() === 'mp-weixin' && !dialogServiceConfig.endpointMpWx) {
        throw new Error('微信小程序未配置 VITE_MP_WX_DIALOG_ENDPOINT。请使用已在微信后台配置为合法域名的 wss 代理地址。')
      }

      state.pushLog(`连接地址: ${endpoint}`)
      const binding = await createProtocolSocket({
        endpoint,
        headers: createDialogHeaders(),
        onLog: state.pushLog,
      })

      wsRef = binding.ws
      detachSocketBinding = binding.detach
      sessionIdRef = genId()
      receiveLoopTaskToken += 1
      const loopToken = receiveLoopTaskToken

      state.pushLog('发送 StartConnection')
      await sendDialogEvent(binding.ws, dialogEventCode.startConnection, {})
      await WaitForEvent(binding.ws, MsgType.FullServerResponse, dialogEventCode.connectionStarted as any)

      await sendDialogEvent(
        binding.ws,
        dialogEventCode.startSession,
        buildStartSessionPayload({
          speaker: state.selectedSpeaker.value.value,
          format: state.format.value,
          botName: state.botName.value,
          systemRole: state.systemRole.value,
          speakingStyle: state.speakingStyle.value,
          recvTimeout: Number(state.recvTimeout.value) || 30,
          dialogMode: state.dialogMode.value,
        }),
        { sessionId: sessionIdRef },
      )
      await WaitForEvent(binding.ws, MsgType.FullServerResponse, dialogEventCode.sessionStarted as any)

      state.isReady.value = true
      state.statusText.value = '会话已建立'
      state.pushLog('收到 SessionStarted')

      void receiveLoop(binding.ws, loopToken).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        state.errorText.value = message
        state.statusText.value = '接收中断'
        state.pushLog(`接收循环异常: ${message}`)
      })

      if (state.dialogMode.value === 'text') {
        await sendHello()
      }
      else if (state.dialogMode.value === 'audio') {
        await sendHello()
        await waitForHelloEnded()
        await sendChatTextQuery(binding.ws, sessionIdRef, '你好，我也叫豆包')
        await startMicrophoneStreaming()
      }
      else if (state.dialogMode.value === 'audio_file') {
        await sendAudioFileChunks()
      }
    }
    catch (error) {
      state.errorText.value = error instanceof Error ? error.message : String(error)
      state.pushLog(`连接失败: ${state.errorText.value}`)
      await disconnectDialog()
      state.statusText.value = '连接失败'
    }
    finally {
      state.isConnecting.value = false
    }
  }

  /**
   * 发送欢迎语请求。
   */
  async function sendHello() {
    if (!wsRef || !sessionIdRef)
      return

    state.helloFinished.value = false
    await sendSayHello(wsRef, sessionIdRef)
    state.statusText.value = '欢迎语播放中...'
  }

  /**
   * 等待欢迎语播放完成。
   *
   * 音频模式下，需要先等欢迎语结束，再启动用户侧后续动作，
   * 避免首段录音与欢迎语播放互相打断。
   */
  async function waitForHelloEnded(timeoutMs = dialogSessionConfig.helloTimeoutMs) {
    const startTime = Date.now()
    while (state.isReady.value && !state.helloFinished.value && Date.now() - startTime < timeoutMs) {
      await sleep(dialogSessionConfig.helloPollingIntervalMs)
    }
    if (!state.helloFinished.value)
      state.pushLog('未在超时时间内收到 TTSEnded，继续后续流程')
  }

  /**
   * 发送一条用户文本消息。
   */
  async function sendText() {
    const content = state.userInput.value.trim()
    if (!content) {
      state.errorText.value = '请输入文本内容'
      return
    }
    if (!wsRef || !state.isReady.value) {
      state.errorText.value = '请先建立对话连接'
      return
    }

    state.errorText.value = ''
    state.isSending.value = true
    state.appendChat('user', content)
    state.userInput.value = ''
    resetStreamingBuffers()
    state.statusText.value = '发送文本并等待回复...'

    try {
      await sendChatTextQuery(wsRef, sessionIdRef, content)
    }
    catch (error) {
      state.isSending.value = false
      state.errorText.value = error instanceof Error ? error.message : String(error)
    }
  }

  /**
   * 断开当前会话。
   *
   * 清理顺序：
   * 1. 停止本地播放和录音
   * 2. 让接收循环失效
   * 3. 尝试发送 FinishSession / FinishConnection
   * 4. 关闭底层 socket
   */
  async function disconnectDialog() {
    const ws = wsRef
    const sessionId = sessionIdRef

    clearAssistantAudioFlushTimer()
    stopPlayback()
    receiveLoopTaskToken += 1
    wsRef = null
    sessionIdRef = ''
    state.isReady.value = false
    state.helloFinished.value = false
    state.isSending.value = false
    state.isSendingFile.value = false
    stopRecorder({ silent: true })
    state.statusText.value = '已断开'

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
      state.pushLog(`FinishSession 失败: ${String(error)}`)
    }

    try {
      await sendDialogEvent(ws, dialogEventCode.finishConnection, {})
      await WaitForEvent(ws, MsgType.FullServerResponse, dialogEventCode.connectionFinished as any)
    }
    catch (error) {
      state.pushLog(`FinishConnection 失败: ${String(error)}`)
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

  /**
   * 页面销毁时的最终清理入口。
   */
  async function destroySession() {
    disposed = true
    await disconnectDialog()
    disposeAudio(state.chatList.value.map(item => item.audioUrl).filter((url): url is string => Boolean(url)))
  }

  return {
    connectDialog,
    currentAudioUrl,
    destroySession,
    disconnectDialog,
    sendAudioFileChunks,
    sendHello,
    sendText,
    startMicrophoneStreaming,
    stopRecorder,
  }
}
