<route type="auth" lang="json">
  {
    "style": {
      "navigationStyle": "custom",
      "navigationBarTitleText": "登录"
    }
  }
</route>

<script setup lang="ts">
import { getCodeImg } from '@/api/auth'

const router = useRouter()
const { login } = useUserStore()
const form = ref({
  username: __DEV__ ? 'admin' : '',
  password: __DEV__ ? 'admin123' : '',
  code: '',
  uuid: '',
})

const codeImg = ref('')
function submit() {
  showLoading('正在登录...')
  login(form.value).then(() => {
    hideLoading()
    router.switchTab({
      url: '/pages/home/index',
    })
  }).catch(() => {
    getCode()
  })
}

function getCode() {
  return getCodeImg().then((res) => {
    codeImg.value = res.img
    form.value.uuid = res.uuid
  })
}

onReady(() => {
  getCode()
  console.log(123)
})
</script>

<template>
  <view class="w-full h-full flex flex-col items-center justify-center bg-cover box-border">
    <image
      src="/static/logo.png"
      class="w-[180rpx] h-[180rpx]"
    />

    <text class="text-black text-center font-bold mt-[40rpx]">
      欢迎使用uni-app
    </text>

    <view class="mt-[80rpx] w-[600rpx] space-y-[50rpx]">
      <view class="border-b border-[#f2f2f2] h-[100rpx] flex items-center">
        <iconfont
          name="user"
          color="#666"
        />
        <input
          v-model="form.username"
          type="text"
          class="text-black text-base px-[30rpx] flex-1 h-full"
          placeholder-class="text-gray-400 text-base"
          placeholder="请输入用户名"
        >
      </view>

      <view class="border-b border-[#f2f2f2] h-[100rpx] flex items-center">
        <iconfont
          name="lock"
          color="#666"
        />
        <input
          v-model="form.password"
          type="text"
          class="text-black text-base px-[30rpx] flex-1 h-full"
          placeholder-class="text-gray-400 text-base"
          password
          placeholder="请输入密码"
        >
      </view>

      <view class="border-b border-[#f2f2f2] h-[100rpx] flex items-center justify-between">
        <input
          v-model="form.code"
          type="text"
          class="text-black text-base px-[30rpx] flex-1 h-full"
          placeholder-class="text-gray-400 text-base"
          placeholder="请输入验证码"
        >
        <image
          class="w-[200rpx] h-[80rpx]"
          :src="`data:image/gif;base64,${codeImg}`"
          @click="getCode"
        />
      </view>

      <button
        type="primary"
        class="mt-[20rpx]"
        :disabled="!form.username || !form.password"
        @click="submit"
      >
        登录
      </button>
    </view>
  </view>
</template>

<style scoped>
/* 样式已全部移入标签 class 内，无需再写样式 */
</style>
