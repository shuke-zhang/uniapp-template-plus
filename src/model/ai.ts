export interface AiOptionsModel {
  /**
   * 模型名称
   */
  name?: string
  /**
   * 模型apiKey
   */
  apiKey: string
  /**
   * 模型基础URL
   */
  baseURL: string
  /**
   * 模型名称
   */
  model: string
  /**
   * 是否开启流式传输
   */
  stream: boolean
  /**
   * 用于各个模型传递消息的字段
   * 1. deepseek： messages
   * 2. doubao： text
   * 3. qwen： text
   */
  params?: string

  /**
   * 模型里面对象的字段名
   * 1. deepseek： content
   * 2. doubao： text
   * 3. qwen： text
   */
  sendParamsName?: string
  /**
   * 模型返回给我时的字段名
   * 1. deepseek： assistant
   * 2. doubao： assistant
   * 3. qwen： system
   * 4.
   */
  resultName?: APIRoLE

  /**
   * 模型icon图标
   */
  icon?: string
}

/**
 * 接口响应内容
 */
export interface AiResultModel {
  /**
   * 该对话的唯一标识符。
   */
  id: string
  /**
   * 模型生成的 completion 回答对象
   */
  choices: ChoicesModel[]

}

/**
 * 模型回复内容
 */
export interface ChoicesModel {
  /**
   * 模型停止生成 token 的原因
   * 1. stop：模型自然停止生成，或遇到 stop 序列中列出的字符串
   * 2. length：输出长度达到了模型上下文长度限制，或达到了 max_tokens 的限制
   * 3. content_filter：输出内容因触发过滤策略而被过滤
   * 4. insufficient_system_resource: 系统推理资源不足，生成被打断
   */
  finish_reason: FINISH_REASON
  /**
   * 该 completion 在模型生成的 completion 的选择列表中的索引。
   */
  index: number

  /**
   * 模型生成的 completion 文本
   */
  message: AiMessageModel
  /**
   * 创建聊天完成时的 Unix 时间戳（以秒为单位）。
   */
  created: number
  /**
   * 使用的模型
   */
  model: string
  /**
   * 对象的类型, 其值为 chat.completion。
   */
  object: ['chat.completion']
}

/**
 * 消息对象
 */
export interface AiMessageModel {
  /**
   * 生成的内容 deepseek
   */
  content?: string

  /**
   * 生成的内容 - 仅用于 通义千问 - qwen-plus 模型
   */
  text?: string
  /**
   * 角色
   * 1. "assistant" - 助手
   * 2. "user" - 用户
   * 3. "system" - 系统 - 仅用于 通义千问 - qwen-plus 模型
   *
   */
  role: APIRoLE
  /**
   * 仅适用于 deepseek-reasoner 模型。内容为 assistant 消息中在最终答案之前的推理内容
   */
  reasoning_content?: string

}

type APIRoLE = 'user' | 'assistant' | 'system'

/**
 * 模型停止生成 token 的原因
 * 1. stop：模型自然停止生成，或遇到 stop 序列中列出的字符串
 * 2. length：输出长度达到了模型上下文长度限制，或达到了 max_tokens 的限制
 * 3. content_filter：输出内容因触发过滤策略而被过滤
 * 4. insufficient_system_resource: 系统推理资源不足，生成被打断
 */
export type FINISH_REASON = 'stop' | 'length' | 'content_filter' | 'insufficient_system_resource'
