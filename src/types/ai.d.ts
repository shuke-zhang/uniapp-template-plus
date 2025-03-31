declare namespace AiModel{
  /**
   * @description GaoChatSSEClient组件实例
   */
  interface GaoChatSSEClientInstance {
    /**
     * @description 开始聊天
     */
    startChat: (params: AiModel.AiRequestModel) => void

    /**
     * @description 停止聊天
     */
    stopChat: () => void
  }

  /**
   * @description ai请求时的header
   * @param Authorization - apiKey
   */
  interface AiRequestHeaderModel {
    Authorization: string
  }

  /**
   * @description ai请求时的body
   * @param stream - 是否开启流式传输
   * @param model - 模型名称
   * @param messages - 消息内容
   */
  interface AiRequestBodyModel {
    stream: boolean
    model: AIMODELTYPE
    messages: AiRequestMessagesModel[]
  }

  /**
   * @description ai请求时的内容
   * @param url - 请求地址
   * @param headers - 请求头配置
   * @param body - 请求体参数
   */
  interface AiRequestModel {
    /** 请求地址 */
    url: string
    /** 请求头配置 */
    headers: AiModel.AiRequestHeaderModel
    /** 请求体参数 */
    body: AiModel.AiRequestBodyModel
    /**
     * @description 响应格式
     * @param type - 响应格式类型
     */
    response_format: {
      type: 'text' | 'json_object'
    }
  }

  /**
   * @description ai所有模型
   */

  /**
   * @description ai请求时的内容
   */
  interface AiRequestMessagesModel {
    role?: string
    content?: string
    text?: string
    /**
     * 是否开启继续对话功能
     */
    prefix?: boolean

  }

  /**
   * @description ai所有模型
   */
  type AIMODELTYPE = 'deepseek-r1-250120' | 'doubao-vision-pro-32k-241028' | 'qwen-plus' | 'glm-4-plus'

}
