import { Transform, TransformCallback } from 'stream';
import { AppError } from '../middleware/error.middleware.js';

export class ByteLimitTransform extends Transform {
  private maxBytes: number;
  private bytesCounted = 0;

  constructor(maxBytes: number) {
    super();
    this.maxBytes = maxBytes;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.bytesCounted += chunk.length;

    if (this.bytesCounted > this.maxBytes) {
      const error = new AppError(
        `File size limit exceeded. Maximum allowed is ${this.maxBytes} bytes.`,
        413
      );
      this.destroy(error);
      return callback(error);
    }

    this.push(chunk);
    callback();
  }

  public getBytesCounted(): number {
    return this.bytesCounted;
  }
}
