type _CompressVideoOptions = Omit<
  UniNamespace.CompressVideoOptions,
  'width' | 'height' | 'compressHeight' | 'success' | 'fail' | 'complete'
>;

interface CompressVideoSuccessData {
  /**
   * 压缩后的临时文件地址
   */
  tempFilePath: string;
  /**
   * 压缩后的大小，单位 B
   */
  size: number;
}

interface CompressVideoOptions extends _CompressVideoOptions {
  native?: boolean;
}

export type isNativeCompressVideoOptions = CompressVideoOptions & { native: true };

/**
 * 压缩图片 支持 <br>
 * 按照比例压缩 rate <br>
 * 支持返回base64 <br>
 * @param options
 */
export function compressVideo(options: isNativeCompressVideoOptions): Promise<CompressVideoSuccessData>;
export function compressVideo(options: CompressVideoOptions): Promise<string>;
export function compressVideo(options: CompressVideoOptions) {
  console.log('compressVideo options', { ...options });
  // if (__DEV__) {
  //   console.log('[compressVideo start]', options.src);
  // }
  // uni.getVideoInfo({
  //   src: options.src,
  //   success(res) {
  //     console.log('getVideoInfo', res);
  //   },
  // });

  // return uni.getVideoInfo({
  //   src: options.src,
  // }).then((res) => {
  //   if (__DEV__) {
  //     console.log('[compressVideo before]', formatFileSize(res.size * 1024));
  //   }
  //   return Promise.all([
  //     uni.compressVideo({
  //       ...options,
  //     }),
  //     res.duration,
  //   ]);
  // }).then(([res, duration]) => {
  //   if (__DEV__) {
  //     console.log('[compressVideo after]', formatFileSize(Number(res.size) * 1024));
  //   }
  //   return [res.tempFilePath, duration] as const;
  // });
  // console.log('canIUse', uni.canIUse('compressVideo'));
  return new Promise<string | CompressVideoSuccessData>((resolve, reject) => {
    try {
      const _options = {
        ...options,
        native: undefined,
      };
      uni.compressVideo({
        ..._options,
      }).then((res) => {
        if (options.native) {
          console.log('native', res);
          resolve({
            ...res,
            size: Number(res.size) * 1024,
          });
        }
        else {
          resolve(res.tempFilePath);
        }
      }).catch((e) => {
        console.log('视频压缩失败:');
        console.log(e);
        if (e.errMsg === 'compressVideo:fail:is compressing now') {
          resolve(options.src);
        }
        else {
          reject(e);
        }
      });
    }
    catch (error) {
      console.log('catch', error);
      reject(error);
    }
  });
}

