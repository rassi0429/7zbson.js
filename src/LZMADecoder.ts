import {BitTreeDecoder} from "./BitTreeDecoder";
import {LenDecoder} from "./LenDecoder";
import {LiteralDecoder} from "./LiteralDecoder";
import {Decoder} from "./RangeCoder";
import {OutWindow} from "./OutWindow";
import {Stream} from "./Stream";
import {BitDecoder} from "./BitDecoder";

export class LZMADecoder {

  m_OutWindow: OutWindow = new OutWindow();
  m_RangeDecoder: Decoder = new Decoder();

  m_IsMatchDecoders: BitDecoder[] = [];
  m_IsRepDecoders: BitDecoder[] = [];
  m_IsRepG0Decoders: BitDecoder[] = [];
  m_IsRepG1Decoders: BitDecoder[] = [];
  m_IsRepG2Decoders: BitDecoder[] = [];
  m_IsRep0LongDecoders: BitDecoder[] = [];

  m_PosSlotDecoder: BitTreeDecoder[] = [];
  m_PosDecoders: BitDecoder[] = [];

  m_PosAlignDecoder: BitTreeDecoder = new BitTreeDecoder(4);

  m_LenDecoder: LenDecoder = new LenDecoder();
  m_RepLenDecoder: LenDecoder = new LenDecoder();

  m_LiteralDecoder: LiteralDecoder = new LiteralDecoder();

  m_DictionarySize: number = 0;
  m_DictionarySizeCheck: number = 0;

  m_PosStateMask: number = 0;

  constructor() {
    for (let i = 0; i < LZMABase.kNumStates << LZMABase.kNumPosStatesBitsMax; i++) {
      this.m_IsMatchDecoders[i] = new BitDecoder();
      this.m_IsRep0LongDecoders[i] = new BitDecoder();
    }

    for (let i = 0; i < LZMABase.kNumStates; i++) {
      this.m_IsRepDecoders[i] = new BitDecoder();
      this.m_IsRepG0Decoders[i] = new BitDecoder();
      this.m_IsRepG1Decoders[i] = new BitDecoder();
      this.m_IsRepG2Decoders[i] = new BitDecoder();
    }

    for (let i = 0; i < LZMABase.kNumLenToPosStates; i++) {
      this.m_PosSlotDecoder[i] = new BitTreeDecoder(LZMABase.kNumPosSlotBits);
    }

    for (let i = 0; i < LZMABase.kNumFullDistances - LZMABase.kEndPosModelIndex; i++) {
      this.m_PosDecoders[i] = new BitDecoder();
    }

    for (let i = 0; i < LZMABase.kNumAlignBits; i++) {
      this.m_PosAlignDecoder.Models[i] = new BitDecoder();
    }
  }

  decoder() {
    this.m_DictionarySize = -1;
    for (let i = 0; i < LZMABase.kNumLenToPosStates; i++) {
      this.m_PosSlotDecoder[i] = new BitTreeDecoder(LZMABase.kNumPosSlotBits);
    }
  }

  SetDictionarySize: (dictionarySize: number) => void = (dictionarySize: number) => {
    if (this.m_DictionarySize !== dictionarySize) {
      this.m_DictionarySize = dictionarySize;
      this.m_DictionarySizeCheck = Math.max(this.m_DictionarySize, 1);
      this.m_OutWindow.Create(Math.max(this.m_DictionarySizeCheck, 4096));
    }
  }

  SetLiteralProperties: (lp: number, lc: number) => void = (lp: number, lc: number) => {
    if (lp > 8) {
      throw new Error("lp > 8");
    }
    if (lc > 8) {
      throw new Error("lc > 8");
    }
    this.m_LiteralDecoder.Create(lp, lc);
  }

  SetPosBitsProperties: (pb: number) => void = (pb: number) => {
    if (pb > LZMABase.kNumPosStatesBitsMax) {
      throw new Error("pb > LZMABase.kNumPosStatesBitsMax");
    }
    let numPosStates = 1 << pb;
    this.m_LenDecoder.Create(numPosStates);
    this.m_RepLenDecoder.Create(numPosStates);
    this.m_PosStateMask = numPosStates - 1;
  }

  _solid = false;

  Init: (inStream: Stream, outStream: Stream) => void = (inStream: Stream, outStream: Stream) => {
    // console.log("Init Position", inStream.Position)
    this.m_RangeDecoder.Init(inStream);
    this.m_OutWindow.Init(outStream, this._solid);

    let i: number = 0;
    for (i = 0; i < LZMABase.kNumStates; i++) {
      for (let j = 0; j <= this.m_PosStateMask; j++) {
        let index = (i << LZMABase.kNumPosStatesBitsMax) + j;
        this.m_IsMatchDecoders[index].Init();
        this.m_IsRep0LongDecoders[index].Init();
      }
      this.m_IsRepDecoders[i].Init();
      this.m_IsRepG0Decoders[i].Init();
      this.m_IsRepG1Decoders[i].Init();
      this.m_IsRepG2Decoders[i].Init();
    }

    this.m_LiteralDecoder.Init();
    for (i = 0; i < LZMABase.kNumLenToPosStates; i++) {
      this.m_PosSlotDecoder[i].Init();
    }

    for (i = 0; i < LZMABase.kNumFullDistances - LZMABase.kEndPosModelIndex; i++) {
      this.m_PosDecoders[i].Init();
    }

    this.m_LenDecoder.Init();
    this.m_RepLenDecoder.Init();
    this.m_PosAlignDecoder.Init();
  }

