declare namespace UniApp {
  interface GetAppBaseInfoResult {
    /**
     * 运行平台
     *
     * 可选值包括:
     * - 'android'
     * - 'ios'
     * - 'web'
     * - 'app'
     * - 'mp-weixin' (微信小程序)
     * - 'mp-alipay' (支付宝小程序)
     * - 'mp-baidu' (百度小程序)
     * - 'mp-toutiao' (抖音小程序)
     * - 'mp-lark' (飞书小程序)
     * - 'mp-qq' (QQ小程序)
     * - 'mp-kuaishou' (快手小程序)
     * - 'mp-jd' (京东小程序)
     * - 'mp-360' (360小程序)
     * - 'mp-harmony' (鸿蒙元服务)
     * - 'quickapp-webview' (快应用通用，包含联盟、华为等)
     * - 'quickapp-webview-union' (快应用联盟)
     * - 'quickapp-webview-huawei' (快应用华为)
     */
    uniPlatform:
      | 'android'
      | 'ios'
      | 'web'
      | 'app'
      | 'mp-weixin'
      | 'mp-alipay'
      | 'mp-baidu'
      | 'mp-toutiao'
      | 'mp-lark'
      | 'mp-qq'
      | 'mp-kuaishou'
      | 'mp-jd'
      | 'mp-360'
      | 'mp-harmony'
      | 'quickapp-webview'
      | 'quickapp-webview-union'
      | 'quickapp-webview-huawei'
  }
}
