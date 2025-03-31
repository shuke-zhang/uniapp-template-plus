// 通用工具函数
function getAppStoragePath() {
  // APP端使用plus.io获取存储路径
  if (isApp) {
    return `${plus.io.convertLocalFileSystemURL('_doc/')}/`
  }

  // 小程序端保持原有逻辑
  return `${wx.env.USER_DATA_PATH}/`
}

export function clearCacheFiles() {
  const fs = uni.getFileSystemManager()
  // const basepath = `${wx.env.USER_DATA_PATH}`
  const basepath = getAppStoragePath()
  return new Promise((resolve, reject) => {
    fs.readdir({
      dirPath: basepath, ///
      success: (res) => {
        res.files.map((val) => {
          return fs.unlink({
            filePath: `${basepath}/${val}`,
            success() {
              // console.log(a);
            },
          })
        })
      },
    })

    fs.getSavedFileList({ // 获取文件列表
      success(res) {
        Promise.all(
          res.fileList.map((val) => {
            return uni.removeSavedFile({
              filePath: val.filePath,
            })
          }),
        ).then(() => {
          resolve('')
        })
      },
      fail(err) {
        reject(err)
      },
    })
  })
}

export function base64ToUrl(base64?: string, type = 'png'): string {
  if (!base64)
    return ''
  const httpOrHttps = /^(?:http|https):\/\//
  if (httpOrHttps.test(base64))
    return base64
  const fs = uni.getFileSystemManager()
  base64 = base64.replace(`data:image/${type};base64,`, '')
  //  删除base64字符串的回车符和换行符
  base64 = base64.replace(/[\r\n]/g, '')
  try {
    // const url = `${wx.env.USER_DATA_PATH}/_temp_${createUUID()}.png`
    const url = `${getAppStoragePath()}/_temp_${createUUID()}.png`

    fs.writeFileSync(url, base64, 'base64')
    return url
  }
  catch (error) {
    console.log(error)
    console.log('base64ToUrl error', error)
    throw error
  }
}
