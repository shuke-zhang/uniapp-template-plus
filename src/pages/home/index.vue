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
</script>

<template>
  <view class="container">
    首页

    <button @click="handleListDataPreview">
      跳转
    </button>
  </view>
</template>

<style  lang="scss">
</style>
