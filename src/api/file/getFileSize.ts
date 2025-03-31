/**
 * 获取文件大小 Promise 风格  单位 B
 * fileManager.getFileInfo 不支持 Promise 故
 * @param options
 */
export function getFileSize(options: CloudAppNamespace.PromisifyParameters<UniNamespace.GetFileInfoOption>): Promise<number> {
  const fileManager = uni.getFileSystemManager()
  return new Promise((resolve, reject) => {
    // if (__DEV__) {
    // uni.getImageInfo;
    fileManager.getFileInfo({
      ...options,
      success(res) {
        resolve(res.size)
      },
      fail(e) {
        reject(e)
      },
    })
    // }
  })
}