  Code: (inStream: Stream, outStream: Stream, inSize: number, outSize: number, progress: any) => void = (inStream: Stream, outStream: Stream, inSize: number, outSize: number, progress: any) => {
    // console.log("Code init: ", inStream.Position)
    this.Init(inStream, outStream);

    let state = new State();
    state.Init();
    let rep0 = 0, rep1 = 0, rep2 = 0, rep3 = 0;

    let nowPos64 = 0;
    let outSize64 = outSize;
    if (nowPos64 < outSize64) {
      if (this.m_IsMatchDecoders[state.Index << LZMABase.kNumPosStatesBitsMax].Decode(this.m_RangeDecoder) !== 0) {
        throw new Error("this.m_IsMatchDecoders[state.Index].Decode(this.m_RangeDecoder) !== 0");
      }
      state.UpdateChar();
      let b = this.m_LiteralDecoder.DecodeNormal(this.m_RangeDecoder, 0, 0);
      // console.log("b", b)
      this.m_OutWindow.PutByte(b);
      nowPos64++;
    }

    let count = 0;
    while (nowPos64 < outSize64) {
      count++;
      let posState = nowPos64 & this.m_PosStateMask;
      //console.log("posState", posState)
      // console.log("nowPos64", nowPos64, count)
      //console.log("outSize64", outSize64)

      // 2097197 7160 7189
      if(nowPos64 > 2097159) {
        debugger
      }

      const matchDecodeResult = this.m_IsMatchDecoders[(state.Index << LZMABase.kNumPosStatesBitsMax) + posState].Decode(this.m_RangeDecoder)
      //console.log("matchDecodeResult", matchDecodeResult)
      if (matchDecodeResult === 0) {
        let b;
        let prevByte = this.m_OutWindow.GetByte(0);
        if (!state.IsCharState()) {
          b = this.m_LiteralDecoder.DecodeWithMatchByte(this.m_RangeDecoder,
            nowPos64, prevByte, this.m_OutWindow.GetByte(rep0));
        } else {
          b = this.m_LiteralDecoder.DecodeNormal(this.m_RangeDecoder, nowPos64, prevByte);
        }
        //console.log("isCharState", state.IsCharState())
        //console.log("b", b)
        //console.log("prevByte", prevByte)
        this.m_OutWindow.PutByte(b);
        state.UpdateChar();
        nowPos64++;
      } else {
        let len = 0;
        const repResult = this.m_IsRepDecoders[state.Index].Decode(this.m_RangeDecoder);
        //console.log("repResult", repResult)
        if (repResult === 1) {
          const RepG0Result = this.m_IsRepG0Decoders[state.Index].Decode(this.m_RangeDecoder)
          //console.log("RepG0Result", RepG0Result)
          if (RepG0Result === 0) {
            if (this.m_IsRep0LongDecoders[(state.Index << LZMABase.kNumPosStatesBitsMax) + posState].Decode(this.m_RangeDecoder) === 0) {
              state.UpdateShortRep();
              this.m_OutWindow.PutByte(this.m_OutWindow.GetByte(rep0));
              nowPos64++;
              //console.log("Continue!!!")
              continue;
            }
          } else {
            let distance: number;
            if (this.m_IsRepG1Decoders[state.Index].Decode(this.m_RangeDecoder) === 0) {
              distance = rep1;
            } else {
              if (this.m_IsRepG2Decoders[state.Index].Decode(this.m_RangeDecoder) === 0) {
                distance = rep2;
              } else {
                distance = rep3;
                rep3 = rep2;
              }
              rep2 = rep1;
            }
            rep1 = rep0;
            rep0 = distance;
          }
          len = this.m_RepLenDecoder.Decode(this.m_RangeDecoder, posState) + LZMABase.kMatchMinLen;
          state.UpdateRep();
        } else {
          rep3 = rep2;
          rep2 = rep1;
          rep1 = rep0;
          len = LZMABase.kMatchMinLen + this.m_LenDecoder.Decode(this.m_RangeDecoder, posState);
          state.UpdateMatch();
          let posSlot = this.m_PosSlotDecoder[LZMABase.GetLenToPosState(len)].Decode(this.m_RangeDecoder);
          if (posSlot >= LZMABase.kStartPosModelIndex) {
            let numDirectBits = (posSlot >> 1) - 1;
            rep0 = (2 | (posSlot & 1)) << numDirectBits;
            if (posSlot < LZMABase.kEndPosModelIndex) {
              rep0 += BitTreeDecoder.ReverseDecode(this.m_PosDecoders,
                rep0 - posSlot - 1, this.m_RangeDecoder, numDirectBits);
            } else {
              rep0 += (this.m_RangeDecoder.DecodeDirectBits(
                numDirectBits - LZMABase.kNumAlignBits) << LZMABase.kNumAlignBits);
              rep0 += this.m_PosAlignDecoder.ReverseDecode(this.m_RangeDecoder);
            }
          } else {
            rep0 = posSlot;
          }
        }
        // console.log("rep0", rep0);
        // console.log("this.m_OutWindow.TrainSize", this.m_OutWindow.TrainSize);
        // console.log("nowPos64", nowPos64);
        // console.log("this.m_DictionarySizeCheck", this.m_DictionarySizeCheck);
        if (rep0 >= this.m_OutWindow.TrainSize + nowPos64 || rep0 >= this.m_DictionarySizeCheck) {
          if (rep0 === 0xFFFFFFFF) {
            break;
          }
          throw new Error("rep0 >= this.m_OutWindow.TrainSize + nowPos64 || rep0 >= this.m_DictionarySizeCheck");
        }
        this.m_OutWindow.CopyBlock(rep0, len);
        nowPos64 += len;
      }
    }
    this.m_OutWindow.Flush();
    this.m_OutWindow.ReleaseStream();
    this.m_RangeDecoder.ReleaseStream();
  }

