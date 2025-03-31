/**
 * @description 是否校验错误
 */
export class ValidateError extends Error {
  status: number;

  constructor(message: string) {
    super(message);
    this.name = 'ValidateError';
    Object.setPrototypeOf(this, ValidateError.prototype);
    this.status = 0;
  }

  /**
   *  判断一个错误是否是校验错误
   * @param e
   */
  static isValidateError(e: any): e is ValidateError {
    return e instanceof ValidateError;
  }
}
