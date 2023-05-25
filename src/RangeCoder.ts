import { Stream } from "./Stream";

export class Decoder {

  static kTopValue: number = (1 << 24);
  Range: number = 0;
  Code: number = 0;

  Stream: Stream = new Stream(new Uint8Array(0));

  // ここで5bit進んでるからReaderを作るべきかも？
  Init: (stream: Stream) => void = (stream: Stream) => {
    this.Stream = stream;
    this.Code = 0;
    this.Range = 0xFFFFFFFF;
    for (let i = 0; i < 5; i++) {
      this.Code = ((this.Code << 8 >>> 0) | this.Stream.Read()) >>> 0;
    }
  }

  ReleaseStream: () => void = () => {
    this.Stream = new Stream(new Uint8Array(0));
  }

  CloseStream: () => void = () => {
    // Do nothing
  }

  Normalize: () => void = () => {
    while (this.Range < Decoder.kTopValue) {
      this.Code = ((this.Code << 8 >>> 0) | this.Stream.Read()) >>> 0;
      this.Range = (this.Range << 8 >>> 0);
    }
  }

  // ???
  GetThreshold: (total: number) => number = (total) => {
    return this.Code / (this.Range /= total)
  }

  Decode: (start: number, size: number) => void = (start: number, size: number) => {
    this.Code -= start * this.Range;
    this.Range *= size;
    this.Normalize();
  }

  DecodeDirectBits: (numTotalBits: number) => number = (numTotalBits: number) => {
    let range = this.Range;
    let code = this.Code;
    let result = 0;
    for (let i = numTotalBits; i > 0; i--) {
      range >>>= 1;
      const t = (code - range) >>> 31;
      code -= range & (t - 1);
      result = (result << 1) | (1 - t);
      if (range < Decoder.kTopValue) {
        code = ((code << 8 >>> 0) | this.Stream.Read()) >>> 0;
        range = (range << 8 >>> 0);
      }
    }
    this.Range = range;
    this.Code = code;
    return result;
  }

  DecodeBit: (size0: number, numTotalBits: number) => number = (size0: number, numTotalBits: number) => {
    const newBound = (this.Range >>> numTotalBits) * size0;
    let symbol;
    if (this.Code < newBound) {
      symbol = 0;
      this.Range = newBound;
    }
    else {
      symbol = 1;
      this.Code -= newBound;
      this.Range -= newBound;
    }
    this.Normalize();
    return symbol;
  }
}