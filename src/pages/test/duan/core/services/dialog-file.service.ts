import { dialogFileTransferConfig } from '../config/dialog-runtime'

/**
 * `audio_file` 模式下的本地音频文件辅助函数。
 *
 * 这里专门处理本地文件选择、文件读取以及 PCM 分片，
 * 目的是把本地 IO 细节从 websocket 会话控制流程中剥离出去，
 * 让会话层只关注“如何发送”，而不关心“文件如何准备好”。
 */

/**
 * 打开系统文件选择器，并返回用户选中的本地文件路径。
 */
export async function pickDialogAudioFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.chooseFile({
      count: 1,
      type: 'all',
      extension: ['wav', 'pcm'],
      success: (result: any) => {
        const file = result?.tempFiles?.[0] || result?.files?.[0]
        const filePath = file?.path || file?.tempFilePath || ''
        if (!filePath) {
          reject(new Error('未获取到文件路径'))
          return
        }
        resolve(filePath)
      },
      fail: reject,
    })
  })
}

/**
 * 读取本地音频文件并转换成可直接发送的 PCM 字节流。
 *
 * 如果文件本身是 WAV，会先剥离标准 44 字节头部，
 * 这样上传逻辑收到的就是和麦克风实时采集一致的纯 PCM 数据。
 */
export async function readDialogAudioFileAsPcm(
  filePath: string,
  onLog?: (message: string) => void,
): Promise<Uint8Array> {
  const fs = uni.getFileSystemManager()
  const fileData = await new Promise<ArrayBuffer>((resolve, reject) => {
    fs.readFile({
      filePath,
      success: (result: any) => {
        if (result.data instanceof ArrayBuffer) {
          resolve(result.data)
          return
        }
        reject(new Error('读取文件失败：返回数据不是 ArrayBuffer'))
      },
      fail: reject,
    })
  })

  let bytes = new Uint8Array(fileData)
  const isWav = (
    bytes.length > 44
    && bytes[0] === 0x52
    && bytes[1] === 0x49
    && bytes[2] === 0x46
    && bytes[3] === 0x46
    && bytes[8] === 0x57
    && bytes[9] === 0x41
    && bytes[10] === 0x56
    && bytes[11] === 0x45
  )

  if (isWav) {
    bytes = bytes.slice(44)
    onLog?.('检测到 WAV 文件，已剥离文件头后按 PCM 帧发送')
  }

  return bytes
}

/**
 * 把原始 PCM 字节流按传输配置切分成多个分片。
 *
 * 这里直接返回分片数组，调用方只需要关心“按什么节奏逐片发送”，
 * 不需要自己重复实现切片逻辑。
 */
export function splitDialogAudioChunks(
  bytes: Uint8Array,
  chunkSize = dialogFileTransferConfig.chunkSize,
): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    chunks.push(bytes.slice(offset, Math.min(offset + chunkSize, bytes.length)))
  }
  return chunks
}
