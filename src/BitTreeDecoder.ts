import {Decoder} from "./RangeCoder";
import {BitDecoder} from "./BitDecoder";


export class BitTreeDecoder {
  Models: BitDecoder[] = [];
  NumBitLevels: number = 0;

  constructor(numBitLevels: number) {
    this.NumBitLevels = numBitLevels;
    for (let i = 0; i < (1 << numBitLevels); i++) {
      this.Models.push(new BitDecoder());
    }
  }

  Init: () => void = () => {
    for (let i = 1; i < (1 << this.NumBitLevels); i++) {
      this.Models[i].Init();
    }
  }

  Decode: (rangeDecoder: Decoder) => number = (rangeDecoder: Decoder) => {
    let m = 1;
    for (let bitIndex = this.NumBitLevels; bitIndex > 0; bitIndex--) {
      m = (m << 1) + this.Models[m].Decode(rangeDecoder);
      // console.log("m", m)
    }
    return m - (1 << this.NumBitLevels);
  }

  ReverseDecode: (rangeDecoder: Decoder) => number = (rangeDecoder: Decoder) => {
    let m = 1;
    let symbol = 0;
    for (let bitIndex = 0; bitIndex < this.NumBitLevels; bitIndex++) {
      const bit = this.Models[m].Decode(rangeDecoder);
      m = (m << 1 >>> 0);
      m += bit;
      symbol |= bit << bitIndex;
    }
    return symbol;
  }

  // For Static Method
  static ReverseDecode: (Models: BitDecoder[], startIndex: number, rangeDecoder: Decoder, NumBitLevels: number) => number = (Models: BitDecoder[], startIndex: number, rangeDecoder: Decoder, NumBitLevels: number) => {
    let m = 1;
    let symbol = 0;
    for (let bitIndex = 0; bitIndex < NumBitLevels; bitIndex++) {
      const bit = Models[startIndex + m].Decode(rangeDecoder);
      m = (m << 1 >>> 0);
      m += bit;
      // MEMO
      symbol |= bit << bitIndex;
    }
    return symbol;
  }
}