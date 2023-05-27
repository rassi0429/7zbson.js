import {Encoder} from "./RangeCoder";

export class BitEncoder {
  static kNumBitModelTotalBits: number = 11;
  static kBitModelTotal: number = 1 << this.kNumBitModelTotalBits;
  kNumMoveBits: number = 5;
  static kNumMoveReducingBits: number = 2;
  public static kNumBitPriceShiftBits: number = 6;

  Prob = 0;

  Init: () => void = () => {
    this.Prob = BitEncoder.kBitModelTotal >>> 1;
  }

  UpdateModel: (symbol: number) => void = (symbol: number) => {
    if (symbol === 0) {
      this.Prob += (BitEncoder.kBitModelTotal - this.Prob) >>> this.kNumMoveBits;
    }
    else {
      this.Prob -= this.Prob >>> this.kNumMoveBits;
    }
  }

  Encode: (rangeEncoder: Encoder, symbol: number) => void = (rangeEncoder: Encoder, symbol: number) => {
    let newBound = (rangeEncoder.Range >>> BitEncoder.kNumBitModelTotalBits) * this.Prob;
    if (symbol === 0) {
      rangeEncoder.Range = newBound;
      this.Prob += (BitEncoder.kBitModelTotal - this.Prob) >>> this.kNumMoveBits;
    }
    else {
      rangeEncoder.Low = (rangeEncoder.Low + newBound) >>> 0;
      rangeEncoder.Range = (rangeEncoder.Range - newBound) >>> 0;
      this.Prob -= this.Prob >>> this.kNumMoveBits;
    }

    if (rangeEncoder.Range < Encoder.kTopValue) {
      rangeEncoder.Range = (rangeEncoder.Range << 8) >>> 0;
      rangeEncoder.ShiftLow();
    }
  }

  static ProbPrices: Uint32Array = new Uint32Array(this.kBitModelTotal >>> this.kNumMoveReducingBits);

  static BitEncoder() {
    const kNumBits = BitEncoder.kNumBitModelTotalBits - BitEncoder.kNumMoveReducingBits;
    for (let i = kNumBits - 1; i >= 0; i--) {
      const start = (1 << (kNumBits - i - 1)) >>> 0;
      const end = (1 << (kNumBits - i)) >>> 0;
      for (let j = start; j < end; j++) {
        this.ProbPrices[j] = (i << BitEncoder.kNumBitPriceShiftBits) + (((end - j) << BitEncoder.kNumBitPriceShiftBits) >>> (kNumBits - i - 1));
      }
    }
  }

  GetPrice: (symbol: number) => number = (symbol: number) => {
    return BitEncoder.ProbPrices[((((this.Prob - symbol) ^ ((-(symbol))) & (BitEncoder.kBitModelTotal - 1))) )  >>> BitEncoder.kNumMoveReducingBits];
  }

  GetPrice0: () => number = () => {
    return BitEncoder.ProbPrices[this.Prob >>> BitEncoder.kNumMoveReducingBits];
  }

  GetPrice1: () => number = () => {
    return BitEncoder.ProbPrices[(BitEncoder.kBitModelTotal - this.Prob) >>> BitEncoder.kNumMoveReducingBits];
  }
}