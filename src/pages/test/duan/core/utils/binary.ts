/**
 * 生成一个轻量级唯一标识。
 *
 * 该 id 主要用于会话 id、消息 id 或连接跟踪，不追求强一致全局唯一，
 * 但足以满足当前页面内的区分需求。
 */
export function genId(): string {
  const random = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1)
  return `${Date.now().toString(16)}-${random()}-${random()}-${random()}-${random()}${random()}`
}

function getRuntimeBuffer():
  | {
    from: (value: string, encoding?: string) => Uint8Array
  }
  | undefined {
  const runtime = (globalThis as unknown as { Buffer?: any }).Buffer
  if (!runtime || typeof runtime.from !== 'function')
    return undefined
  return runtime
}

/**
 * 在不依赖 `TextEncoder` 的情况下把字符串编码成 UTF-8 字节流。
 *
 * 之所以手写兼容逻辑，是为了照顾部分运行环境缺少标准编码 API 的情况。
 */
export function encodeUtf8(value: string): Uint8Array {
  const runtimeBuffer = getRuntimeBuffer()
  if (runtimeBuffer)
    return new Uint8Array(runtimeBuffer.from(value, 'utf8'))

  const bytes: number[] = []
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x80) {
      bytes.push(code)
      continue
    }
    if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F))
      continue
    }
    if (code >= 0xD800 && code <= 0xDBFF && i + 1 < value.length) {
      const next = value.charCodeAt(i + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        const point = ((code - 0xD800) << 10) + (next - 0xDC00) + 0x10000
        bytes.push(
          0xF0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3F),
          0x80 | ((point >> 6) & 0x3F),
          0x80 | (point & 0x3F),
        )
        i++
        continue
      }
    }
    bytes.push(0xE0 | (code >> 12), 0x80 | ((code >> 6) & 0x3F), 0x80 | (code & 0x3F))
  }
  return new Uint8Array(bytes)
}

/**
 * 在不依赖 `TextDecoder` 的情况下把 UTF-8 字节流还原成字符串。
 */
export function decodeUtf8(bytes: Uint8Array): string {
  let result = ''
  let index = 0
  while (index < bytes.length) {
    const byte1 = bytes[index++]
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1)
      continue
    }
    if (byte1 < 0xE0) {
      const byte2 = bytes[index++] & 0x3F
      result += String.fromCharCode(((byte1 & 0x1F) << 6) | byte2)
      continue
    }
    if (byte1 < 0xF0) {
      const byte2 = bytes[index++] & 0x3F
      const byte3 = bytes[index++] & 0x3F
      result += String.fromCharCode(((byte1 & 0x0F) << 12) | (byte2 << 6) | byte3)
      continue
    }
    const byte2 = bytes[index++] & 0x3F
    const byte3 = bytes[index++] & 0x3F
    const byte4 = bytes[index++] & 0x3F
    const point = ((byte1 & 0x07) << 18) | (byte2 << 12) | (byte3 << 6) | byte4
    const cp = point - 0x10000
    result += String.fromCharCode((cp >> 10) + 0xD800, (cp & 0x3FF) + 0xDC00)
  }
  return result
}

export function concatUint8Arrays(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, item) => sum + item.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

/**
 * 复制一份字节数据并返回真正的 `ArrayBuffer`。
 *
 * 某些 uni-app API 对入参类型比较严格，更适合接收原生 `ArrayBuffer`，
 * 因此这里显式做一次拷贝，避免共享底层缓冲区带来的兼容性问题。
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copied = new Uint8Array(bytes.byteLength)
  copied.set(bytes)
  return copied.buffer
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
