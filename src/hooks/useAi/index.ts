import type { AiOptionsModel } from '@/model/ai'
import { setAiContent } from '@/pages/ai/const'

export interface AiMessage extends AiModel.AiRequestMessagesModel {
  /**
   * @description 是否是流式传输中的临时消息
   */
  streaming?: boolean
}
export function useAi(options: AiOptionsModel) {
  // const optionsParams = {
  //   'deepseek-r1': options.params,
  //   'doubao': options.params,
  //   '通义千问': options.params,
  //   '智谱清言': options.params,
  // }
  const modelName = ref(options.name)
  /**
   * @description 聊天内容s
   */
  const content = ref<AiMessage[]>([])
  /**
   * 发送消息
   */
  /**
   * @description GaoChatSSEClient组件实例
   */
  const chatSSEClientRef = ref<AiModel.GaoChatSSEClientInstance>()

  /**
   * @description ai请求loading
   */
  const loading = ref(false)

  /**
   * @description ai聊天请求错误的错误信息
   */
  const error = ref()
  /**
   * @description ai聊天请求成功的返回内容
   */
  const message = ref('')

  /**
   *  @description 开始聊天
   */
  function startChat() {
    loading.value = true
    if (!content.value) {
      return showToast('请先输入聊天内容')
    }

    return chatSSEClientRef.value?.startChat({
      url: options.baseURL,
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
      response_format: {
        type: 'json_object',
      },
      body: {
        messages: content.value ? content.value.filter(item => item.content) : [],
        stream: true,
        model: options.model as AiModel.AIMODELTYPE,

      },
    })
  }

  /**
   *  @description 停止聊天
   */
  function stopChat() {
    loading.value = false
    return chatSSEClientRef.value?.stopChat()
  }

  /**
   * @description 聊天请求开始的回调
   */
  function onStart() {
    loading.value = true
  }
  /**
   * @description ai聊天请求错误的回调
   */
  function onError(err: Error | string) {
    console.log('出错啦', err)
    error.value = err
  }
  /**
   * @description ai聊天请求成功的回调
   * @param msg 聊天内容
   */
  function onSuccess(msg: string) {
    // #ifdef MP-WEIXIN
    const { content: streamContent } = wxExtractStreamContent(msg)
    // message.value += streamContent
    hotUpdate(streamContent)
    // #endif

    // #ifdef APP || APP-PLUS || H5
    const { content: appContent } = appExtractStreamContent(msg)
    hotUpdate(appContent)
    // #endif
  }
  /**
   * @description 聊天请求结束的回调
   */
  function onFinish() {
    loading.value = false

    const lastIndex = content.value.length - 1
    if (content.value[lastIndex]?.streaming) {
      // 移除流式标记并格式化内容
      const finalContent = {
        ...content.value[lastIndex],
        content: content.value[lastIndex].content,
        streaming: undefined,
      }
      content.value.splice(lastIndex, 1, finalContent)
    }
  }

  function hotUpdate(acceptMsg: string) {
    // 寻找最后一个消息的位置
    const lastIndex = content.value.length - 1

    // 确保存在进行中的AI消息
    if (lastIndex < 0 || content.value[lastIndex].role !== 'assistant') {
      const text = setAiContent({
        modeName: modelName.value || '',
        type: 'accept',
        msg: acceptMsg,
        streaming: true,
      })

      content.value.push(text)
    }
    else {
      const newContent = [...content.value]
      newContent[lastIndex] = {
        ...newContent[lastIndex],
        content: newContent[lastIndex].content + acceptMsg,
      }
      content.value = newContent // 通过数组替换触发更新
    }
  }

  return {
    loading,
    chatSSEClientRef,
    modelName,
    content,
    message,
    startChat,
    stopChat,
    onStart,
    onError,
    onSuccess,
    onFinish,
    hotUpdate,
  }
}
/**
 * 微信小程序专用 - 格式化流数据
 */
export function wxExtractStreamContent(data: string): { content: string, reasoningContent: string, id: string } {
  if (!data) {
    return { content: '', reasoningContent: '', id: '' }
  }

  // 处理每一行并提取信息
  const result = data
    .split('\n') // 按行分割
    .filter((line: string) => line.startsWith('data:')) // 只保留以 'data:' 开头的行
    .map((line: string) => line.replace(/^data:\s*/, '')) // 移除 'data:' 和首尾空格
    .filter((jsonStr: string) => jsonStr !== '[DONE]') // 排除 '[DONE]' 的行 表示结束
    .map((jsonStr: string) => {
      try {
        const obj = JSON.parse(jsonStr)
        const delta = obj.choices?.[0]?.delta || {}
        return {
          content: delta.content || '',
          reasoningContent: delta.reasoning_content || '',
          id: obj.id || '',
        }
      }
      catch (e) {
        console.error('JSON 解析失败:', jsonStr, e)
        return { content: '', reasoningContent: '', id: '' } // 保持与原错误处理一致
      }
    })
    // 合并所有块的信息
    .reduce(
      (acc, curr) => {
        acc.content += curr.content
        acc.reasoningContent += curr.reasoningContent
        // 仅保留第一个非空的 id
        if (curr.id && !acc.id) {
          acc.id = curr.id
        }
        return acc
      },
      { content: '', reasoningContent: '', id: '' },
    )

  // 对最终内容做格式化处理

  return result
}

/**
 * @description app专用 - 格式化流数据
 * @param data 流数据 - {"choices":[{"delta":{"content":"我可以","role":"assistant"},"index":0}],"created":1741223276,"id":"021741223274929ff303ac16ece080358e099ce5c58d82c6d6863","model":"deepseek-r1-250120","service_tier":"default","object":"chat.completion.chunk","usage":null}
 */
export function appExtractStreamContent(data: any): { content: string, reasoningContent: string, id: string } {
  if (!data) {
    return { content: '', reasoningContent: '', id: '' }
  }

  const obj = JSON.parse(data)
  const delta = obj.choices[0].delta || {}
  const content = delta.content || ''
  const reasoningContent = delta.reasoning_content || ''
  const id = obj.id || ''

  return {
    content,
    reasoningContent,
    id,
  }
}
