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

export class Encoder {
  public static kTopValue: number = (1 << 24);
  Stream: Stream = new Stream(new Uint8Array(0));

  Low: number = 0; // UInt64
  Range: number = 0;
  _cacheSize: number = 0;

  // BYTE
  _cache: number = 0;

  StartPosition: number = 0;

  SetStream: (stream: Stream) => void = (stream: Stream) => {
    this.Stream = stream;
  }

  ReleaseStream: () => void = () => {
    this.Stream = new Stream(new Uint8Array(0));
  }

  Init: () => void = () => {
    this.StartPosition = this.Stream.Position;
    this.Low = 0;
    this.Range = 0xFFFFFFFF;
    this._cacheSize = 1;
    this._cache = 0;
  }

  FlushData: () => void = () => {
    for (let i = 0; i < 5; i++) {
      this.ShiftLow();
    }
  }

  FlushStream: () => void = () => {
    this.Stream.Flush();
  }

  CloseStream: () => void = () => {
    // Do nothing
  }

  Encode: (start: number, size: number, total: number) => void = (start: number, size: number, total: number) => {
    // need Uint 64 casting??
    this.Low += start * (this.Range /= total);
    this.Range = (size * this.Range) >>> 0;
    while (this.Range < Encoder.kTopValue) {
      this.Range = (this.Range << 8 >>> 0);
      this.ShiftLow();
    }
  }

  ShiftLow: () => void = () => {
    if ((this.Low >>> 0) < (0xFF000000 >>> 0) || (this.Low >>> 0) == 1) {
      let temp = this._cache;
      do {
        this.Stream.WriteByte((temp + (this.Low >>> 32)) >>> 0);
        temp = 0xFF;
      } while (--this._cacheSize != 0);
      this._cache = ((this.Low >>> 24)) & 0xFF;
    }
    this._cacheSize++;
    this.Low = ((this.Low << 8) >>> 0);
  }

  EncodeDirectBits: (v: number, numTotalBits: number) => void = (v: number, numTotalBits: number) => {
    for (let i = numTotalBits - 1; i >= 0; i--) {
      this.Range = (this.Range >>> 1);
      if (((v >>> i) & 1) == 1) {
        this.Low = ((this.Low + this.Range) >>> 0);
      }
      if (this.Range < Encoder.kTopValue) {
        this.Range = (this.Range << 8 >>> 0);
        this.ShiftLow();
      }
    }
  }

  EncodeBit: (size0: number, numTotalBits: number, symbol: number) => void = (size0: number, numTotalBits: number, symbol: number) => {
    const newBound = (this.Range >>> numTotalBits) * size0;
    if (symbol == 0) {
      this.Range = newBound;
    }
    else {
      this.Low = ((this.Low + newBound) >>> 0);
      this.Range -= newBound;
    }
    while (this.Range < Encoder.kTopValue) {
      this.Range = (this.Range << 8 >>> 0);
      this.ShiftLow();
    }
  }

  GetProcessedSizeAdd: () => number = () => {
    return this._cacheSize + this.Stream.Position - this.StartPosition + 4;
  }

}