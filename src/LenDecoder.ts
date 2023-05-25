import {BitDecoder} from "./BitDecoder";
import {BitTreeDecoder} from "./BitTreeDecoder";
import {Decoder} from "./RangeCoder";
import {LZMABase, LZMADecoder} from "./LZMADecoder";

export class LenDecoder {
  m_Choice: BitDecoder = new BitDecoder();
  m_Choice2: BitDecoder = new BitDecoder();
  m_LowCoder: BitTreeDecoder[] = [];
  m_MidCoder: BitTreeDecoder[] = [];
  m_HighCoder: BitTreeDecoder = new BitTreeDecoder(8);

  m_NumPosStates: number = 0;

  Create: (numPosStates: number) => void = (numPosStates: number) => {
    for (; this.m_NumPosStates < numPosStates; this.m_NumPosStates++) {
      this.m_LowCoder[this.m_NumPosStates] = new BitTreeDecoder(3);
      this.m_MidCoder[this.m_NumPosStates] = new BitTreeDecoder(3);
    }
    this.m_NumPosStates = numPosStates;
  }

  Init: () => void = () => {
    this.m_Choice.Init();
    for (let posState = 0; posState < this.m_NumPosStates; posState++) {
      this.m_LowCoder[posState].Init();
      this.m_MidCoder[posState].Init();
    }
    this.m_Choice2.Init();
    this.m_HighCoder.Init();
  }

  Decode: (rangeDecoder: Decoder, posState: number) => number = (rangeDecoder: any, posState: number) => {
    if (this.m_Choice.Decode(rangeDecoder) === 0) {
      return this.m_LowCoder[posState].Decode(rangeDecoder);
    } else {
      let symbol = LZMABase.kNumLowLenSymbols;
      if (this.m_Choice2.Decode(rangeDecoder) === 0) {
        symbol += this.m_MidCoder[posState].Decode(rangeDecoder);
      } else {
        symbol += LZMABase.kNumMidLenSymbols + this.m_HighCoder.Decode(rangeDecoder);
      }
      return symbol;
    }
  }
}