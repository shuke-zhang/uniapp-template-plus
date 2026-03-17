import { dialogAudioConfig } from '../config/dialog-runtime'
import type { DialogAudioFormat } from '../models/dialog'
import { toArrayBuffer } from './binary'

/**
 * 对话模块共用的音频工具函数。
 *
 * 这里刻意只做底层音频处理，例如：
 * - 把 PCM 封装成 WAV
 * - 生成可播放的音频地址
 * - 释放临时音频资源
 *
 * 它不关心页面状态、聊天记录或 websocket 逻辑，只关注“音频数据如何变成可播放资源”。
 */

export function buildWavFromPcm16(
  bytes: Uint8Array,
  sampleRate = dialogAudioConfig.outputSampleRate,
  channels = dialogAudioConfig.outputChannels,
): Uint8Array {
  const byteRate = sampleRate * channels * 2
  const blockAlign = channels * 2
  const wav = new Uint8Array(44 + bytes.length)
  const view = new DataView(wav.buffer)

  wav.set([0x52, 0x49, 0x46, 0x46], 0)
  view.setUint32(4, 36 + bytes.length, true)
  wav.set([0x57, 0x41, 0x56, 0x45], 8)
  wav.set([0x66, 0x6D, 0x74, 0x20], 12)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  wav.set([0x64, 0x61, 0x74, 0x61], 36)
  view.setUint32(40, bytes.length, true)
  wav.set(bytes, 44)
  return wav
}

/**
 * 构建一个可播放的音频地址，并兼容 uni-app 不同运行环境。
 *
 * 优先级依次为：
 * 1. 浏览器环境下使用 `Blob + URL.createObjectURL`
 * 2. 微信小程序环境下落盘到本地临时文件并返回文件路径
 * 3. 退化为 `data:` URL
 *
 * 这样可以尽量兼顾 H5、App 和小程序等多端表现。
 */
export function buildAudioUrl(
  bytes: Uint8Array,
  audioFormat: DialogAudioFormat,
  onWarn?: (message: string) => void,
): string {
  let sourceBytes = bytes
  let mime = 'audio/wav'

  if (audioFormat === 'pcm_s16le') {
    sourceBytes = buildWavFromPcm16(bytes)
  }
  else {
    throw new Error('当前页面暂不支持直接播放 float32/原始 pcm，请使用 pcm_s16le')
  }

  if (typeof URL !== 'undefined' && typeof Blob !== 'undefined')
    return URL.createObjectURL(new Blob([toArrayBuffer(sourceBytes)], { type: mime }))

  const uniAny = uni as unknown as {
    arrayBufferToBase64?: (buffer: ArrayBuffer) => string
  }
  const fsAny = uni as unknown as {
    getFileSystemManager?: () => {
      writeFileSync?: (filePath: string, data: string, encoding?: string) => void
    }
  }
  const runtimeInfo = uni.getSystemInfoSync() as Record<string, any>
  const uniPlatform = String(runtimeInfo?.uniPlatform || runtimeInfo?.platform || '').toLowerCase()
  if (
    uniPlatform === 'mp-weixin'
    && typeof uniAny.arrayBufferToBase64 === 'function'
    && typeof fsAny.getFileSystemManager === 'function'
  ) {
    try {
      const fs = fsAny.getFileSystemManager()
      const wxAny = globalThis as unknown as {
        wx?: {
          env?: {
            USER_DATA_PATH?: string
          }
        }
      }
      const baseDir = wxAny.wx?.env?.USER_DATA_PATH || ''
      if (baseDir && typeof fs?.writeFileSync === 'function') {
        const filePath = `${baseDir}/dialog_audio_${Date.now()}_${Math.random().toString(16).slice(2)}.wav`
        const base64 = uniAny.arrayBufferToBase64(toArrayBuffer(sourceBytes))
        fs.writeFileSync(filePath, base64, 'base64')
        return filePath
      }
    }
    catch (error) {
      onWarn?.(`写入本地音频文件失败，回退 dataUrl: ${String(error)}`)
    }
  }

  if (typeof uniAny.arrayBufferToBase64 === 'function') {
    const base64 = uniAny.arrayBufferToBase64(toArrayBuffer(sourceBytes))
    return `data:${mime};base64,${base64}`
  }

  throw new Error('当前环境不支持创建音频播放地址')
}

/**
 * 释放由 `URL.createObjectURL` 创建的 blob 地址。
 * 如果不及时回收，页面在多次播放后容易出现无意义的内存占用累积。
 */
export function revokeAudioUrl(url: string) {
  if (url && typeof URL !== 'undefined' && url.startsWith('blob:'))
    URL.revokeObjectURL(url)
}
