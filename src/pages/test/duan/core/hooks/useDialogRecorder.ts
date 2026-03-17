import type { Ref } from 'vue'
import { dialogRecorderConfig } from '../config/dialog-runtime'
import type {
  ChatRole,
  RecorderBackend,
  RecorderPermissionResult,
  ShukeRecorderPlugin,
} from '../models/dialog'
import {
  detectRecorderEventType,
  extractPcmChunk,
  getRecorderStartOptions,
  normalizeUniFrameChunk,
  parseRecorderPayload,
  resolveRecorderBackend,
} from '../utils/recorder'

interface StopRecorderOptions {
  silent?: boolean
}

interface UseDialogRecorderOptions {
  isReady: Ref<boolean>
  isRecording: Ref<boolean>
  isSending: Ref<boolean>
  statusText: Ref<string>
  errorText: Ref<string>
  pushLog: (message: string) => void
  appendChat: (role: ChatRole, text: string) => void
  sendAudioChunk: (chunk: Uint8Array) => Promise<void>
  hasActiveSession: () => boolean
  getTransferSummary: () => string
}

/**
 * 负责“麦克风录音输入”这一条链路。
 *
 * 它只处理录音侧问题：
 * 1. 根据运行环境选择录音后端
 * 2. 申请录音权限
 * 3. 监听录音帧回调
 * 4. 把帧数据归一化成 PCM 字节流
 * 5. 把 PCM 数据交给上层会话逻辑发送
 *
 * 它不直接管理 websocket，只通过回调把音频数据交回会话层。
 */
