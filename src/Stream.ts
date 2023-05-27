
// implements C# Stream class
export class Stream {
  private _buffer: Uint8Array;
  private _position: number = 0;

  constructor(array: Uint8Array) {
    this._buffer = array;
  }

  get Position(): number {
    return this._position;
  }

  set Position(value: number) {
    this._position = value;
  }

  get Length(): number {
    return this._buffer.length;
  }

  ReadByte(): number {
    return this._buffer[this._position++];
  }
  Read(): number {
    return this._buffer[this._position++];
  }
  Read3(buffer: Uint8Array, offset: number, count: number): number {
    const actualCount = Math.min(count, this._buffer.length - this._position);
    for (let i = 0; i < actualCount; i++) {
      buffer[offset + i] = this._buffer[this._position++];
    }
    return actualCount;
  }

  White3(buffer: Uint8Array, offset: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this._buffer[this._position++] = buffer[offset + i];
    }
  }

  ToArray(): Uint8Array {
    return this._buffer;
  }

  Write(buffer: Uint8Array, offset: number, count: number): void {
    for (let i = 0; i < count; i++) {
      this._buffer[this._position++] = buffer[offset + i];
    }
  }

  WriteByte(value: number): void {
    this._buffer[this._position++] = value;
  }

  WriteLongLong(value: number): void {
    this._buffer[this._position++] = value & 0xff;
    this._buffer[this._position++] = (value >>> 8) & 0xff;
    this._buffer[this._position++] = (value >>> 16) & 0xff;
    this._buffer[this._position++] = (value >>> 24) & 0xff;
    this._buffer[this._position++] = 0x0;
    this._buffer[this._position++] = 0x0;
    this._buffer[this._position++] = 0x0;
    this._buffer[this._position++] = 0x0;
  }

  Flush(): void {
    // Do nothing
    // tabun iranai
  }
}