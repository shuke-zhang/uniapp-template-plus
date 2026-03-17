import { onBeforeUnmount } from 'vue'
import { pickDialogAudioFile } from '../services/dialog-file.service'
import { useRealtimeDialogState } from '../state/useRealtimeDialogState'
import { useDialogSession } from './useDialogSession'

/**
 * 实时对话页面的控制器入口。
 *
 * 这个 hook 位于页面组件和底层会话能力之间，负责把“状态”和“行为”整理成
 * 一套适合模板直接消费的接口。页面层只需要绑定这里返回的字段和方法，
 * 不需要知道 websocket、录音或文件处理细节。
 *
 * 这样分层后，页面组件会更稳定：
 * 1. 模板层只管渲染和交互，不承载复杂业务逻辑。
 * 2. 会话层专注处理连接、协议、录音和资源释放。
 * 3. 控制器层负责把前两者组装成页面真正可用的能力集合。
 */
export function useRealtimeDialogController() {
  const state = useRealtimeDialogState()
  const session = useDialogSession(state)

  async function handleConnectAction() {
    if (!state.isReady.value && !state.isConnecting.value) {
      await session.connectDialog()
      return
    }
    await session.disconnectDialog()
  }

  /**
   * 处理发音人选择变化。
   *
   * `picker` 返回的是索引值，因此这里会先转成数字并做边界校验，
   * 确保不会因为异常输入把当前选中项写成无效状态。
   */
  function handleSpeakerChange(event: { detail?: { value?: string | number } }) {
    const index = Number(event?.detail?.value)
    if (!Number.isNaN(index) && index >= 0 && index < state.speakerOptions.length)
      state.speakerIndex.value = index
  }

  /**
   * 打开文件选择器并把本地音频路径写回状态。
   *
   * 这里统一处理异常并同步到 `errorText`，这样页面层无需在点击事件里
   * 重复书写 try/catch。
   */
  async function pickAudioFile() {
    try {
      state.errorText.value = ''
      state.audioFilePath.value = await pickDialogAudioFile()
    }
    catch (error) {
      state.errorText.value = error instanceof Error ? error.message : String(error)
      throw error
    }
  }

  onBeforeUnmount(async () => {
    await session.destroySession()
  })

  return {
    ...state,
    currentAudioUrl: session.currentAudioUrl,
    handleConnectAction,
    handleSpeakerChange,
    pickAudioFile,
    sendAudioFileChunks: session.sendAudioFileChunks,
    sendHello: session.sendHello,
    sendText: session.sendText,
    startMicrophoneStreaming: session.startMicrophoneStreaming,
    stopRecorder: session.stopRecorder,
  }
}
