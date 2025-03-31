import fs from 'node:fs'
import path from 'node:path'
import * as sass from 'sass'

/**
 * 解析 SCSS 变量
 */
function parseScssVariables(scssFilePath: string) {
  const scssContent = fs.readFileSync(scssFilePath, 'utf-8')

  if (!scssContent.trim()) {
    throw new Error('SCSS 文件为空，请检查 src/uni.scss 是否存在且包含变量。')
  }

  // 创建一个 SCSS 代码块，将变量插入到 :root 伪类中
  const parsedScss = `
  ${scssContent}

  :root {
    ${scssContent
      .split('\n')
      .filter(line => line.includes('$'))
      .map((line) => {
        // 关键修改：允许匹配带短横线的变量名
        // eslint-disable-next-line regexp/no-super-linear-backtracking
        const match = line.match(/\$([\w-]+):\s*(.*?);/)
        if (match) {
          return `--${match[1].replace(/_/g, '-')}: #{${match[2]}};` // 强制转换下划线为短横线
        }
        return ''
      })
      .join('\n')}
  }
`

  // 编译 SCSS 代码
  const result = sass.compileString(parsedScss)

  // 正则提取 CSS 变量
  const cssVariables = result.css.match(/--(.*?): (.*?);/g) || []

  const parsedVariables: Record<string, string> = {}
  cssVariables.forEach((line) => {
    const match = line.match(/--(.*?): (.*?);/)
    if (match) {
      parsedVariables[match[1]] = match[2].trim()
    }
  })

  return parsedVariables
}

// 读取 src/uni.scss 的路径
const scssFilePath = path.resolve(__dirname, '../../src/uni.scss') // 确保路径正确
// 检查文件是否存在
if (!fs.existsSync(scssFilePath)) {
  throw new Error(`找不到文件: ${scssFilePath}`)
}
const scssVariables = parseScssVariables(scssFilePath)

export default scssVariables
