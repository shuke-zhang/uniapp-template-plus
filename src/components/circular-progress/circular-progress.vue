<script setup lang="ts">
import type { Canvas } from '@uni-helper/uni-app-types'
import { getCurrentInstance, onMounted, watch } from 'vue'

const props = defineProps({
  /**
   * @description 当前进度值（0~100）
   * @type {number}
   * @default 75
   */
  value: { type: Number, default: 75 },

  /**
   * @description 中间文字
   * @type {string}
   * @default 75
   */
  text: { type: String, default: '75' },

  /**
   * @description 圆环直径（单位 px）
   * @type {number}
   * @default 240
   */
  size: { type: Number, default: 240 },

  /**
   * @description 进度条宽度（单位 px）
   * @type {number}
   * @default 16
   */
  strokeWidth: { type: Number, default: 16 },

  /**
   * @description 圆环中下方副标题文字
   * @type {string}
   * @default ''
   */
  subText: { type: String, default: '' },

  /**
   * @description 主文字颜色（中心进度值）
   * @type {string}
   * @default '#333'
   */
  textColor: { type: String, default: '#333' },

  /**
   * @description 副标题文字颜色
   * @type {string}
   * @default '#8fc978'
   */
  subTextColor: { type: String, default: '#8fc978' },

  /**
   * @description 缺口位置（圆环空缺在哪一侧）
   * @type {'top' | 'right' | 'bottom' | 'left'}
   * @default 'bottom'
   */
  gapPosition: {
    type: String,
    default: 'bottom',
    validator: (val: string) => ['top', 'right', 'bottom', 'left'].includes(val),
  },

  /**
   * @description 是否顺时针绘制
   * @type {boolean}
   * @default true
   */
  clockwise: { type: Boolean, default: true },

  /**
   * @description 进度绘制角度（最大角度，单位为度）
   * @type {number}
   * @default 270
   */
  progressAngle: { type: Number, default: 270 },

  /**
   * @description 是否自定义最小值、最大值
   * @type {boolean}
   * @default 270
   * @warn 当为true时，传入的 minNum 和 maxNum 会被忽略.最小值为0%，最大值为100%
   * 当为false时则以传入的 minNum 和 maxNum 为准
   */
  isCustomNum: {
    type: Boolean,
    default: false,
  },
  /**
   * @description 最小值文字（显示在进度条左下方）
   * @type {number}
   * @default '0'
   */
  minNum: {
    type: Number,
    default: 0,
  },

  /**
   * @description 最大值文字（显示在进度条右下方）
   * @type {number}
   * @default '100'
   */
  maxNum: {
    type: Number,
    default: 100,
  },

  /**
   * @description 是否显示进度条左下方和右下方
   * @type {'all' | 'left' | 'right' | 'none'}
   * @default 'all'
   */
  showCornerText: {
    type: String as PropType<'all' | 'left' | 'right' | 'none'>,
    default: 'all',
  },
  /**
   * @description 渐变进度条颜色
   * @type {{ percent: number; color: string; }[]}
   * @default
   * [
      { percent: 0.0, color: '#8fc978' }, // 绿色
      { percent: 0.20, color: '#b5d94a' },
      { percent: 0.5, color: '#f8e71c' }, // 黄色
      { percent: 0.85, color: '#f8961c' },
      { percent: 1.0, color: '#f75c18' }, // 红色
    ]
   */
  gradientColors: {
    type: Array as PropType<{ percent: number, color: string }[]>,
    default: () => [
      { percent: 0.0, color: '#8fc978' }, // 绿色
      { percent: 0.15, color: '#b5d94a' },
      { percent: 0.5, color: '#f8e71c' }, // 黄色
      { percent: 0.85, color: '#f8961c' },
      { percent: 1.0, color: '#f75c18' }, // 红色
    ],
  },
})

const currentPage = getCurrentInstance()
const canvasId = `canvas-${Math.random().toString(36).slice(2)}`
onMounted(draw)
watch(() => props.value, draw)

