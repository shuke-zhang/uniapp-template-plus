/**
 * 实时对话页面运行时调优常量。
 *
 * 这里统一存放本地缓冲、音频分片、录音采样节奏、会话轮询等运行参数，
 * 避免这些“调优旋钮”散落在页面和服务实现内部，导致后续排查性能或兼容性问题时
 * 难以定位。
 */

/**
 * 音频输出配置。
 *
 * 当前页面期望服务端返回的 `pcm_s16le` 数据在播放前被封装成 WAV，
 * 因此这里的采样率和声道数会直接参与 WAV 头构建。
 */
export const dialogAudioConfig = {
  outputSampleRate: 24000,
  outputChannels: 1,
  flushDelayMs: 650,
} as const

/**
 * 录音输入配置。
 *
 * 这些参数决定麦克风采集 PCM 帧时的采样率、声道数、分帧粒度以及超时观察窗口。
 */
export const dialogRecorderConfig = {
  sampleRate: 16000,
  channels: 1,
  frameSize: 16,
  maxDurationMs: 600000,
  frameWatchTimeoutMs: 3000,
} as const

/**
 * 本地音频文件上传模式的分片配置。
 *
 * 文件不会一次性整体发送，而是按固定大小切片并按间隔节奏上传，
 * 这样更接近实时流式输入，也能减小单次发送压力。
 */
export const dialogFileTransferConfig = {
  chunkSize: 6400,
  chunkIntervalMs: 200,
} as const

/**
 * 页面日志保留上限。
 * 超过该数量后会自动丢弃更早的记录。
 */
export const dialogLogConfig = {
  maxLines: 120,
} as const

/**
 * 会话级配置。
 *
 * 这些值主要用于 `StartSession` 参数构建，以及发送 hello 后等待首段 TTS
 * 播放结束时的超时与轮询策略。
 */
export const dialogSessionConfig = {
  asrEndSmoothWindowMs: 1500,
  helloTimeoutMs: 20000,
  helloPollingIntervalMs: 120,
  defaultLocationCity: '北京',
} as const
