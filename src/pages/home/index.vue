<!-- "style": { "navigationBarTitleText": "柯臣" ,"navigationStyle": "custom"} -->
<route  lang="json" type="home">
  {

    "style": { "navigationBarTitleText": "柯臣" }
  }
</route>

<script setup lang="ts">
const router = useRouter()
function handleListDataPreview() {
  router.push('/feature/pages/list-data-preview/index')
}

function handleTest() {
  router.push('/feature/pages/test/index')
}
</script>

<template>
  <view class="container">
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
