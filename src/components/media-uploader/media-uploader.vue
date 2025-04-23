<script lang="ts">
import type { PropType } from 'vue'

import { computed, defineComponent, nextTick, ref, unref, useSlots, watch } from 'vue'
import { useFormContext } from '../form/content'
import type { MediaUploaderTask, UploadResponse } from './types'
import { createMediaUploaderTask } from './media-uploader'
import { UploaderError } from './UploaderError'
import { compressVideo } from './compressVideo'
import { THRESHOLD_SIZE } from './UploadManager'
import { chooseMedia as _chooseMedia } from '@/api/file/chooseMedia'
import { cropImage } from '@/api/file'
import { compressImage } from '@/api/file/compressImage'
import { upload } from '@/utils/request'

export default defineComponent({
  options: {
    virtualHost: true,
  },
})
</script>

<script setup lang="ts">
const props = defineProps({
  /**
   * 上传地址
   */
  action: createStringProp('/common/upload'),
  /**
   * 视图
   */
  type: createStringProp<'avatar' | 'list'>('list'),
  /**
   *
   */
  modelValue: {
    type: [String, Array] as PropType<Arrayable<string>>,
    default: '',
  },
  /**
   * 最大尺寸
   */
  maxSize: createNumberProp(10),
  /**
   * 文件数量
   */
  count: createNumberProp(9),
  /**
   * 是否强制 列表格式 (model = "1.jpg,2.jpg,3.jpg")
   * forceListMode = true 时候 props.type 无效且强制为 list
   * 如果 type = list 且 model 为 string 时 列表上图不会显示删除
   * 设置 forceListMode 和 count 可以解决
   */
  forceListMode: createBooleanProp(false),
  /**
   * model 为 string 时候 多张图片链接分隔符 默认 逗号
   */
  symbol: createStringProp(','),
  /**
   * 上传formdata
   */
  formData: {
    default: () => ({}),
    type: Object,
  },
  /**
   * 上传文件类型 默认 image
   */
  mediaType: {
    type: Array as PropType<('video' | 'image' | 'mix')[]>,
    default: () => ['image'],
  },
  /**
   * 是否隐藏删除图标
   */
  hideDelete: createBooleanProp(),
  /**
   * 裁剪
   */
  cropScale: {
    type: String as PropType<UniNamespace.CropImageOption['cropScale']>,
  },
  /**
   * 是否需要视频封面 或者 图片略缩图
   */
  enableImageThumbnail: createBooleanProp(),
  /**
   * 封面 Record，回显已经上传的视频封面 主要用于编辑操作
   */
  covers: {
    type: Object as PropType<Record<string, string>>,
    default: () => ({}),
  },

  disabled: createBooleanProp(false),
})
const emit = defineEmits<{
  'update:modelValue': [Arrayable<string>]
  'upload-success': [MediaUploaderTask]
}>()
const isCustomToken = false
const formContent = useFormContext()
const disabled = computed(() => {
  return props.disabled || unref(formContent?.disabled)
})
const slots = useSlots()

const AUTO_COMPRESS = true
const isImage = (url?: string) => /\.(?:jpg|jpeg|png|gif|bmp)$/i.test(`${url}`)
const type = computed(() => (props.forceListMode ? 'list' : props.type))
const running = ref(false)
const model = computed({
  get() {
    const rawValue = props.modelValue ?? (props.forceListMode ? [] : '')
    if (typeof rawValue === 'string' && props.forceListMode) {
      return rawValue.split(props.symbol).filter(e => !!e)
    }
    return rawValue
  },
  set(value) {
    if (
      typeof props.modelValue === 'string'
      && props.forceListMode
      && Array.isArray(value)
    ) {
      emit('update:modelValue', value.join(props.symbol))
    }
    else if (typeof props.modelValue === 'string' && props.type === 'avatar') {
      emit('update:modelValue', value.toString())
    }
    else {
      emit('update:modelValue', value)
    }
  },
})

