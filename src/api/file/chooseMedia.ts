type _ChooseMediaOptions = UniNamespace.ChooseMediaOption

export interface ChooseMediaOptions extends _ChooseMediaOptions {
  native?: boolean
}

export function chooseMedia(option: ChooseMediaOptions & { native: true }): Promise<UniApp.MediaFile[]>
export function chooseMedia(option?: ChooseMediaOptions): Promise<string[]>
export function chooseMedia(option: ChooseMediaOptions = {}) {
  const mediaType: ChooseMediaOptions['mediaType'] = option.mediaType ? option.mediaType : ['mix']
  return new Promise<(UniApp.MediaFile | string)[]>((resolve, reject) => {
    uni.chooseMedia({
      mediaType,
      ...option,
      success(res) {
        if (option.native)
          resolve(res.tempFiles)
        else
          resolve(res.tempFiles.map(e => e.tempFilePath))
      },
      fail(e) {
        console.log('chooseMedia error', e)
        reject(e)
      },
    })
  })
}
