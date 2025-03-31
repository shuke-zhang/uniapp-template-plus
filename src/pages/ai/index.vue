<route lang="json">
{
  "style": {
    "navigationBarTitleText": "AI对话"
  }
}
</route>

<script setup lang="ts">
import { aiModelList } from './const'
import Deepseek from './deepseek.vue'

const AiList = aiModelList.map(item => item.name!)
const current = ref(0)
const replyForm = ref({ content: '', role: 'user' })
const isFocus = ref(false)
const deepseekRefs = reactive<Record<string, InstanceType<typeof Deepseek> >>(
  AiList.reduce((acc, name) => ({ ...acc, [name]: null }), {}),
)

const isAnyLoading = computed(() => AiList.some(name => deepseekRefs[name]?.loading))

function handleSubmit() {
  if (isIOS)
    return showToastError('暂不支持ios端')

  if (deepseekRefs[AiList[current.value]]?.loading) {
    console.log('正在回答中')

    return showToastError('请等待上个问题回答后重试')
  }
  else {
    deepseekRefs[AiList[current.value]]?.handleSubmit()
    replyForm.value.content = ''
    isFocus.value = false
    console.log(isFocus.value, '发送')
  }
}

function handleStop() {
  deepseekRefs[AiList[current.value]]?.handleStopChat()
}

function onClickItem(event: { currentIndex: number }) {
  current.value = event.currentIndex
}

function handleSubmitAll() {
  if (isIOS)
    return showToastError('暂不支持ios端')

  if (isAnyLoading.value) {
    return showToastError('请等待回答完成')
  }

  if (!replyForm.value.content.trim()) {
    return showToastError('请输入问题')
  }

  // 遍历所有AI模型实例
  AiList.forEach((name) => {
    const instance = deepseekRefs[name]
    if (instance) {
      // 确保内容同步
      instance.sendMsg = replyForm.value.content
      replyForm.value.content = ''
      // 提交请求
      instance.handleSubmit()
      isFocus.value = false
    }
  })
}
</script>

<template>
  <view class="container ">
    <view class="header fixed  top-0  left-0 right-0 bg-#ffffff">
      <uni-segmented-control :current="current" :values="AiList" style-type="text" class="bg-#ffffff" @click-item="onClickItem" />
    </view>

    <view class="content h-full">
      <template v-for="(_name, index) in AiList" :key="index">
        <Deepseek v-show="current === index" :ref="el => { (deepseekRefs[_name] as any) = el }" :send-msg="replyForm.content" :ai-model-index="index" />
      </template>
    </view>

    <!--  :is-stop="isLoading" -->
    <!-- :btn-text="isLoading ? '停止' : '发送' " -->
    <CommentInput
      v-model:model-value="replyForm.content"
      v-model:focus="isFocus"
      placeholder="请输入您的问题..."
      is-offset
      class="flex-1"
      btn-text="发送"
      :is-disabled="replyForm.content && deepseekRefs[AiList[current]]?.loading"
      @confirm="handleSubmit"
      @stop="handleStop"
    />

    <view class="float-button">
      <Iconfont name="fasong" :class="{ 'disabled-icon': isAnyLoading }" :size="120" @click="handleSubmitAll" />
    </view>
  </view>
</template>

<style scoped lang="scss">
.container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f5f5;
}

.header {
  padding: 12px;
  background-color: #fff;
  z-index: 999;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.float-button {
  position: fixed;
  right: 8rpx;
  bottom: 300rpx;
  /* 距离底部100px */
  z-index: 999;
  /* 按钮样式 */
  border-radius: 50%;
  /* 内容居中 */
  display: flex;
  align-items: center;
  justify-content: center;

  /* 点击效果 */
  transition: transform 0.2s;

  &:active {
    transform: scale(0.95);
  }
}

.button-text {
  color: #fff;
  font-size: 24rpx;
  text-align: center;
  line-height: 1.4;
}
.disabled-icon {
  opacity: 0.5;
}
</style>
