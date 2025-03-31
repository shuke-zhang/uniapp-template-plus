/* eslint-disable jsdoc/check-param-names */
import { nextTick } from 'vue'
import type { Canvas, Image } from './types'
import type { Layer } from '@/model/template'
import { base64ToUrl } from '@/api/file/base64ToUrl'

export * from './types'

export interface CanvasDrawerTextOption {
  font?: string
  align?: 'left' | 'center' | 'right'
  color?: string
  fontWeight?: 'normal' | 'bold' | number
  fontSize?: number
  lineHeight?: number
  maxWidth?: number
  verticalCenter?: boolean
  fontFamily?: string
  textBaseline?: CanvasTextBaseline
}

enum CanvasDrawerDrawType {
  IMAGE = 'image',
  TEXT = 'text',
  CANVAS = 'canvas',
  STROKE_RECT = 'stroke-rect',
  FILL_RECT = 'fill-rect',
  LINE = 'line',
  CIRCLE = 'circle',
}

type CanvasToTempFilePathOptions = Omit<UniNamespace.CanvasToTempFilePathOptions, 'canvasId'>
type DrawImageParameters = Parameters<CanvasDrawer['_drawImage']>
type DrawTextParameters = Parameters<CanvasDrawer['_drawText']>
type DrawCanvasParameters = Parameters<CanvasDrawer['_drawCanvas']>
type DrawStrokeRectParameters = Parameters<CanvasDrawer['_drawStrokeRect']>
type DrawFillRectParameters = Parameters<CanvasDrawer['_drawFillRect']>
type DrawLineParameters = Parameters<CanvasDrawer['_drawLine']>
type DrawArcParameters = Parameters<CanvasDrawer['_drawCircle']>

type DrawImageParametersWithType = [typeof CanvasDrawerDrawType['IMAGE'], ...DrawImageParameters]
type DrawTextParametersWithType = [typeof CanvasDrawerDrawType['TEXT'], ...DrawTextParameters]
type DrawCanvasParametersWithType = [typeof CanvasDrawerDrawType['CANVAS'], ...DrawCanvasParameters]
type DrawStrokeRectParametersWithType = [typeof CanvasDrawerDrawType['STROKE_RECT'], ...DrawStrokeRectParameters]
type DrawFillRectParametersWithType = [typeof CanvasDrawerDrawType['FILL_RECT'], ...DrawFillRectParameters]
type DrawLineParametersWithType = [typeof CanvasDrawerDrawType['LINE'], ...DrawLineParameters]
type DrawArcParametersWithType = [typeof CanvasDrawerDrawType['CIRCLE'], ...DrawArcParameters]

type CanvasDrawerDrawTypes = DrawImageParametersWithType | DrawCanvasParametersWithType | DrawTextParametersWithType | DrawStrokeRectParametersWithType | DrawLineParametersWithType | DrawFillRectParametersWithType | DrawArcParametersWithType

type ObjectFitOptions = 'fill' | 'contain' | 'cover' | 'none' | 'scale-down'

