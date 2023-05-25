import {Stream} from "./Stream";

export class OutWindow {
  _buffer: Uint8Array;
  _pos: number = 0;
  _windowSize: number = 0;
  _streamPos: number = 0;
  _stream: Stream | null = null

  TrainSize: number = 0;


  Create: (windowSize: number) => void = (windowSize: number) => {
    if (this._windowSize !== windowSize) {
      this._buffer = new Uint8Array(windowSize);
    }
    this._windowSize = windowSize;
    this._pos = 0;
    this._streamPos = 0;
  }

  Init: (stream: Stream, solid: boolean) => void = (stream: Stream, solid: boolean) => {
    this.ReleaseStream()
    this._stream = stream;
    if (!solid) {
      this._streamPos = 0;
      this._pos = 0;
      this.TrainSize = 0;
    }
  }

  ReleaseStream: () => void = () => {
    this.Flush();
    this._stream = null;
  }

  Train: (stream: Stream) => boolean = (stream: Stream) => {
    const len = stream.Length;
    let size = (len < this._windowSize) ? len : this._windowSize;
    this.TrainSize = size;
    stream.Position = len - size;
    this._streamPos = 0;
    this._pos = 0;
    while (size > 0) {
      let curSize = this._windowSize - this._pos;
      if (size < curSize) {
        curSize = size;
      }
      const numBytes = stream.Read3(this._buffer, this._pos, curSize);
      if (numBytes === 0) {
        return false;
      }
      size -= numBytes;
      this._pos += numBytes;
      this._streamPos += numBytes;
      if (this._pos === this._windowSize) {
        this._pos = 0;
      }
    }
    return true;
  }


  Flush: () => void = () => {
    const size = this._pos - this._streamPos;
    if (size !== 0) {
      this._stream?.White3(this._buffer, this._streamPos, size);
      if (this._pos >= this._windowSize) {
        this._pos = 0;
      }
      this._streamPos = this._pos;
    }
  }

  CopyBlock: (distance: number, len: number) => void = (distance: number, len: number) => {
    let pos = (this._pos - distance - 1) >>> 0;
    if (pos >= this._windowSize) {
      pos = (pos + this._windowSize) >>> 0;
    }
    for (; len !== 0; len--) {
      if (pos >= this._windowSize) {
        pos = 0;
      }
      this._buffer[this._pos++] = this._buffer[pos++];
      if (this._pos >= this._windowSize) {
        this.Flush();
      }
    }
  }

  PutByte: (b: number) => void = (b: number) => {
    this._buffer[this._pos++] = b;
    if (this._pos >= this._windowSize) {
      this.Flush();
    }
  }

  GetByte: (distance: number) => number = (distance: number) => {
    let pos = (this._pos - distance - 1) >>> 0;
    if(pos >= this._windowSize) {
      pos = (pos + this._windowSize) >>> 0;
    }
    return this._buffer[pos];
  }

}