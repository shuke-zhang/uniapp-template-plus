# Realtime Dialogue（duan）端到端对接流程

本文档只说明 `src/pages/test/duan` 这个业务页面的完整对接链路（App 端实时语音对话）。

## 1. 业务目标

页面文件：`src/pages/test/duan/index.vue`

该页面通过 WebSocket 二进制协议对接实时对话服务，支持三种输入模式：

- `text`：纯文本对话
- `audio`：麦克风实时采集
- `audio_file`：本地音频文件分片上传

服务返回：

- 文本回复（增量）
- 音频流（分片）
- 会话状态事件

## 2. 关键文件与职责

- `src/pages/test/duan/index.vue`
  - 页面状态管理
  - 建链/发包/收包
  - 三种输入模式控制
  - 音频拼接与播放

- `src/pages/test/protocols.ts`
  - 协议消息编解码
  - `marshalMessage` / `ReceiveMessage` / `WaitForEvent`
  - `MsgType`、`EventType`、序列化与压缩标记

- `src/pages/test/duan/access.ts`
  - 鉴权配置（`DIALOG_APPID`、`DIALOG_ACCESS_TOKEN`、`DIALOG_APP_KEY` 等）

- `src/store/modules/socket/webSocket.ts`
  - 项目内 WebSocket 包装类（事件机制）

## 3. 对接前准备

## 3.1 配置接入参数

编辑 `src/pages/test/duan/access.ts`：

- `DIALOG_ENDPOINT`
- `DIALOG_RESOURCE_ID`
- `DIALOG_APPID`
- `DIALOG_ACCESS_TOKEN`
- `DIALOG_APP_KEY`
- `DIALOG_SPEAKERS`

页面建立连接时会在 header 携带：

- `X-Api-App-Id`
- `X-Api-App-Key`
- `X-Api-Access-Key`
- `X-Api-Resource-Id`
- `X-Api-Connect-Id`

## 3.2 运行方式

```bash
pnpm dev:app
```

或：

```bash
pnpm dev:mp-wx
```

建议优先在 App 环境调试 `audio` 模式（麦克风权限链路更完整）。

## 4. 端到端时序（核心）

以下流程由 `index.vue` 的 `connectDialog()` 驱动。

1. 创建 socket 连接
2. 发送 `StartConnection`
3. 等待 `ConnectionStarted`
4. 发送 `StartSession`（含 asr/tts/dialog 配置）
5. 等待 `SessionStarted`
6. 根据模式进入输入阶段：
   - `text`：发 `ChatTextQuery`
   - `audio`：实时发送音频帧 `TaskRequest`
   - `audio_file`：读取本地文件后分片发送 `TaskRequest`
7. 持续接收服务端事件：
   - `ChatResponse`：文本增量
   - `TTSSentenceStart/TTSEnded`：语音合成过程
   - 音频分片：拼接为可播放音频
8. 结束时发送：
   - `FinishSession`
   - `FinishConnection`
9. 等待 `ConnectionFinished`
10. 关闭 socket 并清理资源

## 5. StartSession 参数说明

`buildStartSessionPayload()` 生成启动会话参数，主要包含：

- `asr.extra.end_smooth_window_ms`
- `tts.speaker`
- `tts.audio_config`
  - `channel`
  - `format`（默认推荐 `pcm_s16le`）
  - `sample_rate`
- `dialog`
  - `bot_name`
  - `system_role`
  - `speaking_style`
  - `extra.recv_timeout`
  - `extra.input_mod`（跟随页面模式）

注意：页面里 `pcm_s16le` 会被封装成 wav 供播放器播放；`pcm` 当前仅用于调试。

## 6. 三种输入模式的详细流程

## 6.1 text（纯文本）

1. 建链成功后可先发 `SayHello`
2. 用户输入文本，调用 `sendText()`
3. 发送 `ChatTextQuery`
4. 收到 `ChatResponse` 增量文本
5. 收到 TTS 音频分片并合并播放

## 6.2 audio（麦克风实时）

1. `ensureRecordPermission()` 检查/申请录音权限
2. `uni.getRecorderManager()` 开始录音
3. `onFrameRecorded` 回调持续拿到音频帧
4. 每帧封包为 `AudioOnlyClient + TaskRequest` 发给服务端
5. 接收 ASR/对话/TTS 回包
6. 可调用 `stopRecorder()` 中断采集

## 6.3 audio_file（本地文件）

1. `pickAudioFile()` 选择本地音频
2. `readFile` 读取为 `ArrayBuffer`
3. 按固定分片（当前 3200 bytes）循环发送
4. 每片间隔短暂 sleep，避免发送过快
5. 等待服务端文本与音频输出

## 7. 消息收包与解析

页面通过 `receiveLoop()` 持续 `ReceiveMessage(ws)`：

- 先按协议头反序列化为 `Message`
- 按 `event` 分发逻辑
- 文本片段累积到 `currentAssistantTextChunks`
- 音频片段累积到 `currentAssistantAudioChunks`
- 在结束事件处做一次合并落地（聊天记录 + 播放地址）

音频地址生成逻辑：

- 优先 `Blob + URL.createObjectURL`
- 不支持时回退 `base64 data url`

## 8. 页面状态机（关键状态）

主要响应式状态：

- `isConnecting`
- `isReady`
- `isSending`
- `isRecording`
- `isSendingFile`
- `statusText`
- `errorText`

建议联调时以 `statusText + logs` 为第一观察面板。

## 9. 常见问题排查

## 9.1 建链失败

重点检查：

- `access.ts` 的 AppId / AccessToken / AppKey
- `DIALOG_RESOURCE_ID`
- Header 是否完整传入
- 服务地址是否可访问（wss 证书、网络策略）

## 9.2 SessionStarted 等不到

重点检查：

- 是否先发送了 `StartConnection`
- `StartSession` payload 字段是否符合后端要求
- `sessionId` 是否传递

## 9.3 有文本无声音

重点检查：

- `format` 是否为 `pcm_s16le`
- 音频分片是否有累积
- 终止事件是否触发了音频合并

## 9.4 麦克风模式不出数据

重点检查：

- 录音权限是否真的授权
- 当前运行平台是否支持分帧回调
- `onFrameRecorded` 是否触发

## 10. 安全与上线建议

当前 `access.ts` 是前端明文凭证，仅适合本地调试。

生产建议：

1. 服务端下发短期临时凭证
2. 前端不落地长期密钥
3. 连接失败与事件异常接入统一监控
4. 协议版本升级时先在 `protocols.ts` 做兼容分支
