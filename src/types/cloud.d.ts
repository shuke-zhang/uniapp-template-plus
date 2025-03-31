declare namespace CloudAppNamespace {
  /**
   * promise 风格的对象参数 去除 option 中回调函数部分
   */
  type PromisifyParameters<T> = Omit<T, 'success' | 'fail' | 'complete'>
}
