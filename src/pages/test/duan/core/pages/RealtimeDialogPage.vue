<script setup lang="ts">
import { useRealtimeDialogController } from '../hooks/useRealtimeDialogController'

/**
 * 实时对话页面主视图。
 *
 * 路由入口 `../index.vue` 只保留页面注册作用，真正的页面结构放在这里。
 *
 * 这个文件只负责三件事：
 * 1. 绑定表单与按钮事件
 * 2. 展示聊天记录与运行日志
 * 3. 保持模板清晰，不把协议和 socket 细节写进页面
 */
const {
  audioEl,
  audioFilePath,
  botName,
  chatList,
  currentAudioUrl,
  dialogMode,
  errorText,
  format,
  handleConnectAction,
  handleSpeakerChange,
  isConnecting,
  isReady,
  isRecording,
  isSending,
  isSendingFile,
  logs,
  pickAudioFile,
  recvTimeout,
  selectedSpeaker,
  sendAudioFileChunks,
  sendHello,
  sendText,
  showAdvanced,
  speakerIndex,
  speakerOptions,
  speakingStyle,
  startMicrophoneStreaming,
  statusText,
  stopRecorder,
  systemRole,
  userInput,
} = useRealtimeDialogController()
</script>

<template>
  <view class="dialog-page">
    <view class="panel hero">
      <view class="hero-top">
        <view>
          <view class="eyebrow">
            Realtime Dialogue
          </view>
          <view class="title">
            实时对话
          </view>
        </view>
        <view class="status" :class="{ active: isReady, loading: isConnecting }">
          {{ statusText }}
        </view>
      </view>

      <view class="grid-two">
        <view class="field">
          <view class="label">
            运行模式
          </view>
          <radio-group class="radio-row">
            <label class="radio-item">
              <radio value="text" :checked="dialogMode === 'text'" :disabled="isReady || isConnecting" @click="dialogMode = 'text'" />
              <text>纯文本对话</text>
            </label>
            <label class="radio-item">
              <radio value="audio" :checked="dialogMode === 'audio'" :disabled="isReady || isConnecting" @click="dialogMode = 'audio'" />
              <text>麦克风实时输入（App）</text>
            </label>
            <label class="radio-item">
              <radio value="audio_file" :checked="dialogMode === 'audio_file'" :disabled="isReady || isConnecting" @click="dialogMode = 'audio_file'" />
              <text>音频文件输入</text>
            </label>
          </radio-group>
        </view>

        <view class="field">
          <view class="label">
            发音人
          </view>
          <picker
            mode="selector"
            :range="speakerOptions"
            range-key="label"
            :value="speakerIndex"
            :disabled="isReady || isConnecting"
            @change="handleSpeakerChange"
          >
            <view class="select-box">
              <view class="select-title">
                {{ selectedSpeaker.label }}
              </view>
              <view class="select-sub">
                {{ selectedSpeaker.value }}
              </view>
            </view>
          </picker>
        </view>

        <view class="field">
          <view class="label">
            音频格式（推荐 pcm_s16le）
          </view>
          <radio-group class="radio-row">
            <label class="radio-item">
              <radio value="pcm_s16le" :checked="format === 'pcm_s16le'" :disabled="isReady || isConnecting" @click="format = 'pcm_s16le'" />
              <text>pcm_s16le（可播放，前端封装为 wav）</text>
            </label>
            <label class="radio-item">
              <radio value="pcm" :checked="format === 'pcm'" :disabled="isReady || isConnecting" @click="format = 'pcm'" />
              <text>pcm（仅调试，页面不直接播放）</text>
            </label>
          </radio-group>
        </view>
      </view>

      <view v-if="dialogMode === 'audio_file'" class="field">
        <view class="label">
          音频文件（App 本地路径）
        </view>
        <view class="row">
          <view class="field grow">
            <input v-model="audioFilePath" class="input" placeholder="请选择或输入本地音频文件路径" :disabled="isReady || isConnecting || isSendingFile">
          </view>
          <button class="secondary-btn small-btn" :disabled="isReady || isConnecting || isSendingFile" @click="pickAudioFile">
            选择文件
          </button>
        </view>
      </view>

      <view class="field">
        <button class="secondary-btn ghost-btn" :disabled="isReady || isConnecting" @click="showAdvanced = !showAdvanced">
          {{ showAdvanced ? '收起高级参数' : '展开高级参数' }}
        </button>
      </view>

      <view v-if="showAdvanced" class="field">
        <view class="label">
          Bot 名称
        </view>
        <input v-model="botName" class="input" :disabled="isReady || isConnecting">
      </view>

      <view v-if="showAdvanced" class="field">
        <view class="label">
          system_role
        </view>
        <textarea v-model="systemRole" class="textarea small" :disabled="isReady || isConnecting" />
      </view>

      <view v-if="showAdvanced" class="field">
        <view class="label">
          speaking_style
        </view>
        <textarea v-model="speakingStyle" class="textarea small" :disabled="isReady || isConnecting" />
      </view>

      <view class="row">
        <view v-if="showAdvanced" class="field grow">
          <view class="label">
            recv_timeout（10-120）
          </view>
          <input v-model="recvTimeout" type="number" class="input" :disabled="isReady || isConnecting">
        </view>
        <button class="connect-btn" :class="{ danger: isReady }" :loading="isConnecting" @click="handleConnectAction">
          {{ isReady || isConnecting ? (isConnecting ? '连接中...' : '断开会话') : '建立会话' }}
        </button>
      </view>

      <view v-if="dialogMode === 'audio'" class="empty hint">
        麦克风模式会在建立会话成功后自动开始采集并发送；“停止麦克风”仅用于调试中断采集。
      </view>

      <view v-if="errorText" class="error-box">
        {{ errorText }}
      </view>
    </view>

    <view class="panel">
      <view class="section-title">
        文本对话
      </view>
      <view class="composer">
        <textarea
          v-model="userInput"
          class="textarea"
          :maxlength="2000"
          :placeholder="dialogMode === 'text' ? '输入要发送给对话模型的文本' : '当前模式不使用文本输入'"
          :disabled="dialogMode !== 'text' || !isReady || isSending"
        />
        <view class="composer-actions">
          <button class="secondary-btn" :disabled="!isReady || dialogMode !== 'text'" @click="sendHello">
            发送欢迎语
          </button>
          <button
            v-if="dialogMode === 'text'"
            class="primary-btn"
            type="primary"
            :disabled="!isReady || isSending"
            @click="sendText"
          >
            {{ isSending ? '等待回复中...' : '发送文本' }}
          </button>
          <button
            v-else-if="dialogMode === 'audio'"
            class="primary-btn"
            type="primary"
            :disabled="!isReady"
            @click="isRecording ? stopRecorder() : startMicrophoneStreaming()"
          >
            {{ isRecording ? '停止麦克风（调试）' : '重新开始麦克风' }}
          </button>
          <button
            v-else
            class="primary-btn"
            type="primary"
            :disabled="!isReady || isSendingFile || !audioFilePath"
            @click="sendAudioFileChunks"
          >
            {{ isSendingFile ? '发送文件中...' : '发送音频文件' }}
          </button>
        </view>
      </view>
      <audio ref="audioEl" class="audio-player" :src="currentAudioUrl" controls autoplay />
    </view>

    <view class="panel">
      <view class="section-title">
        对话记录
      </view>
      <view v-if="!chatList.length" class="empty">
        建立会话后发送文本，这里会显示用户消息和助手回复（含音频）。
      </view>
      <view v-else class="chat-list">
        <view v-for="item in chatList" :key="item.id" class="chat-item" :class="item.role">
          <view class="chat-role">
            {{ item.role === 'user' ? '我' : item.role === 'assistant' ? '助手' : '系统' }}
          </view>
          <view class="chat-text">
            {{ item.text }}
          </view>
          <audio v-if="item.audioUrl" class="chat-audio" :src="item.audioUrl" controls />
        </view>
      </view>
    </view>

    <view class="panel">
      <view class="section-title">
        运行日志
      </view>
      <scroll-view scroll-y class="log-box">
        <view v-for="(line, idx) in logs" :key="`${idx}-${line}`" class="log-line">
          {{ line }}
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<style scoped>
.dialog-page {
  min-height: 100vh;
  padding: 24rpx;
  background:
    radial-gradient(circle at 8% 6%, rgba(251, 191, 36, 0.18), transparent 44%),
    radial-gradient(circle at 88% 10%, rgba(14, 165, 233, 0.16), transparent 42%),
    linear-gradient(180deg, #f6f8fc 0%, #eef2f7 100%);
}

.panel {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 24rpx;
  padding: 22rpx;
  margin-bottom: 20rpx;
  box-shadow: 0 10rpx 30rpx rgba(15, 23, 42, 0.06);
}

.hero-top {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: flex-start;
  margin-bottom: 18rpx;
}

.eyebrow {
  display: inline-block;
  font-size: 20rpx;
  color: #7c3e00;
  background: #ffefc2;
  border-radius: 999rpx;
  padding: 5rpx 12rpx;
  margin-bottom: 10rpx;
}

.title {
  font-size: 34rpx;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.28;
}

.status {
  flex-shrink: 0;
  max-width: 300rpx;
  background: #eef2f7;
  color: #334155;
  border: 1px solid #dbe4ee;
  border-radius: 16rpx;
  padding: 10rpx 14rpx;
  font-size: 22rpx;
}

.status.loading {
  background: #e0f2fe;
  border-color: #bae6fd;
  color: #075985;
}

.status.active {
  background: #ecfdf5;
  border-color: #bbf7d0;
  color: #166534;
}

.grid-two {
  display: grid;
  grid-template-columns: 1fr;
  gap: 14rpx;
}

.field {
  margin-bottom: 14rpx;
}

.field.grow {
  flex: 1;
  margin-bottom: 0;
}

.label {
  font-size: 23rpx;
  color: #1e293b;
  font-weight: 600;
  margin-bottom: 10rpx;
}

.input,
.textarea,
.select-box {
  width: 100%;
  box-sizing: border-box;
  border-radius: 16rpx;
  border: 1px solid #dbe4ee;
  background: #fbfdff;
  color: #0f172a;
}

.input {
  height: 82rpx;
  padding: 0 16rpx;
  font-size: 26rpx;
}

.textarea {
  min-height: 180rpx;
  padding: 16rpx;
  font-size: 26rpx;
  line-height: 1.5;
}

.textarea.small {
  min-height: 130rpx;
}

.select-box {
  padding: 16rpx;
}

.select-title {
  font-size: 24rpx;
  font-weight: 600;
}

.select-sub {
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #64748b;
  word-break: break-all;
}

.radio-row {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 14rpx 16rpx;
  border-radius: 16rpx;
  border: 1px solid #dbe4ee;
  background: #fbfdff;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: #334155;
  font-size: 22rpx;
}

.row {
  display: flex;
  gap: 14rpx;
  align-items: flex-end;
}

.connect-btn {
  min-width: 180rpx;
  height: 82rpx;
  line-height: 82rpx;
  border-radius: 16rpx;
  background: #0ea5e9;
  color: #fff;
  border: none;
}

.connect-btn.danger {
  background: #ef4444;
}

.hint {
  margin-top: 6rpx;
  margin-bottom: 10rpx;
}

.error-box {
  margin-top: 10rpx;
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #be123c;
  border-radius: 16rpx;
  padding: 14rpx;
  font-size: 23rpx;
}

.section-title {
  font-size: 25rpx;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 12rpx;
}

.composer {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.composer-actions {
  display: flex;
  gap: 12rpx;
}

.primary-btn,
.secondary-btn {
  flex: 1;
  border-radius: 16rpx;
}

.secondary-btn {
  background: #e2e8f0;
  color: #1e293b;
}

.ghost-btn {
  width: 100%;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  color: #334155;
}

.small-btn {
  flex: 0 0 auto;
  min-width: 140rpx;
}

.audio-player {
  width: 100%;
  margin-top: 12rpx;
}

.empty {
  color: #64748b;
  font-size: 22rpx;
}

.chat-list {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.chat-item {
  border-radius: 16rpx;
  padding: 14rpx;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
}

.chat-item.user {
  background: #eff6ff;
  border-color: #bfdbfe;
}

.chat-item.assistant {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.chat-role {
  display: inline-block;
  margin-bottom: 8rpx;
  font-size: 20rpx;
  padding: 4rpx 10rpx;
  border-radius: 999rpx;
  background: rgba(15, 23, 42, 0.06);
  color: #334155;
}

.chat-text {
  font-size: 24rpx;
  line-height: 1.55;
  color: #0f172a;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-audio {
  width: 100%;
  margin-top: 10rpx;
}

.log-box {
  max-height: 340rpx;
  background: #0b1220;
  border-radius: 16rpx;
  padding: 12rpx;
  box-sizing: border-box;
}

.log-line {
  font-size: 20rpx;
  color: #cbd5e1;
  font-family: Consolas, 'Courier New', monospace;
  line-height: 1.5;
  margin-bottom: 6rpx;
  word-break: break-all;
}

@media (min-width: 768px) {
  .dialog-page {
    max-width: 980px;
    margin: 0 auto;
    padding: 24px;
  }

  .grid-two {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
