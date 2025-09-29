<!-- "style": { "navigationBarTitleText": "uniapp-template-plus" ,"navigationStyle": "custom"} -->
<route  lang="json" type="home">
  {

    "style": { "navigationBarTitleText": "uniapp-template-plus" }
  }
</route>

<script setup lang="ts">
const router = useRouter()
function handleListDataPreview() {
  router.push('/feature/pages/list-data-preview/index')
}

function handleTest() {
  router.push('/pages/test/index')
}
</script>

<template>
  <view class="container w-[100vw]">
    首页

    <button type="primary" @click="handleListDataPreview">
      跳转
    </button>

    <button type="primary" class="mt-40rpx" @click="handleTest">
      跳转测试页
    </button>
  </view>
</template>

<style  lang="scss">
</style>