export function useDialogRecorder(options: UseDialogRecorderOptions) {
  let recorderPlugin: ShukeRecorderPlugin | null = null
  let recorderManager: UniNamespace.RecorderManager | null = null
  let recorderFrameHandler: ((result: any) => void) | null = null
  let recorderStopHandler: (() => void) | null = null
  let recorderErrorHandler: ((result: any) => void) | null = null
  let activeRecorderBackend: RecorderBackend | null = null
  let frameWatchTimer: ReturnType<typeof setTimeout> | null = null

  function getRecorderPlugin(): ShukeRecorderPlugin {
    if (recorderPlugin)
      return recorderPlugin

    const plugin = uni.requireNativePlugin('shuke_recorder') as ShukeRecorderPlugin | null
    if (!plugin || typeof plugin.startRecord !== 'function' || typeof plugin.requestPermission !== 'function')
      throw new Error('当前环境未加载 shuke_recorder 原生插件')

    recorderPlugin = plugin
    return plugin
  }

  function getUniRecorderManager(): UniNamespace.RecorderManager {
    if (recorderManager)
      return recorderManager
    recorderManager = uni.getRecorderManager()
    return recorderManager
  }

  function clearFrameWatchTimer() {
    if (frameWatchTimer) {
      clearTimeout(frameWatchTimer)
      frameWatchTimer = null
    }
  }

  /**
   * 清理旧回调，避免重复监听造成一帧被发送多次。
   */
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

  /**
   * 根据当前录音后端申请权限。
   */
  async function ensureRecordPermission(backend: RecorderBackend): Promise<void> {
    if (backend === 'native_plugin') {
      const plugin = getRecorderPlugin()
      await new Promise<void>((resolve, reject) => {
        plugin.requestPermission((result) => {
          const permission = parseRecorderPayload(result) as RecorderPermissionResult
          if (permission?.granted) {
            resolve()
            return
          }
          reject(new Error(permission?.message || '麦克风权限未授权，请在系统设置中开启录音权限后重试'))
        })
      })
      return
    }

    const uniAny = uni as unknown as {
      authorize?: (options: {
        scope: string
        success: () => void
        fail: (error: unknown) => void
      }) => void
    }
    if (typeof uniAny.authorize !== 'function')
      return

    await new Promise<void>((resolve, reject) => {
      uniAny.authorize?.({
        scope: 'scope.record',
        success: resolve,
        fail: error => reject(new Error(error ? String(error) : '麦克风权限未授权，请在系统设置中开启录音权限后重试')),
      })
    })
  }

  function applyStoppedState(status = '麦克风已停止') {
    options.isRecording.value = false
    options.isSending.value = false
    activeRecorderBackend = null
    if (options.isReady.value)
      options.statusText.value = status
  }

  /**
   * 停止录音，并在需要时输出统计日志。
   *
   * `silent` 用于页面销毁或断链时，避免重复打印“录音结束”日志。
   */
  function stopRecorder(stopOptions?: StopRecorderOptions) {
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

    const wasRecording = options.isRecording.value || options.isSending.value
    applyStoppedState()
    if (!stopOptions?.silent && wasRecording) {
      const summary = options.getTransferSummary()
      if (summary)
        options.pushLog(summary)
    }
  }

  /**
   * 启动麦克风流式采集。
   *
   * 对页面来说这里只暴露“开始采集”动作；
   * 具体是原生插件还是 uni recorder，全部封装在这里。
   */
  async function startMicrophoneStreaming() {
    if (!options.hasActiveSession())
      throw new Error('会话未建立')
    if (options.isRecording.value)
      return

    const runtimeInfo = uni.getSystemInfoSync() as Record<string, any>
    const backend = resolveRecorderBackend(runtimeInfo)
    await ensureRecordPermission(backend)
    activeRecorderBackend = backend
    let hasFrameOutput = false

    options.isRecording.value = true
    options.isSending.value = true
    options.statusText.value = '麦克风采集中...'
    options.appendChat('system', `已开始麦克风采集并实时发送音频帧（${backend === 'native_plugin' ? 'native plugin' : 'uni recorder'} + gzip）`)
    options.pushLog(`运行平台: ${runtimeInfo.uniPlatform || runtimeInfo.platform || 'unknown'}, 系统: ${runtimeInfo.system || 'unknown'}`)
    options.pushLog(`录音后端: ${backend === 'native_plugin' ? 'shuke_recorder' : 'uni.getRecorderManager'}`)
    options.pushLog(`录音基础参数: sampleRate=${dialogRecorderConfig.sampleRate}, channels=${dialogRecorderConfig.channels}`)

    try {
      if (backend === 'native_plugin') {
        const plugin = getRecorderPlugin()
        plugin.startRecord({ type: 'pcm', sampleRate: dialogRecorderConfig.sampleRate }, (result) => {
          const payload = parseRecorderPayload(result)
          const eventType = detectRecorderEventType(payload)

          if (eventType === 'start') {
            options.pushLog('原生录音已启动')
            return
          }

          if (eventType === 'stop') {
            if (!options.isRecording.value && !options.isSending.value)
              return
            applyStoppedState()
            options.pushLog('录音已停止')
            return
          }

          if (eventType === 'error') {
            const message = payload.message || '录音错误'
            clearFrameWatchTimer()
            applyStoppedState('麦克风异常停止')
            options.errorText.value = message
            options.pushLog(`录音错误: ${message}`)
            return
          }

          if (eventType !== 'process')
            return
          if (!options.hasActiveSession() || !options.isRecording.value)
            return

          const chunk = extractPcmChunk(payload)
          if (!chunk || chunk.length === 0)
            return

          if (!hasFrameOutput) {
            hasFrameOutput = true
            clearFrameWatchTimer()
            options.pushLog(`录音帧开始产出，sampleRate=${payload.sampleRate || dialogRecorderConfig.sampleRate}, volume=${payload.volume ?? 0}`)
          }

          void options.sendAudioChunk(chunk).catch((error) => {
            options.pushLog(`录音帧发送失败: ${String(error)}`)
          })
        })
        return
      }

      const manager = getUniRecorderManager()
      clearUniRecorderListeners()

      recorderFrameHandler = (result: any) => {
        if (!options.hasActiveSession() || !options.isRecording.value)
          return

        const frameBuffer = result?.frameBuffer ?? result?.data ?? result?.buffer
        const chunk = normalizeUniFrameChunk(frameBuffer)
        if (!chunk || chunk.length === 0) {
          options.pushLog(`录音帧类型异常: ${typeof frameBuffer}`)
          return
        }

        if (!hasFrameOutput) {
          hasFrameOutput = true
          clearFrameWatchTimer()
          options.pushLog('录音帧开始产出（uni recorder）')
        }

        void options.sendAudioChunk(chunk).catch((error) => {
          options.pushLog(`录音帧发送失败: ${String(error)}`)
        })
      }

      recorderStopHandler = () => {
        clearFrameWatchTimer()
        if (!options.isRecording.value && !options.isSending.value)
          return
        applyStoppedState()
        options.pushLog('录音已停止')
      }

      recorderErrorHandler = (error: any) => {
        clearFrameWatchTimer()
        const message = error?.errMsg || '录音错误'
        applyStoppedState('麦克风异常停止')
        options.errorText.value = message
        options.pushLog(`录音错误: ${message}`)
      }

      const managerAny = manager as Record<string, any>
      if (typeof managerAny.onFrameRecorded !== 'function')
        throw new TypeError('当前平台 uni.getRecorderManager 不支持 onFrameRecorded')

      manager.onFrameRecorded(recorderFrameHandler)
      manager.onStop(recorderStopHandler)
      manager.onError(recorderErrorHandler)
      manager.start(getRecorderStartOptions())
      options.pushLog('uni recorder 已启动')
      clearFrameWatchTimer()
      frameWatchTimer = setTimeout(() => {
        if (options.isRecording.value && !hasFrameOutput) {
          options.pushLog('3秒内未收到录音帧：请检查小程序基础库、录音权限，以及 Recorder format/frameSize 参数兼容性')
        }
      }, dialogRecorderConfig.frameWatchTimeoutMs)
    }
    catch (error) {
      clearFrameWatchTimer()
      applyStoppedState()
      clearUniRecorderListeners()
      throw error
    }
  }

  return {
    startMicrophoneStreaming,
    stopRecorder,
  }
}
