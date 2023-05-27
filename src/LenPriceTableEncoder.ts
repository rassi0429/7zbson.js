import {LZMABase} from "./LZMADecoder";
import {LenEncoder} from "./LenEncoder";
import {Encoder} from "./RangeCoder";

export class LenPriceTableEncoder extends LenEncoder {
  _prices = new Uint32Array(LZMABase.kNumLenSymbols << LZMABase.kNumPosStatesBitsEncodingMax);
  _tableSize: number = 0;
  _counters = new Uint32Array(LZMABase.kNumPosStatesEncodingMax);

  SetTableSize: (tableSize: number) => void = (tableSize: number) => {
    this._tableSize = tableSize;
  }

  GetPrice: (symbol: number, posState: number) => number = (symbol: number, posState: number) => {
    return this._prices[posState * LZMABase.kNumLenSymbols + symbol];
  }

  UpdateTable: (posState: number) => void = (posState: number) => {
    this.SetPrices(posState, this._tableSize, this._prices, posState * LZMABase.kNumLenSymbols);
    this._counters[posState] = this._tableSize;
  }

  UpdateTables: (numPosStates: number) => void = (numPosStates: number) => {
    for (let posState = 0; posState < numPosStates; posState++) {
      this.UpdateTable(posState);
    }
  }

  Encode: (rangeEncoder: Encoder, symbol: number, posState: number) => void = (rangeEncoder: Encoder, symbol: number, posState: number) => {
    this.EncodeP(rangeEncoder, symbol, posState);
    if (--this._counters[posState] === 0) {
      this.UpdateTable(posState);
    }
  }
}