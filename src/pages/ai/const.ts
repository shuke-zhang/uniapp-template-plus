import type { AiMessage } from '@/hooks'
import type { AiOptionsModel } from '@/model/ai'

export const aiModelList: AiOptionsModel[] = [
  {
    name: 'deepseek-r1',
    model: 'deepseek-r1-250120',
    icon: 'deepseek',
    params: 'messages',
    sendParamsName: 'content',
    apiKey: '12d2a70e-f213-4148-8451-12af29a246b9',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    stream: true,
    resultName: 'assistant',
  },
  {
    name: 'doubao',
    model: 'doubao-vision-pro-32k-241028',
    icon: 'doubao',
    params: 'messages',
    sendParamsName: 'content',
    apiKey: '12d2a70e-f213-4148-8451-12af29a246b9',
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    stream: true,
    resultName: 'assistant',
  },
  {
    name: '通义千问',
    model: 'qwen-plus',
    icon: 'qwen',
    params: 'messages',
    sendParamsName: 'content',
    apiKey: 'sk-517e75059148424ba3e09569c6438d02',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    stream: true,
    resultName: 'system',
  },
  {
    name: '智谱清言',
    model: 'glm-4-plus',
    icon: 'zhipu',
    params: 'messages',
    sendParamsName: 'content',
    apiKey: '89f09f507bb946f4a59025dcf43ce448.MhPuRF0zxXjy5WIC',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    stream: true,
    resultName: 'system',
  },

]

export function setAiContent(options: { modeName: string, type: 'send' | 'accept', msg: string, streaming?: boolean },

): AiMessage {
  const targetModel = aiModelList.find(item => item.name === options.modeName)

  if (!targetModel) {
    throw new Error(`未找到 ${options.modeName} 对应的 AI 模型配置`)
  }

  const message = options.modeName === '通义千问' ? [{ type: 'text', text: options.msg }] : options.msg

  return {
    role: options.type === 'send' ? 'user' : targetModel.resultName || 'assistant',
    [targetModel.sendParamsName || 'content']: message,
    streaming: options.streaming,
  }
}
