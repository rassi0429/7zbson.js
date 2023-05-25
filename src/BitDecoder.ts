import {Decoder} from "./RangeCoder";

export class BitDecoder {
  kNumBitModelTotalBits: number = 11;
  kBitModelTotal: number = 1 << this.kNumBitModelTotalBits;
  kNumMoveBits: number = 5;

  Prob: number = 0;

  UpdateModel: (numMoveBits: number, symbol: number) => void = (numMoveBits: number, symbol: number) => {
    if (symbol === 0) {
      this.Prob += (this.kBitModelTotal - this.Prob) >>> numMoveBits;
    } else {
      this.Prob -= this.Prob >>> numMoveBits;
    }
  }

  Init: () => void = () => {
    this.Prob = this.kBitModelTotal >>> 1;
  }

  Decode: (rangeDecoder: Decoder) => number = (rangeDecoder: Decoder) => {
    const newBound = (rangeDecoder.Range >>> this.kNumBitModelTotalBits) * this.Prob;
    // console.log("newBound", newBound)
    // console.log("Prob", this.Prob)
    // console.log("Range", rangeDecoder.Range)
    if (rangeDecoder.Code < newBound) {
      rangeDecoder.Range = newBound;
      this.Prob += (this.kBitModelTotal - this.Prob) >>> this.kNumMoveBits;
      if (rangeDecoder.Range < Decoder.kTopValue) {
        rangeDecoder.Code = ((rangeDecoder.Code << 8 >>> 0) | rangeDecoder.Stream.Read()) >>> 0;
        rangeDecoder.Range = (rangeDecoder.Range << 8 >>> 0);
      }
      // TODO remove this
      if(rangeDecoder.Code < 0 || rangeDecoder.Range < 0) {
        debugger;
      }
      return 0;
    } else {
      rangeDecoder.Range -= newBound;
      rangeDecoder.Code -= newBound;
      this.Prob -= this.Prob >>> this.kNumMoveBits;
      if (rangeDecoder.Range < Decoder.kTopValue) {
        rangeDecoder.Code = ((rangeDecoder.Code << 8 >>> 0) | rangeDecoder.Stream.Read()) >>> 0;
        rangeDecoder.Range = (rangeDecoder.Range << 8 >>> 0);
      }
      // TODO remove this
      if(rangeDecoder.Code < 0 || rangeDecoder.Range < 0) {
        debugger;
      }
      return 1;
    }
  }

}