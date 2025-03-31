export function cropImage(options: CloudAppNamespace.PromisifyParameters<UniApp.CropImageOption>) {
  return new Promise<string>((resolve) => {
    uni.cropImage({
      ...options,
      success(res) {
        resolve(res.tempFilePath);
      },
      fail() {
        console.log('取消裁剪');
        resolve(options.src);
      },
    });
  });
}