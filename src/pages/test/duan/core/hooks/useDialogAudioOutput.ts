import { type Ref, nextTick, ref } from 'vue'
import { dialogAudioConfig } from '../config/dialog-runtime'
import type { ChatRole, DialogAudioFormat } from '../models/dialog'
import { buildAudioUrl, revokeAudioUrl } from '../utils/audio'
import { concatUint8Arrays } from '../utils/binary'

interface UseDialogAudioOutputOptions {
  audioEl: Ref<HTMLAudioElement | null>
  format: Ref<DialogAudioFormat>
  appendChat: (role: ChatRole, text: string, audioUrl?: string) => void
  pushLog: (message: string) => void
}

/**
 * 管理助手语音输出。
 *
 * 职责拆分：
 * 1. 累积服务端返回的流式文本片段和音频片段
 * 2. 在合适时机把音频片段合并成一个可播放资源
 * 3. 同时协调 `InnerAudioContext` 与页面 `<audio>` 标签播放
 * 4. 在页面卸载时释放音频资源，避免内存泄漏
 *
 * 这个 hook 不关心 websocket、协议事件和录音输入，只负责“播放输出”。
 */
export function useDialogAudioOutput(options: UseDialogAudioOutputOptions) {
  const currentAudioUrl = ref('')

  let currentAssistantAudioChunks: Uint8Array[] = []
  let currentAssistantTextChunks: string[] = []
  let assistantAudioFlushTimer: ReturnType<typeof setTimeout> | null = null
  let innerAudioContext: UniNamespace.InnerAudioContext | null = null

  function appendAssistantAudioChunk(chunk: Uint8Array) {
    currentAssistantAudioChunks.push(chunk)
    scheduleAssistantAudioFlush()
  }

  function appendAssistantTextChunk(text: string) {
    if (text)
      currentAssistantTextChunks.push(text)
  }

  /**
   * 在一轮回复结束前，先清空暂存区，防止不同轮次的片段串在一起。
   */
  function resetStreamingBuffers() {
    currentAssistantAudioChunks = []
    currentAssistantTextChunks = []
  }

  function clearAssistantAudioFlushTimer() {
    if (assistantAudioFlushTimer) {
      clearTimeout(assistantAudioFlushTimer)
      assistantAudioFlushTimer = null
    }
  }

  /**
   * 做一个很短的延迟合并，让相邻的音频分片尽量归并成一段完整回复，
   * 避免页面上出现碎片化的短音频。
   */
  function scheduleAssistantAudioFlush() {
    clearAssistantAudioFlushTimer()
    assistantAudioFlushTimer = setTimeout(() => {
      void finalizeAssistantAudioIfAny().catch((error) => {
        options.pushLog(`音频合并失败: ${String(error)}`)
      })
    }, dialogAudioConfig.flushDelayMs)
  }

  function stopPlayback() {
    try {
      innerAudioContext?.stop()
    }
    catch {}
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
    innerAudioContext.onError?.((error: any) => {
      options.pushLog(`innerAudio 错误: ${error?.errMsg || JSON.stringify(error)}`)
    })
    return innerAudioContext
  }

  /**
   * 如果当前已经积累到一段完整音频，就合并、生成播放地址并追加到聊天记录。
   */
  async function finalizeAssistantAudioIfAny() {
    clearAssistantAudioFlushTimer()
    if (!currentAssistantAudioChunks.length)
      return

    const merged = concatUint8Arrays(currentAssistantAudioChunks)
    currentAssistantAudioChunks = []
    const url = buildAudioUrl(merged, options.format.value, options.pushLog)
    revokeAudioUrl(currentAudioUrl.value)
    currentAudioUrl.value = url

    const text = currentAssistantTextChunks.join('').trim() || '（语音回复）'
    currentAssistantTextChunks = []
    options.appendChat('assistant', text, url)

    const innerAudio = getInnerAudioContext()
    if (innerAudio) {
      stopPlayback()
      innerAudio.src = url
      innerAudio.play()
    }

    await nextTick()
    try {
      await options.audioEl.value?.play?.()
    }
    catch (error) {
      options.pushLog(`自动播放失败: ${String(error)}`)
    }
  }

  /**
   * 页面卸载时释放所有由当前 hook 生成的音频资源。
   */
  function disposeAudio(extraAudioUrls: string[] = []) {
    clearAssistantAudioFlushTimer()
    stopPlayback()
    try {
      innerAudioContext?.destroy?.()
    }
    catch {}
    innerAudioContext = null

    revokeAudioUrl(currentAudioUrl.value)
    for (const url of extraAudioUrls)
      revokeAudioUrl(url)

    currentAudioUrl.value = ''
    resetStreamingBuffers()
  }

  return {
    currentAudioUrl,
    appendAssistantAudioChunk,
    appendAssistantTextChunk,
    clearAssistantAudioFlushTimer,
    disposeAudio,
    finalizeAssistantAudioIfAny,
    resetStreamingBuffers,
    stopPlayback,
  }
}
