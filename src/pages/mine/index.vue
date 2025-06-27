<route  lang="json" type="mine">
  {
    "style": { "navigationBarTitleText": "uniapp-template-plus" }

  }
</route>

<script setup lang="ts">
const userStore = useUserStore()
function handleLogout() {
  userStore.performLogout()
}
</script>

<template>
  <view class="container ">
    个人中心
    <button
      class="mx-32rpx h-100rpx border-0 border-rd-24rpx  flex-center p-0  color-primary "
      @click="handleLogout"
    >
      退出登录
    </button>
  </view>
</template>

<style  lang="scss">
</style>
