<route lang="json">
 {
      "style": { "navigationBarTitleText": "测试页面" }
 }
</route>

<script setup lang="ts">
const { uniPlatform } = uni.getAppBaseInfo()
console.log(uniPlatform, 'uniPlatform')
</script>

<template>
  <view class="container">
    测试
  </view>
</template>

<style  lang="scss">
</style>
