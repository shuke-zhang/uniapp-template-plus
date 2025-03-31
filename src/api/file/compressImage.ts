import { getFileSize } from './getFileSize'
import { formatFileSize } from '@/utils/helpers/formatFileSize'

type _CompressImageOptions = Omit<
  UniNamespace.CompressImageOptions,
  'width' | 'height' | 'compressHeight' | 'success' | 'fail' | 'complete'
>

interface CompressImageOptions extends _CompressImageOptions {
  /**
   * 按照比例压缩 例如100x100 rate=0.5 则 compressedWidth = 50  compressedHeight = 50
   */
  rate?: number
  /**
   * 返回类型 tempFilePath 微信临时文件路径 base64 图片base64字符串
   */
  format?: 'tempFilePath' | 'base64'
  /**
   * 返回 base64 时 是否需要base64前缀
   */
  withBase64Prefix?: boolean
  /**
   *
   */
  native?: boolean
}

type IsNativeCompressImageOptions = CompressImageOptions & {
  native: true
}

const debug = false
/**
 * 压缩图片 支持 <br>
 * 按照比例压缩 rate <br>
 * 支持返回base64 <br>
 * @param options
 */
export async function compressImage(options: IsNativeCompressImageOptions): Promise<{ tempFilePath: string, size: number }>
export async function compressImage(options: CompressImageOptions): Promise<string>
export async function compressImage(options: CompressImageOptions) {
  const fileManager = uni.getFileSystemManager()
  if (__DEV__) {
    const beforeSize = await getFileSize({
      filePath: options.src,
    })
    debug && console.log(`[compressImage before] ${options.src}`)
    debug && console.log('[compressImage before]', formatFileSize(beforeSize))
  }

  options.quality = options.quality || 60

  return uni.getImageInfo({
    src: options.src,
  }).then((imageInfo) => {
    if (!options.compressedWidth) {
      if (!options.rate) {
        // 宽比高长
        const isWidthThanHeight = imageInfo.width > imageInfo.height
        if (imageInfo.width >= 1920 || imageInfo.height >= 1920) {
          if (isWidthThanHeight) {
            options.rate = 1920 / imageInfo.width
            options.quality = 80
          }
          else {
            options.rate = 1920 / imageInfo.height
            options.quality = 80
          }
        }
        else {
          options.rate = 0.8
        }
      }
      if (options.rate && options.rate > 0 && options.rate < 1) {
        const width = imageInfo.width * options.rate
        const height = imageInfo.height * options.rate
        options.compressedWidth = width
        options.compressedHeight = height
      }
    }
    debug && console.log('2 options', options)
    return Promise.all([uni.compressImage(options), Promise.resolve(imageInfo)])
  }).then(async ([res, imageInfo]) => {
    if (__DEV__) {
      const beforeSize = await getFileSize({
        filePath: res.tempFilePath,
      })
      debug && console.log(`[compressImage after] ${res.tempFilePath}`)
      debug && console.log('[compressImage after]', formatFileSize(beforeSize))
    }
    if (options.native) {
      const nativeResponse = {
        tempFilePath: res.tempFilePath,
        size: await getFileSize({ filePath: res.tempFilePath }),
      }
      debug && console.log('options.native', nativeResponse)
      return nativeResponse
    }
    if (options.format === 'base64') {
      const _base64 = fileManager.readFileSync(res.tempFilePath, 'base64')
      const base64 = _base64 instanceof ArrayBuffer ? uni.arrayBufferToBase64(_base64) : _base64
      if (options.withBase64Prefix === false) {
        return base64
      }
      const type = imageInfo.type ? imageInfo.type : 'jpg'
      const base64Prefix = `data:image/${type};base64,`
      return base64Prefix + base64
    }
    else {
      debug && console.log('string')
      return res.tempFilePath
    }
  }).catch((e) => {
    debug && console.log(e)
    throw e
  })
}
