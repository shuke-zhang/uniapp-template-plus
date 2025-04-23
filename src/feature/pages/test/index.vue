<route lang="json">
 {
      "style": { "navigationBarTitleText": "测试页面" }
 }
</route>

<script setup lang="ts">
const { uniPlatform } = uni.getAppBaseInfo()
const test = uni.getAppBaseInfo()
const { platform } = uni.getDeviceInfo()
const platformSync = uni.getSystemInfoSync().platform
console.log(platformSync, 'platformSync')

console.log(platform, 'platform')
console.log(uniPlatform, 'uniPlatform')
console.log(test, 'test')
console.log(isWeixin, 'isWeixin')
console.log(isWeb, 'isWeb')
console.log(isApp, 'isApp')
console.log(isH5, 'isH5')
console.log(isAndroid, 'isAndroid')
console.log(isIOS, 'isIOS')
console.log(isDevtools, 'isDevtools')
const isWeixins = isWeixin
const isWebs = isWeb
const isApps = isApp
const isH5s = isH5
const isAndroids = isAndroid
const isIOss = isIOS
const isDevtoolss = isDevtools
</script>

<template>
  <view class="container">
    测试
  </view>
  <view class="flex flex-col">
    <text class="mt-20rpx">
      isWeixin---{{ isWeixins }}
    </text>
    <text class="mt-20rpx">
      isWeb---{{ isWebs }}
    </text>
    <text class="mt-20rpx">
      isApp---{{ isApps }}
    </text>
    <text class="mt-20rpx">
      isH5---{{ isH5s }}
    </text>
    <text class="mt-20rpx">
      isAndroid---{{ isAndroids }}
    </text>
    <text class="mt-20rpx">
      isIOS---{{ isIOss }}
    </text>
    <text class="mt-20rpx">
      isDevtools---{{ isDevtoolss }}
    </text>
  </view>
</template>

<style  lang="scss">
</style>