function formatDuration(seconds: number): string {
  seconds = Math.floor(seconds)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  const formattedMinutes = String(minutes).padStart(2, '0') // 保证分钟有两位数字
  const formattedSeconds = String(remainingSeconds).padStart(2, '0') // 保证秒有两位数字
  return `${formattedMinutes}:${formattedSeconds}`
}

function handleDel(t: MediaUploaderTask) {
  tasks.value = tasks.value.filter(e => e.uuid !== t.uuid)
  uploadModelByTask()
}

/**
 * 获取图片url 或者 视频封面
 * @param task
 */
function getImageUrlOrVideoCover(task: MediaUploaderTask) {
  return addPrefixUrl(task.cover || props.covers[`${task.url}`] || task.url || task.mediaFile!.tempFilePath)
}

const handlePreviewMedia = debounce((task: MediaUploaderTask, current: number) => {
  if (task.status === 'pending') {
    showToastError('文件正在上传')
    return
  }
  if (task.status === 'fail') {
    resartTask(task.uuid)
    return
  }
  return uni.previewMedia({
    sources: tasks.value.map((e) => {
      return {
        url: addPrefixUrl(e.url),
        type: isImage(e.url) ? 'image' : 'video',
        poster: getImageUrlOrVideoCover(e),
      }
    }),
    current,
  })
}, 500)

/**
 * 任务
 */
const tasks = ref<MediaUploaderTask[]>([])
/**
 * 队列
 */
const queue = ref<MediaUploaderTask[]>([])

function setTask(uuid: string, task: Partial<MediaUploaderTask>) {
  const index = tasks.value.findIndex(e => e.uuid === uuid)
  if (index !== -1) {
    tasks.value[index] = {
      ...tasks.value[index],
      ...task,
    }
  }
}

function delQueueByUuid(uuid: string) {
  queue.value = queue.value.filter(e => e.uuid !== uuid)
}

function delTaskByUuid(uuid: string) {
  tasks.value = tasks.value.filter(e => e.uuid !== uuid)
}

function uploadModelByTask() {
  const taskUrl = tasks.value
    .filter(e => e.status === 'success' && e.url && (e.url))
    .map(e => e.url)
    .filter((e): e is string => !!e)
  if (typeof model.value === 'string' && props.count === 1) {
    model.value = taskUrl?.[taskUrl.length - 1]
  }
  else {
    model.value = taskUrl
  }
}

function chooseMedia() {
  if (disabled.value) {
    return Promise.resolve()
  }
  return _chooseMedia({
    mediaType: props.mediaType,
    maxDuration: 30,
    native: true,
    count: props.count,
    sizeType: ['original'],
  }).then(async (tempFiles) => {
    if (props.cropScale) {
      for (let index = 0; index < tempFiles.length; index++) {
        const tempFile = tempFiles[index]
        if (tempFile.fileType === 'image') {
          tempFile.tempFilePath = await cropImage({
            src: tempFile.tempFilePath,
            cropScale: props.cropScale,
          })
        }
      }
    }
    const _tasks = createMediaUploaderTask(...tempFiles)
    addMediaUploaderTask(_tasks)
    startTask()
  })
}

function addMediaUploaderTask(_tasks: MediaUploaderTask[]) {
  if (typeof props.modelValue === 'string' && props.type === 'avatar') {
    tasks.value = []
    queue.value = []
  }
  tasks.value.push(..._tasks)
  queue.value.push(..._tasks)
}

/**
 * 压缩图片
 * @param task
 */
