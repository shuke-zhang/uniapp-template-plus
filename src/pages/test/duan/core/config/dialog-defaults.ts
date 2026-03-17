import type { DialogFormModel, DialogRuntimeModel } from '../models/dialog'

/**
 * 页面表单默认值。
 *
 * 这组数据用于初始化实时对话页面的输入控件。它们代表“第一次进入页面时的建议值”，
 * 而不是一次固定不可变的业务配置。把默认值单独抽出来后，页面、状态层和测试代码
 * 都可以复用同一份初始化基线。
 */
export const dialogDefaultFormModel: DialogFormModel = {
  userInput: '你好，请介绍一下你自己，并告诉我你可以做什么。',
  botName: '对话助手',
  systemRole: '你是一个实时语音对话助手，回答时请保持专业、准确、简洁，并优先使用中文。',
  speakingStyle: '声音自然，表达流畅，语气温和。',
  recvTimeout: 30,
  speakerIndex: 1,
  format: 'pcm_s16le',
  showAdvanced: false,
  dialogMode: 'text',
  audioFilePath: '',
}

/**
 * 页面运行时默认状态。
 *
 * 它描述的是页面尚未建立连接前的初始状态，例如尚未就绪、未在发送、未在录音、
 * 没有错误信息等。将这部分默认值独立出来，可以避免状态初始化逻辑散落在 hook 内部。
 */
export const dialogDefaultRuntimeModel: DialogRuntimeModel = {
  isConnecting: false,
  isReady: false,
  isSending: false,
  helloFinished: false,
  isRecording: false,
  isSendingFile: false,
  statusText: '等待连接',
  errorText: '',
}
