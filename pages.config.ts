import { defineUniPages } from '@uni-helper/vite-plugin-uni-pages'

export default defineUniPages({
  // 你也可以定义 pages 字段，它具有最高的优先级。
  // pages: [],
  globalStyle: {
    navigationBarTextStyle: 'black',
    navigationBarTitleText: 'shuke',
    navigationBarBackgroundColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  tabBar: {
    color: '#707070',
    selectedColor: '#49b9ad',
    backgroundColor: '#ffffff',
    borderStyle: 'black',
    fontSize: '10px',
    height: '50px',
    iconWidth: '24px',
    spacing: '3px',
    position: 'bottom',
    list: [
      {
        pagePath: 'pages/home/index',
        iconPath: 'static/tabbar/home-off.png',
        selectedIconPath: 'static/tabbar/home-on.png',
        text: '首页',
      },
      {
        pagePath: 'pages/mine/index',
        iconPath: 'static/tabbar/mine-off.png',
        selectedIconPath: 'static/tabbar/mine-on.png',
        text: '个人',
      },
    ],
  },

  easycom: {
    autoscan: true,
    custom: {
      '^uni-(.*)': '@dcloudio/uni-ui/lib/uni-$1/uni-$1.vue',
      '^z-(.*)': '@zebra-ui/swiper/components/z-$1/z-$1.vue',
    },
  },

  // 分包自动导入配置请在vite中 UniPages 配置
  // subPackages: [],
})