async function minifyMediaFile(task: MediaUploaderTask): Promise<MediaUploaderTask> {
  const mediaFile = task.mediaFile!
  if (mediaFile.size > THRESHOLD_SIZE || mediaFile.fileType === 'image') {
    if (AUTO_COMPRESS) {
      let compressResult = mediaFile.tempFilePath
      let compressSize = mediaFile.size
      if (mediaFile.fileType === 'image') {
        const result = await compressImage({ src: mediaFile.tempFilePath, native: true })
        compressResult = result.tempFilePath
        compressSize = result.size
      }
      else {
        const result = await compressVideo({
          src: mediaFile.tempFilePath,
          bitrate: 1000,
          fps: 30,
          resolution: 0.8,
          quality: 'low',
          native: true,
        })
        compressResult = result.tempFilePath
        compressSize = result.size
      }

      if (compressSize > THRESHOLD_SIZE) {
        throw new UploaderError({
          message: '压缩文件过大',
          status: 0,
          errorTask: task,
        })
      }
      else {
        mediaFile.tempFilePath = compressResult
        return Promise.resolve({
          ...task,
          mediaFile,
        })
      }
    }
    else {
      throw new UploaderError({
        message: '压缩文件过大',
        status: 0,
        errorTask: task,
      })
    }
  }
  else {
    return Promise.resolve({ ...task })
  }
}

/**
 * 处理封面 缩略图
 */
async function generateThumbnail(task: MediaUploaderTask): Promise<MediaUploaderTask> {
  const item = task.mediaFile
  try {
    let thumbnail = ''
    if (task.fileType === 'video' || props.enableImageThumbnail) {
      thumbnail = await compressImage({
        src: (item?.thumbTempFilePath || item?.tempFilePath)!,
        compressedWidth: 200,
        quality: 100,
        format: 'tempFilePath',
      })
      const thumbnailResponse = await upload<UploadResponse>({
        filePath: thumbnail,
        formData: {
          path: 'wx/thumbnail',
        },
      })
      setTask(task.uuid, {
        cover: thumbnailResponse.url,
      })
    }
    else {
      console.log('不需要缩略图')
    }
    return task
  }
  catch (error: any) {
    const message = error?.errMsg || error?.msg || error?.message || 'handleMediaCover error'
    throw new UploaderError({
      message,
      status: 1,
      errorTask: task,
    })
  }
}

/**
 * 上传
 * @param task
 */
function onUploadTask(task: MediaUploaderTask, index: number) {
  const params: UniNamespace.UploadFileOption = {
    url: `${API_URL}${props.action}`,
    filePath: index ? task.mediaFile!.tempFilePath : `${task.mediaFile!.tempFilePath}`,
    formData: {
      ...(props.formData || {}),
    },
    header: {
      Authorization: isCustomToken ? `Bearer ${CUSTOM_TOKEN}` : getCacheToken(),
    },
    name: 'file',
  }

  return new Promise<MediaUploaderTask>((resolve, reject) => {
    const uploadTask = uni.uploadFile({
      ...params,
      success: (res) => {
        try {
          const { url, code, msg: message } = JSON.parse(res.data) as ResponseResult<UploadResponse>
          if (code !== 200) {
            throw new UploaderError({ message, status: 1 })
          }
          const successIndex = tasks.value.findIndex(e => e.uuid === task.uuid)
          if (tasks.value[successIndex]) {
            setTask(task.uuid, {
              process: 0,
              status: 'success',
              url,
              response: JSON.parse(res.data) as ResponseResult<UploadResponse>,
            })
            uploadModelByTask()
            delQueueByUuid(task.uuid)
            resolve(tasks.value[successIndex])
            emit('upload-success', tasks.value[successIndex])
          }
        }
        catch (error: any) {
          reject(error)
        }
      },
      fail: (error: any) => {
        const message = error?.errMsg || error?.msg || error?.message || 'onUpload error'
        const e = new UploaderError({ message, status: 0 })
        reject(e)
      },
    })
    uploadTask.onProgressUpdate((res) => {
      const taskIndex = tasks.value.findIndex(e => e.uuid === task.uuid)
      if (tasks.value[taskIndex]) {
        tasks.value[taskIndex].process = res.progress
      }
    })
  })
}
/**
 * 开始i任务
 */
