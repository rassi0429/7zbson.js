import {BitEncoder} from "./BitEncoder";
import {Encoder} from "./RangeCoder";

export class LiteralEncoder {
  m_Coders: Encoder2[] = [];
  m_NumPrevBits: number = 0;
  m_NumPosBits: number = 0;
  m_PosMask: number = 0;

  Create: (numPosBits: number, numPrevBits: number) => void = (numPosBits: number, numPrevBits: number) => {
    if(this.m_Coders.length !== 0 && this.m_NumPrevBits === numPrevBits && this.m_NumPosBits === numPosBits) {
      return;
    }
    this.m_NumPosBits = numPosBits;
    this.m_PosMask = ((1 << numPosBits) >>> 0) - 1;
    this.m_NumPrevBits = numPrevBits;
    const numStates = 1 << (this.m_NumPrevBits + this.m_NumPosBits);
    this.m_Coders = [];
    for (let i = 0; i < numStates; i++) {
      this.m_Coders[i] = new Encoder2();
      this.m_Coders[i].Create();
    }
  }

  Init: () => void = () => {
    const numStates = (1 << (this.m_NumPrevBits + this.m_NumPosBits)) >>> 0 ;
    for (let i = 0; i < numStates; i++) {
      this.m_Coders[i].Init();
    }
  }

  GetSubCoder: (pos: number, prevByte: number) => Encoder2 = (pos: number, prevByte: number) => {
    return this.m_Coders[((pos & this.m_PosMask) << this.m_NumPrevBits) + (prevByte >> (8 - this.m_NumPrevBits))];
  }
}

class Encoder2 {
  m_Encoders: BitEncoder[] = [];

  Create: () => void = () => {
    for (let i = 0; i < 0x300; i++) {
      this.m_Encoders.push(new BitEncoder());
    }
  }

  Init: () => void = () => {
    for (let i = 0; i < 0x300; i++) {
      this.m_Encoders[i].Init();
    }
  }

  Encode: (rangeEncoder: Encoder, symbol: number) => void = (rangeEncoder: Encoder, symbol: number) => {
    let context = 1;
    for (let i = 7; i >= 0; i--) {
      const bit = (symbol >>> i) & 1;
      this.m_Encoders[context].Encode(rangeEncoder, bit);
      context = (context << 1) | bit;
    }
  }

  EncodeMatched: (rangeEncoder: Encoder, matchByte: number, symbol: number) => void = (rangeEncoder: Encoder, matchByte: number, symbol: number) => {
    let context = 1;
    let same = true;
    for (let i = 7; i >= 0; i--) {
      const bit = (symbol >>> i) & 1;
      let state = context;
      if (same) {
        const matchBit = (matchByte >>> i) & 1;
        state += (1 + matchBit) << 8;
        same = matchBit === bit;
      }
      this.m_Encoders[state].Encode(rangeEncoder, bit);
      context = (context << 1) | bit;
    }
  }

  GetPrice: (matchMode: boolean, matchByte: number, symbol: number) => number = (matchMode: boolean, matchByte: number, symbol: number) => {
    let price = 0;
    let context = 1;
    let i = 7;
    if (matchMode) {
      for (; i >= 0; i--) {
        const bit = (symbol >>> i) & 1;
        const matchBit = (matchByte >>> i) & 1;
        price += this.m_Encoders[((1 + matchBit) << 8) + context].GetPrice(bit);
        context = (context << 1) | bit;
        if (matchBit !== bit) {
          i--;
          break;
        }
      }
    } else {
      for (; i >= 0; i--) {
        const bit = (symbol >>> i) & 1;
        price += this.m_Encoders[context].GetPrice(bit);
        context = (context << 1) | bit;
      }
    }
    return price;
  }
}