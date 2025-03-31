import type { ComponentExposed } from 'vue-component-type-helpers'
import type MediaUploaderV2 from './media-uploader.vue'

export interface MediaUploaderTask {
  uuid: string
  fileType: 'image' | 'video'
  status?: 'fail' | 'pending' | 'success'
  mediaFile?: UniApp.MediaFile
  url?: string
  cover?: string
  process?: number
  response?: UploadResponse
}

export interface UploadResponse {
  // name: string
  // url: string
  // thumbnail?: string
  code: number
  msg: string
  /**
   * 文件名称
   */
  fileName: string
  /**
   * 文件路径
   */
  url: string
  /**
   * newFileName
   */
  newFileName: string
  /**
   * originalFilename
   */
  originalFilename: string

}

export type MediaUploaderV2Instance = ComponentExposed<typeof MediaUploaderV2>
