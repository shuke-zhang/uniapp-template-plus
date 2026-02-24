<route  lang="json" type="page">
  {

    "style": { "navigationBarTitleText": "uniapp-template-plus" }
  }
</route>


<script setup lang="ts">
const plugin = uni.requireNativePlugin('shuke')
const reply = ref('')
const msg = ref('')
onMounted(() => {
  plugin.sayHi('舒克', (res: any) => {
    msg.value = JSON.stringify(res)
    reply.value = res.re
  })
})
</script>

<template>
  <view class="w-full flex-center ">
    <view style="width:100vw;text-align: center; font-weight: bold; padding: 15px 0;">
      插件调试-测试是否
    </view>
    <view style="padding: 15px 30px;">
      返回信息：{{ reply || '---?' }}
    </view>
    <view style="padding: 15px 30px;">
      原始数据：{{ msg  || '---?' }}
    </view>

	
  </view>
</template>

<style scoped>
.content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
 
	.logo {
		height: 200rpx;
		width: 200rpx;
		margin-top: 200rpx;
		margin-left: auto;
		margin-right: auto;
		margin-bottom: 50rpx;
	}
 
	.text-area {
		display: flex;
		justify-content: center;
	}
 
	.title {
		font-size: 36rpx;
		color: #8f8f94;
	}

</style>