async function startTask() {
  if (running.value) {
    // 如果队列正在运行，等待当前任务完成
    return
  }
  running.value = true
  while (queue.value.length > 0) {
    // 每次取两个任务;
    const taskNum = 3

    const currentBatch = queue.value.splice(0, taskNum) //

    await Promise.allSettled(currentBatch.map(async (task, index) => {
      try {
        const minifyTask = await minifyMediaFile(task)
        const thumbnailTask = await generateThumbnail(minifyTask)
        await onUploadTask(thumbnailTask, index)
      }
      catch (error) {
        console.log(error)
        if (UploaderError.isUploaderError(error) && error.status === 1) {
          showToastError('文件不能超过30M')
          if (error.errorTask?.mediaFile) {
            delQueueByUuid(error.errorTask.uuid)
            delTaskByUuid(error.errorTask.uuid)
          }
          else {
            console.log('找不到错误 文件')
          }
        }
        else {
          const failIndex = tasks.value.findIndex(e => e.uuid === task.uuid)
          if (failIndex !== -1) {
            tasks.value[failIndex].status = 'fail'
            tasks.value[failIndex].process = 0
          }
        }
      }
    }))
  }
  await sleep(200)
  running.value = false
}
/**
 * 重启错误任务
 * @param uuid
 */
async function resartTask(uuid: string) {
  const failIndex = tasks.value.findIndex(e => e.uuid === uuid)
  if (failIndex !== -1) {
    tasks.value[failIndex].status = 'pending'
    const item: MediaUploaderTask = {
      ...tasks.value[failIndex],
      status: 'pending',
      process: 0,
    }
    queue.value.push(item)
    await nextTick()
    startTask()
  }
}

watch(() => props.modelValue, (a, b) => {
  if (a === null) {
    tasks.value = []
    model.value = props.forceListMode ? [] : ''
    return
  }
  if (a) {
    const list = typeof props.modelValue === 'string' && props.forceListMode
      ? props.modelValue.split(props.symbol).filter(e => !!e)
      : [...props.modelValue]
    for (let index = 0; index < list.length; index++) {
      const url = list[index]
      const hasData = !!tasks.value.find(e => e.url === url)
      if (!hasData) {
        tasks.value.push({
          url,
          fileType: isImage(url) ? 'image' : 'video',
          uuid: createUUID(),
          status: 'success',
          process: 0,
        })
      }
    }
  }
}, {
  immediate: true,
})

defineExpose({
  addMediaUploaderTask,
  startTask,
})
</script>

