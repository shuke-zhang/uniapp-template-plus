export class AsyncExecutionManager {
  private executingPromises: { [key: string]: Promise<any> | undefined } = {};

  async executeAsyncFunction<T>(key: string, func: () => Promise<T>): Promise<T> {
    if (this.executingPromises[key]) {
      // 如果有相同参数的函数正在执行，直接返回正在执行的 Promise
      return this.executingPromises[key] as Promise<T>;
    }
    else {
      // 如果没有相同参数的函数正在执行，执行新的函数
      const promise = func();
      this.executingPromises[key] = promise;

      try {
        return await promise;
      }
      finally {
        // 异步函数执行完成后，从字典中移除对应的 Promise
        delete this.executingPromises[key];
      }
    }
  }
}