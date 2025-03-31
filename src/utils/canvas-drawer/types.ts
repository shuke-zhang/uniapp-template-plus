export interface Image extends HTMLCanvasElement {
  /** 图片的真实高度 */
  height: number;
  /** 图片加载发生错误后触发的回调函数 */
  onerror: (...args: any[]) => any;
  /** 图片加载完成后触发的回调函数 */
  onload: (...args: any[]) => any;
  /** 需要基础库： `2.13.0`
      *
      * `origin`: 发送完整的referrer; `no-referrer`: 不发送。格式固定为 `https://servicewechat.com/{appid}/{version}/page-frame.html`，其中 {appid} 为小程序的 appid，{version} 为小程序的版本号，版本号为 0 表示为开发版、体验版以及审核版本，版本号为 devtools 表示为开发者工具，其余为正式版本； */
  referrerPolicy: string;
  /** 图片的 URL。v2.11.0 起支持传递 base64 Data URI */
  src: string;
  /** 图片的真实宽度 */
  width: number;

  complete: boolean;
}

export interface Canvas {
  /** 画布高度 */
  height: number;
  /** 画布宽度 */
  width: number;
  /** [Canvas.cancelAnimationFrame(number requestID)](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.cancelAnimationFrame.html)
       *
       * 需要基础库： `2.7.0`
       *
       * 在插件中使用：支持
       *
       * 取消由 requestAnimationFrame 添加到计划中的动画帧请求。支持在 2D Canvas 和 WebGL Canvas 下使用, 但不支持混用 2D 和 WebGL 的方法。 */
  cancelAnimationFrame(requestID: number): void;
  /** [[ImageData](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/ImageData.html) Canvas.createImageData()](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.createImageData.html)
       *
       * 需要基础库： `2.9.0`
       *
       * 在插件中使用：支持
       *
       * 创建一个 ImageData 对象。仅支持在 2D Canvas 中使用。 */
  createImageData(): ImageData;
  /** [[Image](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Image.html) Canvas.createImage()](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.createImage.html)
       *
       * 需要基础库： `2.7.0`
       *
       * 在插件中使用：支持
       *
       * 创建一个图片对象。 支持在 2D Canvas 和 WebGL Canvas 下使用, 但不支持混用 2D 和 WebGL 的方法。 */
  createImage(): Image;
  /** [[Path2D](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Path2D.html) Canvas.createPath2D([Path2D](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Path2D.html) path)](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.createPath2D.html)
       *
       * 需要基础库： `2.11.0`
       *
       * 在插件中使用：支持
       *
       * 创建 Path2D 对象 */
  createPath2D(
  /** [Path2D](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Path2D.html) */
    path: Path2D
  ): Path2D;
  /** [[RenderingContext](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/RenderingContext.html) Canvas.getContext(string contextType)](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.getContext.html)
       *
       * 需要基础库： `2.7.0`
       *
       * 在插件中使用：支持
       *
       * 该方法返回 Canvas 的绘图上下文
       *
       * ****
       *
       * 支持获取 2D 和 WebGL 绘图上下文 */
  getContext(
  /** 上下文类型
           *
           * 参数 contextType 可选值：
           * - '2d': 2d 绘图上下文; */
    contextType: '2d'
  ): CanvasRenderingContext2D;
  /** [[RenderingContext](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/RenderingContext.html) Canvas.getContext(string contextType)](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.getContext.html)
       *
       * 需要基础库： `2.7.0`
       *
       * 在插件中使用：支持
       *
       * 该方法返回 Canvas 的绘图上下文
       *
       * ****
       *
       * 支持获取 2D 和 WebGL 绘图上下文 */
  getContext(
  /** 上下文类型
           *
           * 参数 contextType 可选值：
           * - 'webgl': webgl 绘图上下文; */
    contextType: 'webgl'
  ): WebGLRenderingContext;
  /** [[RenderingContext](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/RenderingContext.html) Canvas.getContext(string contextType)](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.getContext.html)
       *
       * 需要基础库： `2.7.0`
       *
       * 在插件中使用：支持
       *
       * 该方法返回 Canvas 的绘图上下文
       *
       * ****
       *
       * 支持获取 2D 和 WebGL 绘图上下文 */
  getContext(
  /** 上下文类型
           *
           * 参数 contextType 可选值：
           * - 'webgl2': webgl2 绘图上下文; */
    contextType: 'webgl2'
  ): WebGL2RenderingContext;
  /** [number Canvas.requestAnimationFrame(function callback)](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.requestAnimationFrame.html)
       *
       * 需要基础库： `2.7.0`
       *
       * 在插件中使用：支持
       *
       * 在下次进行重绘时执行。 支持在 2D Canvas 和 WebGL Canvas 下使用, 但不支持混用 2D 和 WebGL 的方法。 */
  requestAnimationFrame(
  /** 执行的 callback */
    callback: (...args: any[]) => any
  ): number;
  /** [string Canvas.toDataURL(string type, number encoderOptions)](https://developers.weixin.qq.com/miniprogram/dev/api/canvas/Canvas.toDataURL.html)
       *
       * 需要基础库： `2.11.0`
       *
       * 在插件中使用：支持
       *
       * 返回一个包含图片展示的 data URI 。可以使用 type 参数其类型，默认为 PNG 格式。 */
  toDataURL(
  /** 图片格式，默认为 image/png */
    type: string,
  /** 在指定图片格式为 image/jpeg 或 image/webp的情况下，可以从 0 到 1 的区间内选择图片的质量。如果超出取值范围，将会使用默认值 0.92。其他参数会被忽略。 */
    encoderOptions: number
  ): string;
}