<template>
  <template v-if="type === 'avatar' && typeof model === 'string'">
    <slot
      v-if="slots.avatar"
      name="avatar"
    />
    <view
      v-else
      class="flex items-center flex-col"
      @click="chooseMedia"
    >
      <view class="upload-image flex-center">
        <view
          v-if="!model"
          class="no-img flex-center"
        >
          <icon-font
            name="plus"
            color=""
          />
        </view>
        <image
          v-else
          class="face-avatar"
          mode="aspectFill"
          :src="$addPrefixUrl(`${model}`)"
        />

        <view class="camera flex-center">
          <image
            mode="aspectFit"
            class="image"
            :src="`${STATIC_URL}/images/camer.png`"
          />
        </view>
      </view>
    </view>
  </template>

  <view
    v-else
    class="files-card upload-image-container"
  >
    <template v-if="(Array.isArray(model)) || forceListMode">
      <view
        v-for="(taskItem, index) in tasks"
        :key="`${taskItem}_${index}_${taskItem.uuid}`"
        class="upload-image-item"
        @click="handlePreviewMedia(taskItem, index)"
      >
        <image
          alt=""
          :src="getImageUrlOrVideoCover(taskItem)"
          mode="aspectFill"
          class="upload-image-item-img"
        />

        <view
          v-if="taskItem.status === 'pending' && taskItem.process === 0"
          class="loading-mask flex-center"
        >
          <image
            class="loading image"
            :src="`${STATIC_URL}/images/icons/loading.png`"
          />
        </view>

        <view
          v-if="taskItem.status === 'pending'"
          class="process"
        >
          <view
            class="process-inner"
            :style="{ width: `${taskItem.process}%` }"
          />
        </view>

        <view
          v-if="taskItem.status === 'fail'"
          class="error-mask flex flex-col items-center justify-center"
        >
          <image
            class="error image"
            :src="`${STATIC_URL}/images/icons/error.png`"
          />
          <text
            class="text-mini "
            style="color: red"
          >
            上传失败
          </text>
        </view>

        <view
          v-if="taskItem.fileType === 'video' && taskItem.status === 'success'"
          class="play-btn flex-center"
        >
          <icon-font
            name="play"
            color="white"
            size="48"
          />
        </view>

        <view
          v-if="taskItem.fileType === 'video' && taskItem.mediaFile?.duration !== undefined"
          class="duration absolute text-mini text-black-3"
        >
          {{ formatDuration(taskItem.mediaFile!.duration) }}
        </view>

        <image
          v-if="!hideDelete && taskItem.status !== 'pending'"
          :src="`${STATIC_URL}/images/close.png`"
          class="upload-image-item-del"
          alt=""
          @click.stop="handleDel(taskItem)"
        />
      </view>
      <view
        v-if="tasks.length < count"
        @click="chooseMedia"
      >
        <view class="upload-image-item add flex-center">
          <icon-font
            name="plus"
            size="40rpx"
          />
        </view>
      </view>
    </template>

    <template v-else-if="count === 1 || typeof model === 'string'">
      <view
        @click="chooseMedia"
      >
        <image
          v-if="model"
          alt=""
          :src="$addPrefixUrl(`${model}`)"
          mode="aspectFill"
          class="upload-image-item-img block"
        />

        <view
          v-else
          class="upload-image-item add flex-center"
        >
          <icon-font
            name="plus"
            size="40rpx"
          />
        </view>
      </view>
    </template>
  </view>
</template>

<style lang="scss">
@keyframes roll {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(1turn);
  }
}

.upload-image {
  position: relative;
  width: 160rpx;
  height: 160rpx;
  overflow: hidden;

  .no-img {
    background-color: #f4f4f4;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    border: 2rpx solid rgba(#b9b7c2, 50);
    border-radius: 160rpx;
  }

  .face-avatar {
    width: 100%;
    height: 100%;
    border-radius: 160rpx;
  }

  .camera {
    background-color: #5682ea;
    border: 1rpx solid #ffffff;
    position: absolute;
    bottom: 0;
    right: 0;
    border-radius: 48rpx;
    width: 48rpx;
    height: 48rpx;

    .image {
      height: 18rpx;
      width: 22rpx;
    }
  }
}

.files-card {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20rpx;
}

.upload-image-item {
  position: relative;
  height: 140rpx;
  width: 140rpx;
  overflow: hidden;
  border-radius: 12rpx;
  box-sizing: border-box;

  &.add {
    border: 2rpx solid rgba($color: #b9b7c2, $alpha: 50);
    background-color: #f4f4f4;
  }
}

.upload-image-item-img {
  height: 140rpx;
  width: 140rpx;
  border-radius: 12rpx;
}

.upload-image-item-del {
  position: absolute;
  top: 4rpx;
  right: 4rpx;
  height: 32rpx;
  width: 32rpx;
}

.play-btn {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0.8;
}

.process {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 8rpx;
  border-radius: 12rpx;

  .process-inner {
    height: 100%;
    background-color: $primary;
    border-radius: 12rpx;
  }
}

.error-mask,
.loading-mask {
  bottom: 0;
  left: 0;
  right: 0;
  top: 0;
  position: absolute;

  .image {
    width: 60rpx;
    height: 60rpx;

    &.loading {
      animation: roll 1s steps(12) infinite;
    }

    &.error {
      width: 48rpx;
      height: 48rpx;
      margin-bottom: 10px;
    }
  }
}

.duration {
  bottom: 2rpx;
  left: 2rpx;
}
</style>
