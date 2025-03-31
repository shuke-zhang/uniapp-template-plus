<script setup lang="ts">
import { aiModelList, setAiContent } from './const'
import type { IconFontType } from '@/components/icon-font/iconfont'

const props = defineProps({
  sendMsg: {
    type: String,
    required: true,
  },
  aiModelIndex: {
    type: Number,
    default: 0,
  },
})

const currentAiModel = computed(() => aiModelList[props.aiModelIndex])
const sendMsg = computed(() => props.sendMsg)
// const scrollRef = ref<HTMLElement | null>(null)
const { chatSSEClientRef, modelName, loading, content, startChat, stopChat, onStart, onError, onSuccess, onFinish } = useAi(aiModelList[props.aiModelIndex])

function handleSubmit() {
  const sendText = setAiContent({
    type: 'send',
    msg: sendMsg.value,
    modeName: modelName.value || '',
  })
  content.value?.push(sendText)
  // 添加AI的临时占位消息
  content.value.push({
    role: 'assistant',
    content: '',
    streaming: true,
  })

  startChat()
  // 滚动到底部
  nextTick(() => {
    // scrollRef.value?.scrollTo({
    //   top: scrollRef.value.scrollHeight,
    //   duration: 300,
    // })
  })
}

function handleStopChat() {
  stopChat()
}

const height = computed(() => {
  return `calc(100% - 120rpx )`
})

// function handleContinue() {
//   // 继续生成
//   content.value[content.value.length - 1].prefix = true
//   startChat()
// }

function formatQwenText(array: Array<{
  type: string
  text: string
}> | string) {
  if (!Array.isArray(array))
    return array
  return array.map(item => item.text).join('').trim()
}

defineExpose({
  loading,
  sendMsg,
  handleSubmit,
  handleStopChat,
})
</script>

<template>
  <view class="flex flex-col h-full  pt-120rpx" :style="{ height }">
    <GaoChatSSEClient
      ref="chatSSEClientRef"
      @on-open="onStart"
      @on-error="onError"
      @on-message="onSuccess"
      @on-finish="onFinish"
    />

    <scroll-view scroll-y class="pr-20rpx pl-20rpx  h-full ">
      <view v-if="content.length === 0" class="h-full flex justify-center flex-col items-center">
        <Icon-font :name="currentAiModel.icon as IconFontType" :size="160" />
        <view class="font-size-60rpx mt-20rpx">
          我是{{ currentAiModel.name }}
        </view>
        <view class="mt-20rpx w-80%">
          我可以帮你搜索、答疑、写作、请在下方输入你的内容~
        </view>
      </view>

      <view v-for="(msg, index) in content" :key="index">
        <!-- 用户消息 -->
        <view v-if="msg.role === 'user'" class=" flex mt-16rpx mb-16rpx   flex-justify-end">
          <view class="message-bubble p-32rpx border-rd-16rpx   bg-#07c160 color-white max-w-80%">
            {{ Array.isArray(msg.content) ? msg.content[0].text : msg.content }}
            {{ modelName === 'qwen' ? formatQwenText(msg.content || '') : '' }}
          </view>
        </view>

        <!-- AI消息（含加载状态） -->
        <view v-else class="flex justify-start ">
          <Icon-font :name="currentAiModel.icon as IconFontType" class="mt-20rpx mr-10rpx" />
          <view class="flex mt-16rpx mb-16rpx flex-justify-start bg-#ffffff color-#333333 max-w-80% border-rd-16rpx">
            <view
              class="message-bubble  p-32rpx border-rd-16rpx w-100%"
              :class="[msg.streaming && !(msg.content && msg.content.length) ? 'flex-center w-120rpx h-120rpx ' : '']"
            >
              <UaMarkdown :source="msg.content" :show-line="false" />
              <!-- {{ msg.content }} -->

              <!-- 流式加载动画 -->
              <view v-if=" msg.streaming && !(msg.content && msg.content.length)" class="flex-center">
                <uni-load-more icon-type="auto" status="loading" :show-text="false" />
              </view>
              <!--
              <button v-if="!msg.streaming" hover-stop-propagation @click="handleContinue">
                重新生成
              </button> -->
            </view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped lang="scss">
.message-bubble {
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

// /* 调整加载组件样式 */
// .uni-load-more {
//   margin: 0 !important; /* 清除默认边距 */
// }

// /* 隐藏文字内容 */
// .uni-load-more__text {
//   display: none;
// }

// /* 调整动画位置 */
// .uni-load-more__icon {
//   margin: 0 !important;
// }
</style>
