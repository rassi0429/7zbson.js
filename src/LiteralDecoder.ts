import {BitDecoder} from "./BitDecoder";
import {Decoder} from "./RangeCoder";

export class LiteralDecoder {
  m_Coders: Decoder2[] = [];
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
      this.m_Coders[i] = new Decoder2();
      this.m_Coders[i].Create();
    }
  }

  Init: () => void = () => {
    const numStates = (1 << (this.m_NumPrevBits + this.m_NumPosBits)) >>> 0 ;
    for (let i = 0; i < numStates; i++) {
      this.m_Coders[i].Init();
    }
  }

  GetState: (pos: number, prevByte: number) => number = (pos: number, prevByte: number) => {
    return ((pos & this.m_PosMask) << this.m_NumPrevBits) + (prevByte >> (8 - this.m_NumPrevBits));
  }

  DecodeNormal: (rangeDecoder: Decoder, pos: number, prevByte: number) => number = (rangeDecoder: any, pos: number, prevByte: number) => {
    return this.m_Coders[this.GetState(pos, prevByte)].DecodeNormal(rangeDecoder);
  }

  DecodeWithMatchByte: (rangeDecoder: Decoder, pos: number, prevByte: number, matchByte: number) => number = (rangeDecoder: any, pos: number, prevByte: number, matchByte: number) => {
    return this.m_Coders[this.GetState(pos, prevByte)].DecodeWithMatchByte(rangeDecoder, matchByte);
  }
}

class Decoder2 {
  m_Decoders: BitDecoder[] = [];

  Create: () => void = () => {
    for (let i = 0; i < 0x300; i++) {
      this.m_Decoders[i] = new BitDecoder();
    }
  }

  Init: () => void = () => {
    for (let i = 0; i < 0x300; i++) {
      this.m_Decoders[i].Init();
    }
  }

  DecodeNormal: (rangeDecoder: Decoder) => number = (rangeDecoder: any) => {
    let symbol = 1;
    do {
      symbol = (((symbol << 1) >>> 0) | this.m_Decoders[symbol].Decode(rangeDecoder)) >>> 0;
    } while (symbol < 0x100);
    return symbol & 0xff;
  }

  DecodeWithMatchByte: (rangeDecoder: Decoder, matchByte: number) => number = (rangeDecoder: any, matchByte: number) => {
    let symbol = 1;
    do {
      const matchBit = (matchByte >> 7) & 1;
      matchByte = (matchByte << 1) & 0xff;
      const bit = this.m_Decoders[((1 + matchBit) << 8) + symbol].Decode(rangeDecoder);
      symbol = (((symbol << 1) >>> 0) | bit ) >>> 0;
      if (matchBit !== bit) {
        while (symbol < 0x100) {
          symbol = (((symbol << 1) >>> 0) | this.m_Decoders[symbol].Decode(rangeDecoder)) >>> 0;
        }
        break;
      }
    } while (symbol < 0x100);
    return symbol & 0xff;
  }
}