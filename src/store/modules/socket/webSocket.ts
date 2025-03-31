export class WebSocket extends EventEmitter<{
  connect: () => void
  message: (messageData: any) => void
  open: (open: UniApp.OnSocketOpenCallbackResult) => void
  close: (reason: string) => void
  error: (error?: string) => void
  log: (msg: string) => void
}> {
  url: string
  /** WebSocket 是否创建成功 */
  isCreate: boolean
  /** WebSocket 是否已经连接 */
  isConnect: boolean
  /** 是否主动断开 */
  isInitiative: boolean
  /** WebSocket 实例 */
  socketInstance: null | UniNamespace.SocketTask = null
  reconnectTimer: NodeJS.Timeout | null = null
  retryTime = 5
  constructor(url = 'ws://192.168.3.117:8899/demo') {
    super()
    this.url = url
    this.isCreate = false
    this.isConnect = false
    this.isInitiative = false
    this.socketInstance = null
  }

  // 初始化websocket连接
  initSocket = debounce(() => {
    this.isCreate = false
    this.isConnect = false
    this.isInitiative = false
    this.socketInstance = null
    this.emit('log', '🛜 初始化websocket连接')
    this.socketInstance = uni.connectSocket({
      url: this.url,
      header: {
        'content-type': 'application/json',
      },
      success: () => {
        this.isCreate = true
        console.log('[ws]', '已经连接')
        this.emit('connect')
      },
      fail: (err) => {
        console.error(err)
        this.isCreate = false
      },
    })
    this.createSocket()
  })

  /**
   * @description 创建websocket连接
   */
  createSocket() {
    if (this.isCreate) {
      this.emit('log', '🛜 WebSocket 开始初始化')
      // 监听 WebSocket 连接打开事件
      try {
        this.socketInstance?.onOpen((res) => {
          this.emit('log', '🛜 WebSocket 连接成功')
          this.isConnect = true
          this.emit('open', res)

          // 打开心跳检测
        })
        // 监听 WebSocket 接受到服务器的消息事件
        this.socketInstance?.onMessage((res) => {
          const _data = JSON.parse(res.data)
          const data = {
            msgType: _data.msgType,
            val: parseJSON(_data.val),
          }
          this.emit('log', `✉️ ${data.msgType} ${JSON.stringify(data.val) || 'no message'}`)
          this.emit('message', data)
        })
        // 监听 WebSocket 连接关闭事件
        this.socketInstance?.onClose((e) => {
          if (e.reason === 'logout') {
            this.emit('log', '🛜 服务器关闭 logout')
            return
          }
          if (e.reason === 'no-user-info') {
            this.emit('log', '🛜 客户端关闭 no-user-info')
            return
          }
          this.emit('log', `🛜 其他原因关闭 ${e.code} ${e.reason}`)
          console.log('e', e)
          console.log('WebSocket 关闭了')

          const id = getCacheUserInfo()?.userId
          this.isInitiative = false
          this.isConnect = false
          if (id)
            this.reconnect()
        })
        // 监听 WebSocket 错误事件
        this.socketInstance?.onError((e) => {
          this.emit('log', `🛜 出错了 ${e.errMsg}`)
          console.log('WebSocket 出错了', e)
          this.isInitiative = false
          this.isConnect = false
          this.reconnect()
        })
      }
      catch (error) {
        this.emit('log', '🛜 创建出错了')
        console.warn(error)
      }
    }
    else {
      this.emit('log', '🛜 初始化失败!')
    }
  }

  /**
   * @description 发送消息
   */
  sendMessage(value: any) {
    const param = JSON.stringify(value)
    this.emit('log', `🛜 sendMessage ${param}`)
    return new Promise((resolve, reject) => {
      this.socketInstance?.send({
        data: param,
        success() {
          console.log('消息发送成功', value)
          resolve(true)
        },
        fail(error) {
          console.log('消息发送失败')
          reject(error)
        },
      })
    })
  }

  /**
   *  @description 重新连接
   */
  reconnect = debounce(() => {
    // 停止发送心跳
    // clearTimeout(this.reconnectTimer!);
    // 如果不是人为关闭的话，进行重连
    this.emit('log', `🛜 reconnect ${this.isInitiative}`)
    if (!this.isInitiative) {
      this.emit('log', '🛜 重新连接 initSocket')
      this.initSocket()
    }
    else {
      // this.emit('log', '🛜 重新连接 initSocket');
    }
  }, 300)

  /**
   * @description 关闭 WebSocket 连接
   */
  closeSocket(reason = '关闭') {
    this.emit('log', '🛜 关闭')

    if (!this.socketInstance || !this.isCreate)
      return
    this.socketInstance?.close({
      reason,
      success: () => {
        this.onClose(reason)
      },
      fail: (e) => {
        console.log(e)
        this.emit('log', '🛜 关闭 WebSocket 失败222')
        this.emit('error', `${JSON.stringify(e)}`)
        this.onClose('关闭 WebSocket 失败 强行关闭')
        this.reconnect()
        this.emit('log', `🛜 isCreate ${this.isCreate} 222`)
      },
    })
  }

  /**
   * @description 重置
   */
  onClose(reason: string) {
    this.emit('log', `🛜 onClose reason >>> ${reason}`)
    this.isCreate = false
    this.isConnect = false
    this.isInitiative = true
    this.socketInstance = null
    this.emit('close', reason)
    this.reset()
  }
}
