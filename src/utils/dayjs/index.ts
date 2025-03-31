import dayjs from 'dayjs'

/**
 * @description 格式化时间
 * @param time
 * @param type 默认值 YYYY-MM-DD
 */
export function formatTime(time: string, type: string = 'YYYY-MM-DD') {
  return dayjs(time).format(type)
}
