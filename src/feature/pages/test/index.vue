<route lang="json">
 {
      "style": { "navigationBarTitleText": "测试页面" }
 }
</route>

<script setup lang="ts">
const router = useRouter()

const currentPages = getCurrentPages()
const vm = currentPages[0].$vm
console.log(currentPages[0], 'currentPages[0]')

console.log(vm, 'currentPages')
onReady(() => {
})

const scaleVm = getPageExpose('pages/scale/index')
console.log(scaleVm, '测试')

function handleClick(isRefresh: boolean) {
  router.back()
  if (isRefresh) {
    scaleVm.updateData()
  }
}

function handleClickVm() {
  const vm = getPageVm<typeof import ('@/pages/scale/index.vue')['default']>()
  console.log(vm, 'test组件内部使用vm方式')
  vm?.testExpose()
}
</script>

<template>
  <view>
    内容
  </view>
  <button type="primary" class="mt-40rpx" @click="handleClick(false)">
    点击跳转不做刷新
  </button>
  <button type="primary" class="mt-40rpx" @click="handleClick(true)">
    点击跳转并且刷新
  </button>

  <button type="primary" class="mt-40rpx" @click="handleClickVm(true)">
    点击跳转采用vm的方式
  </button>
</template>

<style  lang="scss">
</style>
