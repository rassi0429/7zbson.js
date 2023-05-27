import {Stream} from "./Stream";

export class InWindow {
  _bufferBase: Uint8Array = new Uint8Array(0);
  _stream : Stream;
  _posLimit : number;
  _streamEndWasReached : boolean;

  _pointerToLastSafePosition : number;

  _bufferOffset : number;

  _blockSize : number;
  _pos : number;
  _keepSizeBefore : number;
  _keepSizeAfter : number;
  _streamPos : number;

  MoveBlock : () => void = () => {
    let offset = (this._bufferOffset + this._pos - this._keepSizeBefore) >>> 0;
    // we need one additional byte, since MovePos moves on 1 byte.
    if (offset > 0) {
      offset--;
    }

    const numBytes = this._bufferOffset + this._streamPos - offset;

    // check negative offset ????
    for (let i = 0; i < numBytes; i++) {
      this._bufferBase[i] = this._bufferBase[offset + i];
    }

    this._bufferOffset -= offset;
  }

  ReadBlock : () => void = () => {
    if (this._streamEndWasReached) {
      return;
    }
    while (true) {
      const size = (0 - this._bufferOffset) + this._blockSize - this._streamPos
      if (size === 0) {
        return;
      }

      const numReadBytes = this._stream.Read3(this._bufferBase, this._bufferOffset + this._streamPos, size);
      if (numReadBytes === 0) {
        this._posLimit = this._streamPos;
        const pointerToPostion = this._bufferOffset + this._posLimit;
        if (pointerToPostion > this._pointerToLastSafePosition) {
          this._posLimit = this._pointerToLastSafePosition - this._bufferOffset;
        }

        this._streamEndWasReached = true;
        return;
      }
      this._streamPos += numReadBytes;
      if (this._streamPos >= this._pos + this._keepSizeAfter) {
        this._posLimit = this._streamPos - this._keepSizeAfter;
      }
    }
  }

  Free : () => void = () => {
    this._bufferBase = new Uint8Array(0);
  }

  Create : (keepSizeBefore: number, keepSizeAfter: number, keepSizeReserv: number) => void = (keepSizeBefore: number, keepSizeAfter: number, keepSizeReserv: number) => {
    this._keepSizeBefore = keepSizeBefore;
    this._keepSizeAfter = keepSizeAfter;
    const blockSize = keepSizeBefore + keepSizeAfter + keepSizeReserv;
    if (this._bufferBase.length !== blockSize) {
      this.Free();
      this._bufferBase = new Uint8Array(blockSize);
      this._blockSize = blockSize;
    }
    this._pointerToLastSafePosition = blockSize - keepSizeAfter;
  }

  SetStreamP : (stream: Stream) => void = (stream: Stream) => {
    this._stream = stream;
  }

  ReleaseStreamP : () => void = () => {
    this._stream = new Stream(new Uint8Array(0));
  }

  InitP: () => void = () => {
    this._bufferOffset = 0;
    this._pos = 0;
    this._streamPos = 0;
    this._streamEndWasReached = false;
    this.ReadBlock();
  }

  MovePosP : () => void = () => {
    this._pos++;
    if (this._pos > this._posLimit) {
      const pointerToPostion = this._bufferOffset + this._pos;
      if (pointerToPostion > this._pointerToLastSafePosition) {
        this.MoveBlock();
      }
      this.ReadBlock();
    }
  }

  GetIndexByte : (index: number) => number = (index: number) => {
    return this._bufferBase[this._bufferOffset + this._pos + index];
  }

  GetMatchLen : (index: number, distance: number, limit: number) => number = (index: number, distance: number, limit: number) => {
    if (this._streamEndWasReached) {
      if (this._pos + index + limit > this._streamPos) {
        limit = this._streamPos - (this._pos + index);
      }
    }
    distance++;
    // Byte *pby = _buffer + (size_t)_pos + index;
    let pby = this._bufferOffset + this._pos + index;

    let i = 0;
    for (i = 0; i < limit && this._bufferBase[pby + i] === this._bufferBase[pby + i - distance]; i++) {
    }
    return i;
  }

  GetNumAvailableBytes : () => number = () => {
    return (this._streamPos - this._pos) >>> 0;
  }

  ReduceOffsets : (subValue: number) => void = (subValue: number) => {
    this._bufferOffset += subValue;
    this._posLimit -= subValue;
    this._pos -= subValue;
    this._streamPos -= subValue;
  }
}