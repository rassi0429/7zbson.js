import {BitEncoder} from "./BitEncoder";

export class BitTreeEncoder {
  Models: BitEncoder[] = [];
  NumBitLevels: number = 0;

  constructor(numBitLevels: number) {
    this.NumBitLevels = numBitLevels;
    for (let i = 0; i < (1 << numBitLevels); i++) {
      this.Models.push(new BitEncoder());
    }
  }

  Init: () => void = () => {
    for (let i = 1; i < (1 << this.NumBitLevels); i++) {
      this.Models[i].Init();
    }
  }

  Encode: (rangeEncoder: any, symbol: number) => void = (rangeEncoder: any, symbol: number) => {
    let m = 1;
    for (let bitIndex = this.NumBitLevels; bitIndex > 0;) {
      bitIndex--;
      const bit = (symbol >>> bitIndex) & 1;
      this.Models[m].Encode(rangeEncoder, bit);
      m = (m << 1) | bit;
    }
  }

  ReverseEncode: (rangeEncoder: any, symbol: number) => void = (rangeEncoder: any, symbol: number) => {
    let m = 1;
    for (let i = 0; i < this.NumBitLevels; i++) {
      const bit = symbol & 1;
      this.Models[m].Encode(rangeEncoder, bit);
      m = (m << 1) | bit;
      symbol >>>= 1;
    }
  }

  GetPrice: (symbol: number) => number = (symbol: number) => {
    let price = 0;
    let m = 1;
    for (let bitIndex = this.NumBitLevels; bitIndex > 0;) {
      bitIndex--;
      const bit = (symbol >>> bitIndex) & 1;
      price += this.Models[m].GetPrice(bit);
      m = (m << 1) + bit;
    }
    return price;
  }

  ReverseGetPrice: (symbol: number) => number = (symbol: number) => {
    let price = 0;
    let m = 1;
    for (let i = this.NumBitLevels; i > 0; i--) {
      const bit = symbol & 1;
      symbol >>>= 1;
      price += this.Models[m].GetPrice(bit);
      m = (m << 1) | bit;
    }
    return price;
  }

  // For Static Method
  static ReverseGetPrice: (Models: BitEncoder[], startIndex: number, NumBitLevels: number, symbol: number) => number = (Models: BitEncoder[], startIndex: number, NumBitLevels: number, symbol: number) => {
    let price = 0;
    let m = 1;
    for (let i = NumBitLevels; i > 0; i--) {
      const bit = symbol & 1;
      symbol >>>= 1;
      price += Models[startIndex + m].GetPrice(bit);
      m = (m << 1) | bit;
    }
    return price;
  }

  static ReverseEncode: (Models: BitEncoder[], startIndex: number, rangeEncoder: any, NumBitLevels: number, symbol: number) => void = (Models: BitEncoder[], startIndex: number, rangeEncoder: any, NumBitLevels: number, symbol: number) => {
    let m = 1;
    for (let i = 0; i < NumBitLevels; i++) {
      const bit = symbol & 1;
      Models[startIndex + m].Encode(rangeEncoder, bit);
      m = (m << 1) | bit;
      symbol >>>= 1;
    }
  }
}