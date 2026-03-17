import { computed, ref } from 'vue'
import { dialogDefaultFormModel, dialogDefaultRuntimeModel } from '../config/dialog-defaults'
import { dialogLogConfig } from '../config/dialog-runtime'
import { dialogSpeakerOptions } from '../config/dialog-service'
import type { ChatItem, ChatRole, DialogAudioFormat, DialogMode } from '../models/dialog'
import { genId } from '../utils/binary'

/**
 * 集中创建实时对话页面使用的全部响应式状态。
 *
 * 这个 hook 只负责维护页面状态，不负责 websocket、录音或协议细节。
 * 它的目标是为控制器层和会话层提供一份统一、稳定的状态容器，
 * 让页面交互状态与底层实现细节保持解耦。
 */
export function useRealtimeDialogState() {
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

  /**
   * 向日志面板追加一条记录，并只保留最近的若干条。
   *
   * 这里统一补上时间戳，便于调试时快速判断事件发生顺序。
   * 通过条数裁剪，也能避免日志无限增长影响页面性能。
   */
  function pushLog(message: string) {
    const line = `[${new Date().toLocaleTimeString()}] ${message}`
    logs.value = [line, ...logs.value].slice(0, dialogLogConfig.maxLines)
  }

  /**
   * 向聊天区追加一条消息记录。
   *
   * 不论是用户发言、助手回复还是系统提示，都会在这里被整理成同一种结构，
   * 方便模板层统一渲染。
   */
  function appendChat(role: ChatRole, text: string, audioUrl?: string) {
    chatList.value = [
      ...chatList.value,
      { id: genId(), role, text, audioUrl },
    ]
  }

  return {
    audioEl,
    audioFilePath,
    appendChat,
    botName,
    chatList,
    dialogMode,
    errorText,
    format,
    helloFinished,
    isConnecting,
    isReady,
    isRecording,
    isSending,
    isSendingFile,
    logs,
    pushLog,
    recvTimeout,
    selectedSpeaker,
    showAdvanced,
    speakerIndex,
    speakerOptions,
    speakingStyle,
    statusText,
    systemRole,
    userInput,
  }
}

export type RealtimeDialogState = ReturnType<typeof useRealtimeDialogState>
