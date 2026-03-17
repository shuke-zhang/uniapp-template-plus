/**
 * 服务端消息解析辅助函数。
 *
 * 接收循环里会反复处理不同事件返回的 payload。
 * 把这些“如何从 payload 中提取业务字段”的逻辑集中到这里，
 * 可以避免会话代码里充满零散的结构判断。
 */

/**
 * 从对话 payload 中提取文本内容。
 *
 * 后端不同阶段返回的字段名并不完全一致，有的用 `content`，
 * 有的用 `reply` 或 `text`。这里统一做兼容，调用方只关心最终文本结果。
 */
export function resolveDialogPayloadText(payload: unknown): string {
  if (!payload || typeof payload !== 'object')
    return ''

  const record = payload as Record<string, unknown>
  const value = record.content ?? record.reply ?? record.text
  return value ? String(value) : ''
}
