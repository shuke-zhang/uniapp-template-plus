import { APPID, AccessToken } from './access'

/**
 * Generate a UUID v4-like identifier for connection tracing.
 *
 * @returns Randomized identifier string.
 */
function createUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0
    const value = char === 'x' ? random : ((random & 0x3) | 0x8)
    return value.toString(16)
  })
}

/**
 * Build websocket request headers used by speech service.
 *
 * @returns Header object wrapped in `RequestHeaders`.
 */
export function getWebSocketRequestHeaders() {
  const RequestHeaders = {
    'X-Api-App-Id': APPID,
    'X-Api-Access-Key': AccessToken,
    'X-Api-App-Key': 'aGjiRDfUWi',
    'X-Api-Resource-Id': 'volc.service_type.10050',
    'X-Api-Connect-Id': createUUID(),
  }
  return {
    RequestHeaders,
  }
}
