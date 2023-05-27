import {BitEncoder} from "./BitEncoder";
import {BitTreeEncoder} from "./BitTreeEncoder";
import {LZMABase} from "./LZMADecoder";
import {Encoder} from "./RangeCoder";

export class LenEncoder {
  _choice: BitEncoder = new BitEncoder();
  _choice2: BitEncoder = new BitEncoder();
  _lowCoder: BitTreeEncoder[] = [];
  _midCoder: BitTreeEncoder[] = [];
  _highCoder: BitTreeEncoder = new BitTreeEncoder(8);

  constructor() {
    for (let posState = 0; posState < 1 << 3; posState++) {
      // NEED to PUSH the Array?
      this._lowCoder[posState] = new BitTreeEncoder(LZMABase.kNumLowLenBits);
      this._midCoder[posState] = new BitTreeEncoder(LZMABase.kNumMidLenBits);
    }
  }

  Init: (numPosStates: number) => void = (numPosStates: number) => {
    this._choice.Init();
    this._choice2.Init();
    for (let posState = 0; posState < numPosStates; posState++) {
      this._lowCoder[posState].Init();
      this._midCoder[posState].Init();
    }
    this._highCoder.Init();
  }

  EncodeP: (rangeEncoder: Encoder , symbol: number, posState: number) => void = (rangeEncoder: Encoder , symbol: number, posState: number) => {
    if (symbol < LZMABase.kNumLowLenSymbols) {
      this._choice.Encode(rangeEncoder, 0);
      this._lowCoder[posState].Encode(rangeEncoder, symbol);
    } else {
      symbol = (symbol - LZMABase.kNumLowLenSymbols) >>> 0;
      this._choice.Encode(rangeEncoder, 1);
      if (symbol < LZMABase.kNumMidLenSymbols) {
        this._choice2.Encode(rangeEncoder, 0);
        this._midCoder[posState].Encode(rangeEncoder, symbol);
      } else {
        this._choice2.Encode(rangeEncoder, 1);
        this._highCoder.Encode(rangeEncoder, symbol - LZMABase.kNumMidLenSymbols);
      }
    }
  }

  SetPrices: (posState: number, numSymbols: number, prices: Uint32Array, st: number) => void = (posState: number, numSymbols: number, prices: Uint32Array, st: number) => {
    const a0 = this._choice.GetPrice0();
    const a1 = this._choice.GetPrice1();
    const b0 = a1 + this._choice2.GetPrice0();
    const b1 = a1 + this._choice2.GetPrice1();
    let i = 0;
    for (i = 0; i < LZMABase.kNumLowLenSymbols; i++) {
      if (i >= numSymbols) {
        return;
      }
      prices[st + i] = (a0 + this._lowCoder[posState].GetPrice(i)) >>> 0;
    }
    for (; i < LZMABase.kNumLowLenSymbols + LZMABase.kNumMidLenSymbols; i++) {
      if (i >= numSymbols) {
        return;
      }
      prices[st + i] = (b0 + this._midCoder[posState].GetPrice(i - LZMABase.kNumLowLenSymbols)) >>> 0;
    }
    for (; i < numSymbols; i++) {
      prices[st + i] = (b1 + this._highCoder.GetPrice(i - LZMABase.kNumLowLenSymbols - LZMABase.kNumMidLenSymbols)) >>> 0;
    }
  }
  kNumLenSpcSymbols: number = LZMABase.kNumLowLenSymbols + LZMABase.kNumMidLenSymbols;
}