export class CanvasDrawer extends EventEmitter<{
  size: (width: number | string, height: number | string) => void
  error: (err: any) => void
}> {
  private width = 0
  private height = 0
  private task: CanvasDrawerDrawTypes[] = [] // 绘制任务
  private _ctx!: CanvasRenderingContext2D
  canvas!: Canvas

  imageCache: Record<string, Image> = {

  }

  /**
   * @description 生成canvas实例
   * @param width
   * @param height
   */
  init(width: number, height: number) {
    if (this._ctx) {
      this.ctx.clearRect(0, 0, width, height)
      return this
    }
    this.width = width
    this.height = height
    console.log('init-width', width, this.width, 'height', height, this.height)

    this.canvas = uni.createOffscreenCanvas({ type: '2d', width, height }) as Canvas
    console.log('init-canvas', this.canvas)
    const base64 = this.canvas.toDataURL('image/png', 1)
    console.log('init-base64', base64)
    this._ctx = this.canvas.getContext('2d')
    console.log('init-this._ctx', this._ctx)

    return this
  }

  get ctx() {
    if (!this._ctx)
      throw new Error('找不到 CanvasRenderingContext2D 请检查是否执行 init 方法')
    return this._ctx
  }

  isBase64(url: string) {
    return /^data:image\/(?:png|jpg|jpeg|gif|svg\+xml);base64,/.test(url)
  }

  /**
   * 获取图片路径
   * @param url
   */
  private getUrl(url: string) {
    /**
     * base64
     */
    if (this.isBase64(url)) {
      return url
    }
    if (/^[a-z]+:\/\//i.test(url)) {
      return url
    }
    console.log(url, 'getUrl函数')

    return STATIC_URL + url
  }

  getTextWidth(text: string, size = 20, fontWeight: string | number = 'normal') {
    this.ctx!.font = `${fontWeight} ${size}px AlibabaPuHuiTi-Regular`
    return this.ctx.measureText(text).width
  }

  createImage(_path: string) {
    return new Promise<Image>((resolve, reject) => {
      const isLink = _path.startsWith('https://') || _path.startsWith('https://')
      if (this.imageCache[_path]) {
        const image = this.imageCache[_path]
        console.log('get cache image', image)
        resolve(image)
        return
      }
      const image = this.canvas.createImage()
      const path = isLink
        ? `${_path}?v=${Date.now()}`
        : _path
      image.src = path

      image.onload = () => {
        this.imageCache[_path] = image
        resolve(image)
      }
      image.onerror = (e) => {
        console.log('image.onerror', e)
        reject(e || new Error('图片绘制失败'))
      }
    })
  }

  /**
   * 绘制图片
   * @param url 图片url
   * @param x
   * @param y
   * @param width
   * @param height
   */
  private async _drawImage(
    url: string,
    x = 0,
    y = 0,
    width?: number,
    height?: number,
    radius = 0,
    objectFit: ObjectFitOptions = 'fill',
  ): Promise<this> {
    const _url = this.getUrl(url)

    try {
      const image = await this.createImage(_url)
      console.log('image--createImage', image)

      const { width: originalWidth, height: originalHeight } = image
      let finalWidth = 0
      let finalHeight = 0

      if ((width === undefined || height === undefined)) {
        // if (this.isBase64(_url)) {
        //   throw new Error('绘制base64 请使用 drawBase64 函数');
        // }
        const aspectRatio = originalWidth / originalHeight

        if (width === undefined && height === undefined) {
          finalWidth = originalWidth
          finalHeight = originalHeight
        }
        else if (width === undefined) {
          finalWidth = height! * aspectRatio
          finalHeight = height!
        }
        else if (height === undefined) {
          finalHeight = width / aspectRatio
          finalWidth = width
        }
      }
      else {
        finalWidth = width
        finalHeight = height
      }
      const isRadius = radius > 0
      if (isRadius) {
        this.ctx.save()
        this.ctx.beginPath()
        const min = Math.min(finalWidth, finalHeight) / 2
        radius = radius >= min ? min : radius <= 0 ? 0 : radius
        this.ctx.arc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5)
        this.ctx.arc(x + finalWidth - radius, y + radius, radius, Math.PI * 1.5, Math.PI * 2)
        this.ctx.arc(x + finalWidth - radius, y + finalHeight - radius, radius, 0, Math.PI * 0.5)
        this.ctx.arc(x + radius, y + finalHeight - radius, radius, Math.PI * 0.5, Math.PI)
        this.ctx.closePath()
        this.ctx.clip()
      }

      switch (objectFit) {
        case 'fill':
          this.ctx.drawImage(image, x, y, finalWidth, finalHeight)
          break
        case 'contain':
          this.drawContainedImage(image, x, y, finalWidth, finalHeight)
          break
        case 'cover':
          this.drawCoveredImage(image, x, y, finalWidth, finalHeight)
          break
        case 'none':
          // Handle 'none' option if needed
          break
        case 'scale-down':
          // Handle 'scale-down' option if needed
          break
      }

      if (isRadius) {
        this.ctx.restore()
      }

      return this
    }
    catch (error) {
      this.emit('error', JSON.stringify(error))
      console.log('error', error)
      console.log('drawImageWithOptions error', _url)
      throw new Error(`${_url} 图片绘制失败`)
    }
  }

  private drawContainedImage(image: Image, x: number, y: number, width: number, height: number): void {
    const sourceAspectRatio = image.width / image.height
    const destinationAspectRatio = width / height

    // const widthRatio = image.width / width;
    // const heightRatio = image.height / height;

    // console.log('@@ drawCoveredImage  [start]');
    // console.log('widthRatio', widthRatio);
    // console.log('heightRatio', heightRatio);
    // console.log('image.width', image.width);
    // console.log('image.height', image.height);
    // console.log('target.width', width);
    // console.log('target.height', height);
    // console.log('源图宽高比例', sourceAspectRatio);
    // console.log('目标宽高比例', destinationAspectRatio);

    let drawX = x
    let drawY = y
    let drawWidth = width
    let drawHeight = height
    const sWidth = image.width
    const sHeight = image.height
    const sx = 0
    const sy = 0

    if (sourceAspectRatio > destinationAspectRatio) {
      console.log('原图 比 目标图 宽')
      drawHeight = width / sourceAspectRatio
      drawY = (height - drawHeight) / 2 + y
    }
    else if (sourceAspectRatio < destinationAspectRatio) {
      console.log('原图 比 目标图 窄')
      drawWidth = height * sourceAspectRatio
      drawX = (width - drawWidth) / 2 + x
    }
    this.ctx.drawImage(image, sx, sy, sWidth, sHeight, drawX, drawY, drawWidth, drawHeight)
  }

  private drawCoveredImage(image: Image, x: number, y: number, width: number, height: number): void {
    const sourceAspectRatio = image.width / image.height
    const destinationAspectRatio = width / height
    const widthRatio = image.width / width
    const heightRatio = image.height / height
    // console.log('@@ drawCoveredImage  [start]');
    // console.log('widthRatio', widthRatio);
    // console.log('heightRatio', heightRatio);
    // console.log('image.width', image.width);
    // console.log('image.height', image.height);
    // console.log('target.width', width);
    // console.log('target.height', height);
    // console.log('源图宽高比例', sourceAspectRatio);
    // console.log('目标宽高比例', destinationAspectRatio);
    const drawX = x
    const drawY = y
    let drawWidth = width
    let drawHeight = height
    let sWidth = image.width
    let sHeight = image.height
    let sx = 0
    let sy = 0
    if (sourceAspectRatio > destinationAspectRatio) {
      console.log('原图 比 目标图 宽')
      drawWidth = width * heightRatio
      sx = Math.abs((drawWidth - image.width) / 2)
      sWidth = width * heightRatio
    }
    else if (sourceAspectRatio < destinationAspectRatio) {
      console.log('原图 比 目标图 窄')
      drawHeight = height * widthRatio
      sy = Math.abs((drawHeight - image.height) / 2)
      sHeight = height * widthRatio
    }
    this.ctx.drawImage(image, sx, sy, sWidth, sHeight, drawX, drawY, width, height)
  }

  /**
   * 绘制文本 文字绘制以文字左上角未坐标原点
   * @param text
   * @param x
   * @param y
   * @param option
   */
  private async _drawText(text: string, x: number, y: number, option?: CanvasDrawerTextOption): Promise<this> {
    const ctx = this.ctx
    text = text.replace(/[\r\n]/g, '')
    ctx.textBaseline = option?.textBaseline || 'top' // 或 'top', 'bottom', 等

    const _fontFamily = option?.fontFamily || 'AlibabaPuHuiTi-Regular'
    const fontStyle = option?.fontWeight || 'normal'
    // const fontFamily = await this.loadFontFace(_fontFamily);
    if (option?.fontWeight || option?.fontSize) {
      const fs = option?.fontSize ? getNumericValue(option.fontSize, 'px') : '32px'
      const f = `${fontStyle} ${fs} ${_fontFamily}`
      ctx.font = f
    }
    else {
      ctx.font = option?.font || ctx.font
    }

    ctx.textAlign = option?.align || 'left'
    option?.color && (ctx.fillStyle = option.color)

    if (option?.maxWidth && option?.lineHeight) {
      this.drawMultilineText(text, x, y, option.lineHeight, option.maxWidth, option)
    }
    else {
      if (option?.align === 'center' && option?.fontSize && option.verticalCenter !== false) {
        // 保证文字上下居中
        y -= option.fontSize / 2
      }
      ctx.fillText(text, x, y)
    }

    // ctx.stroke();
    return this
  }

  /**
   * 把当前画布指定区域的内容导出生成指定大小的图片
   * @param canvasId
   */
  private async getCanvasTempFilePath(canvasId: string, canvasToTempFilePathOptions: CanvasToTempFilePathOptions = { quality: 1 } as UniNamespace.CanvasToTempFilePathOptions) {
    try {
      const tempFilePath = (await uni.canvasToTempFilePath({
        canvasId,
        ...canvasToTempFilePathOptions,
      })).tempFilePath
      return tempFilePath
    }
    catch (error) {
      console.log('canvasToTempFilePath', canvasId)
      throw error
    }
  }

  /**
   * 把当前画布指定区域的内容导出生成指定大小的图片 的 url 进行绘制
   * @param canvasId
   * @param x
   * @param y
   * @param width
   * @param height
   */
  private async _drawCanvas(canvasId: string, x = 0, y = 0, width?: number, height?: number): Promise<this> {
    try {
      const url = await this.getCanvasTempFilePath(canvasId)
      return this._drawImage(url, x, y, width, height)
    }
    catch (error) {
      console.log('drawCanvasTempFilePath', canvasId)
      throw error
    }
  }

  /**
   * 绘制图片
   * @param url 图片url
   * @param x
   * @param y
   * @param width
   * @param height
   */
  drawImage(...args: DrawImageParameters) {
    this.task.push([CanvasDrawerDrawType.IMAGE, ...args])
    return this
  }

  /**
   * 绘制文本
   * @param text
   * @param x
   * @param y
   * @param option
   */
  drawText(...args: DrawTextParameters) {
    this.task.push([CanvasDrawerDrawType.TEXT, ...args])
    return this
  }

  /**
   * 把当前画布指定区域的内容导出生成指定大小的图片 的 url 进行绘制
   * @param canvasId
   * @param x
   * @param y
   * @param width
   * @param height
   */
  drawCanvas(...args: DrawCanvasParameters) {
    this.task.push([CanvasDrawerDrawType.CANVAS, ...args])
    return this
  }

  private _drawLine(
    startX: number, // 起始点的x坐标
    startY: number, // 起始点的y坐标
    endX: number, // 终点的x坐标
    endY: number, // 终点的y坐标
    color: string,
    lineWidth = 2,
  ) {
    const ctx = this.ctx
    ctx.beginPath()
    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    // ctx.setStrokeStyle(color); // 线条颜色
    // ctx.setLineWidth(lineWidth); // 线条宽度

    // 指定线条的起始点和终点
    ctx.moveTo(startX, startY) // 移动到起始点
    ctx.lineTo(endX, endY) // 绘制线条至终点

    // 绘制线条
    ctx.stroke()
    return this
  }

  createOffsetLineDrawer(offsetX: number, offsetY: number, _color?: string, _lineWidth = 2) {
    return (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      color?: string,
      lineWidth = 2,
    ) => {
      return this.drawLine(
        offsetX + startX,
        offsetY + startY,
        offsetX + endX,
        offsetY + endY,
        color || _color || '#000',
        lineWidth || _lineWidth,
      )
    }
  }

  createOffsetTextDrawer(offsetX: number, offsetY: number, _option: CanvasDrawerTextOption = {}) {
    return (
      text: string,
      x: number,
      y: number,
      option?: CanvasDrawerTextOption,
    ) => {
      return this.drawText(
        text,
        offsetX + x,
        offsetY + y,
        {
          ..._option,
          ...option,
        },
      )
    }
  }

  drawLine(...args: DrawLineParameters) {
    this.task.push([CanvasDrawerDrawType.LINE, ...args])
    return this
  }

  private _drawStrokeRect(x: number, y: number, width: number, height: number, stroke: string, lineWidth = 2, radius = 0) {
    const ctx = this.ctx

    ctx.strokeStyle = stroke

    ctx.lineWidth = lineWidth

    // 如果有圆角半径，使用 arcTo 绘制圆角矩形
    if (radius > 0) {
      const xEnd = x + width
      const yEnd = y + height
      ctx.beginPath()
      ctx.moveTo(x + radius, y)
      ctx.arcTo(xEnd, y, xEnd, yEnd, radius)
      ctx.arcTo(xEnd, yEnd, x, yEnd, radius)
      ctx.arcTo(x, yEnd, x, y, radius)
      ctx.arcTo(x, y, xEnd, y, radius)
      ctx.closePath()
      ctx.stroke()
    }
    else {
    // 否则，绘制普通矩形边框
      ctx.strokeRect(x, y, width, height)
    }
    // 将绘制的内容显示在Canvas上
    return this
  }

  private offsetX = 0
  private offsetY = 0

  set offset([x, y]: [number, number]) {
    this.offsetX = x
    this.offsetY = y
  }

  get offset(): [number, number] {
    return [this.offsetX, this.offsetY]
  }

  drawStrokeRect(...args: DrawStrokeRectParameters) {
    this.task.push([CanvasDrawerDrawType.STROKE_RECT, ...args])
    return this
  }

  private _drawFillRect(x: number, y: number, width: number, height: number, fillStyle: string, radius = 0) {
    const ctx = this.ctx
    const min = Math.min(width, height) / 2
    radius = radius >= min ? min : radius <= 0 ? 0 : radius

    ctx.beginPath()
    ctx.fillStyle = fillStyle

    ctx.moveTo(x + radius, y)
    ctx.arcTo(x + width, y, x + width, y + height, radius)
    ctx.arcTo(x + width, y + height, x, y + height, radius)
    ctx.arcTo(x, y + height, x, y, radius)
    ctx.arcTo(x, y, x + width, y, radius)
    ctx.closePath()
    ctx.fill()
    return this
  }

  /**
   * @description 实心矩形
   * @param args
   */
  drawFillRect(...args: DrawFillRectParameters) {
    this.task.push([CanvasDrawerDrawType.FILL_RECT, ...args])
    return this
  }

  getMultilineTextHeight(text: string, fontSize: number, maxWidth: number, lineHeight: number) {
    const canvas = uni.createOffscreenCanvas({ type: '2d', width: 1000, height: 1000 }) as Canvas
    const ctx = canvas.getContext('2d')
    ctx.font = `${fontSize}px AlibabaPuHuiTi-Regular`
    const allAtr = text.split('')
    const splitText: string[] = [] // 拆分出来的每一行
    let multilineText: string[] = [] // 每一行的文字数组
    for (let i = 0; i < allAtr.length; i++) {
      const currentStr = allAtr[i]
      multilineText.push(currentStr)
      const rowStr = multilineText.join('')
      if (ctx.measureText(rowStr).width > maxWidth) {
        multilineText.pop() // 删除最后一个
        splitText.push(multilineText.join('')) // 完成一行
        multilineText = [currentStr]
        continue
      }
      if (i === allAtr.length - 1) {
        splitText.push(rowStr)
      }
    }
    return {
      height: splitText.length * lineHeight - (lineHeight - fontSize),
      rows: splitText.length,
    }
  }

  /**
   * @description 绘制多行文本
   * @param text
   * @param x
   * @param y
   * @param lineHeight
   * @param maxWidth
   * @param option
   */
  private drawMultilineText(text: string, x: number, y: number, lineHeight: number, maxWidth: number, option?: CanvasDrawerTextOption) {
    const ctx = this.ctx

    const allAtr = text.split('')
    const splitText = [] // 拆分出来的每一行
    let multilineText: string[] = [] // 每一行的文字数组
    for (let i = 0; i < allAtr.length; i++) {
      const currentStr = allAtr[i]
      multilineText.push(currentStr)
      const rowStr = multilineText.join('')
      if (ctx.measureText(rowStr).width > maxWidth) {
        multilineText.pop() // 删除最后一个
        splitText.push(multilineText.join('')) // 完成一行
        multilineText = [currentStr]
        continue
      }
      // 最后一个字母 直接添加到一行
      if (i === allAtr.length - 1) {
        splitText.push(rowStr) // 完成一行
      }
    }

    option?.color && (ctx.fillStyle = option.color)
    option?.fontSize && (ctx.font = `${option?.fontSize}px`)

    for (let i = 0; i < splitText.length; i++) {
      ctx.fillText(splitText[i], x, y + i * lineHeight)
    }
    return splitText.length
  }

  /**
   * @description 绘制圆形
   * @param x
   * @param y
   * @param radius - 半径
   * @param options
   */
  private _drawCircle(x: number, y: number, radius: number, options?: {
    fill?: string
    stroke?: string
    lineWidth?: number
  }) {
    console.log('_drawCircle', x, y, radius, options)

    this.ctx.beginPath() // 创建一个路径
    this.ctx.arc(x, y, radius, 0, 2 * Math.PI, false) // 创建一个园
    this.ctx.fillStyle = options?.fill || 'transparent' // 填充颜色
    this.ctx.fill() // 填充
    this.ctx.lineWidth = options?.lineWidth || 2 // 边框宽度
    this.ctx.strokeStyle = options?.stroke || 'black' // 边框颜色
    this.ctx.stroke() // 绘制边框
    this.ctx.closePath() // 关闭路径
  }

  /**
   * @description 绘制圆形
   * @param x 圆心x坐标
   * @param y 圆心y坐标
   * @param radius - 园半径
   * @param options
   * @param options.fill 填充颜色
   * @param options.stroke 边框颜色
   * @param options.lineWidth 边框宽度
   */
  drawCircle(...args: DrawArcParameters) {
    console.log('drawCircle添加到任务队列')

    this.task.push([CanvasDrawerDrawType.CIRCLE, ...args])
    return this
  }

  renderLayer<T extends object = object>(layer: Layer<T>) {
    const _ox = Number(layer.offset?.[0] || 0)
    const _oy = Number(layer.offset?.[1] || 0)
    const ox = Number.isNaN(_ox) ? 0 : _ox
    const oy = Number.isNaN(_oy) ? 0 : _oy
    layer.position = [layer.position[0] + ox, layer.position[1] + oy]
    const config = layer.config
    if (layer.type === 'image') {
      this.drawImage(addPrefixUrl((config as unknown as { url: string }).url)!, ...layer.position, ...layer.size, config.radius || 0)
    }
    else if (layer.type === 'text') {
      this.drawText(`${config.text}`, ...layer.position, {
        ...config.textStyle,
        verticalCenter: false,
      })
    }
    else if (layer.type === 'fill-rect') {
      this.drawFillRect(...layer.position, ...layer.size, `${config.fill}`, config.radius || 0)
    }
    else if (layer.type === 'stroke-rect') {
      this.drawStrokeRect(...layer.position, ...layer.size, `${config.stroke}`, config.lineWidth || 2)
    }
    else if (layer.type === 'custom') {
      console.warn('不支持的 type custom')
    }
  }

  /**
   * 循环task 完成绘制
   * @param cb
   */
  async done(cb?: (tempFilePath: string,) => void | any) {
    let taskIndex = 0
    let taskParameters: CanvasDrawerDrawTypes
    return new Promise<string>((resolve, reject) => {
      nextTick(async () => {
        try {
          console.log('done-this.task', this.task)

          for (let index = 0; index < this.task.length; index++) {
            const [type, ...args] = this.task[index]
            if (__DEV__) {
              taskIndex = index
              taskParameters = this.task[index]
            }
            console.log(type, index, 'for循环')

            switch (type) {
              case 'image':
                await this._drawImage(...args as DrawImageParameters)
                break
              case 'canvas':
                await this._drawCanvas(...args as DrawCanvasParameters)
                break
              case 'stroke-rect':
                this._drawStrokeRect(...args as DrawStrokeRectParameters)
                break
              case 'fill-rect':
                this._drawFillRect(...args as DrawFillRectParameters)
                break
              case 'circle':
                this._drawCircle(...args as DrawArcParameters)
                break
              case 'line':
                this._drawLine(...args as DrawLineParameters)
                break
              case 'text':
                this._drawText(...args as DrawTextParameters)
                break
            }
          }
          this.task = []
          console.log('done-sleep-top')

          await sleep(200)
          console.log('done-sleep-bottom')
          // toDataURL 返回方法一个包含图片表示的数据URI，该图片的格式由type参数指定
          const base64 = this.ctx.canvas.toDataURL('image/png', 1)
          console.log('done-base64', base64)
          const base64Result = base64ToUrl(base64)
          console.log('done-base64Result', base64Result)
          cb?.(base64Result)
          resolve(base64Result)
        }
        catch (e: any) {
          const err = e?.reason || e?.errMsg || e?.msg || e?.message || ''
          console.log(err)
          if (__DEV__) {
            console.log('taskIndex ', taskIndex)
            console.log('taskParameters ', taskParameters)
          }
          showToast(err)
          reject(e)
        }
        finally {
          // this.imageCache = {};
        }
      })
    })
  }
}
