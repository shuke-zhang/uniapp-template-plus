import type { MediaUploaderTask } from './types'

export function createMediaUploaderTask(...tempFiles: UniApp.MediaFile[]) {
  const _tasks: MediaUploaderTask[] = tempFiles.map((mediaFile) => {
    return {
      uuid: createUUID(),
      mediaFile,
      cover: mediaFile.thumbTempFilePath,
      url: mediaFile.tempFilePath,
      status: 'pending',
      process: 0,
      fileType: mediaFile.thumbTempFilePath ? 'video' : 'image',
    }
  })
  return _tasks
}
