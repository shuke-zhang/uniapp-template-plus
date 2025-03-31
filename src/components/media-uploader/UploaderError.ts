import type { MediaUploaderTask } from './types';

export class UploaderError extends Error {
  /**
   * 1 大文件 0 传输错误
   */
  status: 0 | 1 = 0;
  name = 'UploaderError';
  errorTask?: MediaUploaderTask;
  constructor(options: { message?: string; status?: 0 | 1; errorTask?: MediaUploaderTask }) {
    super(options.message);
    if (options.errorTask)
      this.errorTask = options.errorTask;
    Object.setPrototypeOf(this, UploaderError.prototype);
    this.status = options.status == undefined ? 1 : 0;
  }

  static isUploaderError(e: any): e is UploaderError {
    return e instanceof UploaderError;
  }
}