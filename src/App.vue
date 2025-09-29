<script setup lang="ts">
import { onHide, onLaunch, onShow } from '@dcloudio/uni-app'

onShow(() => {
  console.log('App Show')
})
onHide(() => {
  console.log('App Hide')
})
const whiteList = [
  '/feature/pages/test/index',
]
const userStore = useUserStore()

// onLaunch(async () => {
//   nextTick(async () => {
//     const pages = getCurrentPages()
//     const pageName = pages?.[pages.length - 1]?.route || ''
//     console.log(pages, '当前页面:', pageName)

//     if (pageName.includes('/pages/common/auth'))
//       return
//     if (whiteList.some(path => pageName.includes(path)))
//       return
//     if (getCacheToken()) {
//       await userStore.getUserInfo()
//     }
//     else {
//       userStore.performLogout()
//     }
//   })
// })
</script>

<style lang="scss">
:not(not) {
  box-sizing: border-box;
}
</style>