  SetDecoderProperties: (properties: Uint8Array) => void = (properties: Uint8Array) => {
    let value: number;
    if (properties.length < 5) {
      throw new Error("properties.length < 5");
    }
    value = properties[0] & 0xFF;
    let lc = value % 9;
    let remainder = ~~(value / 9);
    let lp = remainder % 5;
    let pb = ~~(remainder / 5);
    if (properties.length < 5) {
      throw new Error("properties.length < 5");
    }
    let dictionalySize = 0;
    for (let i = 0; i < 4; i++) {
      dictionalySize += (properties[1 + i] << (i * 8)) >>> 0;
    }
    this.SetDictionarySize(dictionalySize);
    this.SetLiteralProperties(lp, lc);
    this.SetPosBitsProperties(pb);
  }

  Train: (stream: Stream) => boolean = (stream: Stream) => {
    this._solid = true;
    return this.m_OutWindow.Train(stream);
  }
}

export class State {
  Index: number = 0;

  Init: () => void = () => {
    this.Index = 0;
  }

  UpdateChar: () => void = () => {
    if (this.Index < 4) {
      this.Index = 0;
    } else if (this.Index < 10) {
      this.Index -= 3;
    } else {
      this.Index -= 6;
    }
  }

  UpdateMatch: () => void = () => {
    this.Index = (this.Index < 7 ? 7 : 10);
  }

  UpdateRep: () => void = () => {
    this.Index = (this.Index < 7 ? 8 : 11);
  }

  UpdateShortRep: () => void = () => {
    this.Index = (this.Index < 7 ? 9 : 11);
  }

  IsCharState: () => boolean = () => {
    return this.Index < 7;
  }
}

export class LZMABase {
  static kNumRepDistances: number = 4;
  static kNumStates: number = 12;
  static kNumPosSlotBits: number = 6;
  static kDicLogSizeMin: number = 0;
  static kNumLenToPosStatesBits: number = 2;
  static kNumLenToPosStates: number = 1 << this.kNumLenToPosStatesBits;
  static kMatchMinLen: number = 2;

  static GetLenToPosState: (len: number) => number = (len: number) => {
    len -= LZMABase.kMatchMinLen;
    if (len < LZMABase.kNumLenToPosStates) {
      return len;
    }
    return LZMABase.kNumLenToPosStates - 1;
  }

  static kNumAlignBits: number = 4;
  static kAlignTableSize: number = 1 << this.kNumAlignBits;
  static kAlignMask: number = this.kAlignTableSize - 1;

  static kStartPosModelIndex: number = 4;
  static kEndPosModelIndex: number = 14;
  static kNumPosModels: number = this.kEndPosModelIndex - this.kStartPosModelIndex;

  static kNumFullDistances: number = 1 << (this.kEndPosModelIndex / 2);

  static kNumLitPosStatesBitsEncodingMax: number = 4;
  static kNumLitContextBitsMax: number = 8;

  static kNumPosStatesBitsMax: number = 4;
  static kNumPosStatesMax: number = 1 << this.kNumPosStatesBitsMax;
  static kNumPosStatesBitsEncodingMax: number = 4;
  static kNumPosStatesEncodingMax: number = 1 << this.kNumPosStatesBitsEncodingMax;

  static kNumLowLenBits: number = 3;
  static kNumMidLenBits: number = 3;
  static kNumHighLenBits: number = 8;
  static kNumLowLenSymbols: number = 1 << this.kNumLowLenBits;
  static kNumMidLenSymbols: number = 1 << this.kNumMidLenBits;
  static kNumLenSymbols: number = this.kNumLowLenSymbols + this.kNumMidLenSymbols + (1 << this.kNumHighLenBits);
  static kMatchMaxLen: number = this.kMatchMinLen + this.kNumLenSymbols - 1;

}