function getGapMidAngle(): number {
  switch (props.gapPosition) {
    case 'top': return Math.PI / 2
    case 'right': return 0
    case 'bottom': return -Math.PI / 2
    case 'left': return Math.PI
    default: return Math.PI / 2
  }
}
function draw() {
  const ctx = isWeixin ? uni.createOffscreenCanvas({ type: '2d', width: props.size, height: props.size }) as unknown as Canvas : uni.createCanvasContext(canvasId, currentPage)
  const center = props.size / 2
  const radius = center - props.strokeWidth
  // const range = props.maxNum - props.minNum
  // const percent = Math.min(Math.max((props.value - props.minNum) / range, 0), 1)
  let percent = 0
  if (props.isCustomNum) {
    percent = Math.min(Math.max(props.value / 100, 0), 1) // 以百分比为准
  }
  else {
    const range = props.maxNum - props.minNum
    percent = Math.min(Math.max((props.value - props.minNum) / range, 0), 1)
  }
  const gapMidAngle = getGapMidAngle()
  const maxAngle = (props.progressAngle * Math.PI) / 180
  const startBgAngle = gapMidAngle - maxAngle / 2
  const endBgAngle = gapMidAngle + maxAngle / 2

  const progressLength = maxAngle * percent
  const endProgressAngle = props.clockwise
    ? Math.min(startBgAngle + progressLength, endBgAngle)
    : Math.max(startBgAngle - progressLength, endBgAngle - maxAngle)

  ctx.clearRect(0, 0, props.size, props.size)

  // 背景轨道
  ctx.beginPath()
  ctx.arc(center, center, radius, startBgAngle, endBgAngle, false)
  ctx.setLineWidth(props.strokeWidth)
  ctx.setLineCap('round')
  ctx.setStrokeStyle('#ffffff')
  ctx.stroke()
  ctx.closePath()

  // 渐变色进度条
  drawSmoothArcGradient(ctx, center, radius, startBgAngle, maxAngle, percent, props.strokeWidth)

  // 进度条终点小圆点
  const dotX = center + radius * Math.cos(endProgressAngle)
  const dotY = center + radius * Math.sin(endProgressAngle)
  ctx.beginPath()
  ctx.arc(dotX, dotY, 6, 0, Math.PI * 2)
  ctx.setFillStyle('#fff')
  ctx.fill()
  ctx.setLineWidth(2)
  ctx.setStrokeStyle('#999')
  ctx.stroke()
  ctx.closePath()

  // ====== 最终完美方案：手动摆放两端文字 ======
  const textY = center + radius * Math.sin(Math.PI / 4) + 14 // 稍微靠下
  const textXOffset = radius * Math.cos(Math.PI / 4) - 14 // 控制水平偏移

  ctx.setFontSize(14)
  ctx.setFillStyle(props.textColor)
  ctx.setTextAlign('center')
  ctx.setTextBaseline('middle')
  switch (props.showCornerText) {
    case 'left':
      ctx.fillText(`${props.isCustomNum ? '0%' : props.minNum}`, center - textXOffset, textY)
      break
    case 'right':
      ctx.fillText(`${props.isCustomNum ? '100%' : props.maxNum}`, center + textXOffset, textY)
      break
    case 'all':
      ctx.fillText(`${props.isCustomNum ? '0%' : props.minNum}`, center - textXOffset, textY)
      ctx.fillText(`${props.isCustomNum ? '100%' : props.maxNum}`, center + textXOffset, textY)
      break
    case 'none':
    default:
    // 不显示
      break
  }

  // 中间大字
  ctx.setFontSize(40)
  ctx.setFillStyle(props.textColor)
  ctx.fillText(`${props.text}`, center, center)

  // 副标题
  ctx.setFontSize(16)
  ctx.setFillStyle(props.subTextColor)
  ctx.fillText(props.subText, center, center + 40)

  ctx.draw()
}

function lerpColor(color1: string, color2: string, t: number): string {
  const c1 = Number.parseInt(color1.slice(1), 16)
  const c2 = Number.parseInt(color2.slice(1), 16)

  const r1 = (c1 >> 16) & 0xFF; const g1 = (c1 >> 8) & 0xFF; const b1 = c1 & 0xFF
  const r2 = (c2 >> 16) & 0xFF; const g2 = (c2 >> 8) & 0xFF; const b2 = c2 & 0xFF

  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)

  return `rgb(${r},${g},${b})`
}

function getInterpolatedColor(stops: { percent: number, color: string }[], t: number): string {
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1]
    const curr = stops[i]
    if (t <= curr.percent) {
      const localT = (t - prev.percent) / (curr.percent - prev.percent)
      return lerpColor(prev.color, curr.color, localT)
    }
  }
  return stops[stops.length - 1].color
}

function drawSmoothArcGradient(
  ctx: any,
  center: number,
  radius: number,
  startAngle: number,
  maxAngle: number,
  percent: number, // 0~1
  strokeWidth: number,
) {
  const colorStops = props.gradientColors

  const steps = 100 // 越大越平滑
  for (let i = 0; i < steps; i++) {
    const startT = i / steps
    const endT = (i + 1) / steps
    if (startT > percent)
      break

    const realEndT = Math.min(endT, percent)

    const segStartAngle = startAngle + maxAngle * startT
    const segEndAngle = startAngle + maxAngle * realEndT
    const color = getInterpolatedColor(colorStops, startT)

    ctx.beginPath()
    ctx.arc(center, center, radius, segStartAngle, segEndAngle, false)
    ctx.setLineWidth(strokeWidth)
    ctx.setLineCap(i === 0 ? 'round' : 'butt') // 避免圆头颜色堆叠
    ctx.setStrokeStyle(color)
    ctx.stroke()
    ctx.closePath()
  }
}
</script>

<template>
  <canvas
    :canvas-id="canvasId"
    class="circle-canvas"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<style scoped>
.circle-canvas {
  display: block;
}
</style>
