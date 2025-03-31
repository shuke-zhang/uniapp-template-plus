import { defineStore } from 'pinia'
import { WebSocket } from './webSocket'

const DEBUG = true
let ws: WebSocket | null = null
function getWs() {
  if (!ws) {
    ws = new WebSocket()
  }
  return ws
}
export const useSocketStore = defineStore('socket', () => {
  const userStore = useUserStore()

  const init = debounce(() => _init())
  function _init() {
    if (!userStore.userInfo)
      return
    const ws = getWs()
    ws.reset()
    ws.initSocket()
    ws?.on('log', (e) => {
      if (DEBUG) {
        console.log(e)
      }
    })

    // addLog('🍍 init')
    ws.on('open', () => {
      addLog('🍍 open')
      running = true
      startHeartbeat()

      ws.sendMessage({
        msgType: 'wechatMiniRegister',
        deviceNo: `user_${userStore.userInfo?.userId}`,
      })

      ws.on('message', (messageData) => {
        if (messageData) {
          const msgType = messageData.msgType
        }
      })
    })
    ws.on('error', () => {

    })
  }
  init()

  return {
    init,
  }
})
