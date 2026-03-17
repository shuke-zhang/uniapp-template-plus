import { dialogRecorderConfig } from '../config/dialog-runtime'
import type {
  RecorderBackend,
  RecorderEventPayload,
  RecorderEventType,
  RecorderProcessFrame,
} from '../models/dialog'

/**
 * 录音能力标准化辅助函数。
 *
 * 当前页面支持两类录音后端：
 * - App 端原生插件
 * - 小程序等环境下的 `uni.getRecorderManager()`
 *
 * 这两个后端的回调结构和原始数据格式并不一致，
 * 因此这里负责把它们统一整理成页面可直接发送的 PCM 字节格式。
 */

export function parseRecorderPayload(payload: unknown): RecorderEventPayload {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload) as RecorderEventPayload
    }
    catch {
      return { event: 'error', message: payload }
    }
  }
  if (payload && typeof payload === 'object')
    return payload as RecorderEventPayload
  return {}
}

export function detectRecorderEventType(payload: RecorderEventPayload): RecorderEventType | '' {
  if (payload.event === 'start' || payload.event === 'stop' || payload.event === 'error' || payload.event === 'process')
    return payload.event
  if (Array.isArray(payload.buffers) && payload.buffers.length > 0)
    return 'process'
  return ''
}

function frameToPcmChunk(frame: RecorderProcessFrame): Uint8Array | null {
  const keys = Object.keys(frame)
  if (!keys.length)
    return null

  keys.sort((left, right) => Number(left) - Number(right))
  const bytes = new Uint8Array(keys.length * 2)
  for (let index = 0; index < keys.length; index++) {
    const raw = Number(frame[keys[index]])
    const value = Number.isFinite(raw) ? Math.max(-32768, Math.min(32767, Math.trunc(raw))) : 0
    bytes[index * 2] = value & 0xFF
    bytes[index * 2 + 1] = (value >> 8) & 0xFF
  }
  return bytes
}

export function extractPcmChunk(payload: RecorderEventPayload): Uint8Array | null {
  if (!Array.isArray(payload.buffers) || payload.buffers.length === 0)
    return null
  for (const frame of payload.buffers) {
    if (!frame || typeof frame !== 'object')
      continue
    const chunk = frameToPcmChunk(frame)
    if (chunk && chunk.length > 0)
      return chunk
  }
  return null
}

export function resolveRecorderBackend(runtimeInfo?: Record<string, any>): RecorderBackend {
  const info = runtimeInfo ?? (uni.getSystemInfoSync() as Record<string, any>)
  const uniPlatform = String(info?.uniPlatform || info?.platform || '').toLowerCase()
  if (uniPlatform === 'app' || uniPlatform === 'android' || uniPlatform === 'ios' || uniPlatform === 'app-plus')
    return 'native_plugin'
  return 'uni_recorder'
}

export function normalizeUniFrameChunk(input: unknown): Uint8Array | null {
  if (input instanceof ArrayBuffer)
    return new Uint8Array(input)

  if (typeof input === 'string') {
    const uniAny = uni as unknown as {
      base64ToArrayBuffer?: (base64: string) => ArrayBuffer
    }
    if (typeof uniAny.base64ToArrayBuffer === 'function') {
      try {
        return new Uint8Array(uniAny.base64ToArrayBuffer(input))
      }
      catch {}
    }
  }

  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength))
  }

  return null
}

export function getRecorderStartOptions() {
  return {
    duration: dialogRecorderConfig.maxDurationMs,
    sampleRate: dialogRecorderConfig.sampleRate,
    numberOfChannels: dialogRecorderConfig.channels,
    format: 'pcm' as const,
    frameSize: dialogRecorderConfig.frameSize,
  }
}
