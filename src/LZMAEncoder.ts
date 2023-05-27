import {LZMABase, State} from "./LZMADecoder";
import {Optimal} from "./Optimal";
import {Encoder} from "./RangeCoder";
import {BitEncoder} from "./BitEncoder";
import {BitTreeEncoder} from "./BitTreeEncoder";
import {LenPriceTableEncoder} from "./LenPriceTableEncoder";
import {LiteralEncoder} from "./LiteralEncoder";
import {Stream} from "./Stream";
import {BinTree} from "./BinTree";

enum EMatchFinderType {
  BT2,
  BT4,
}

export class LZMAEncoder {
  kIfinityPrice: number = 0xFFFFFFF;
  static g_FastPos: number[] = [];

  static Encoder: () => void = () => {
    const kFastSlots = 22;
    let c = 2;
    this.g_FastPos[0] = 0;
    this.g_FastPos[1] = 1;

    for (let slotFast = 2; slotFast < kFastSlots; slotFast++) {
      const k = (1 << ((slotFast >> 1) - 1)) >>> 0;
      for (let i = 0; i < k; i++) {
        this.g_FastPos[c] = slotFast;
        c++;
      }
    }
  }

  static GetPosSlot: (pos: number) => number = (pos: number) => {
    if (pos < (1 << 11)) {
      return this.g_FastPos[pos];
    }
    if (pos < (1 << 21)) {
      return this.g_FastPos[pos >>> 10] + 20;
    }
    return this.g_FastPos[pos >>> 20] + 40;
  }

  static GetPosSlot2: (pos: number) => number = (pos: number) => {
    if (pos < (1 << 17)) {
      return this.g_FastPos[pos >>> 6] + 12;
    }
    if (pos < (1 << 27)) {
      return this.g_FastPos[pos >>> 16] + 32;
    }
    return this.g_FastPos[pos >>> 26] + 52;
  }

  _state = new State();
  _previousByte: number = 0; // !! Byte

  _repDistances: number[] = [];

  BaseInit: () => void = () => {
    this._state.Init();
    this._previousByte = 0;
    for (let i = 0; i < LZMABase.kNumRepDistances; i++) {
      this._repDistances[i] = 0;
    }
  }

  kDefaultDictionaryLogSize = 22;
  kNumFastBytesDefault = 0x20;

  kNumSpecSymbols = LZMABase.kNumLowLenSymbols + LZMABase.kNumMidLenSymbols;

  kNumOpts = 1 << 12;

  _optimum: Optimal[] = [];

  // TODO
  _matchFinder: any = null;

  _rangeEncoder: Encoder = new Encoder();

  _isMatch: BitEncoder[] = [];
  _isRep: BitEncoder[] = [];
  _isRepG0: BitEncoder[] = [];
  _isRepG1: BitEncoder[] = [];
  _isRepG2: BitEncoder[] = [];
  _isRep0Long: BitEncoder[] = [];

  _posSlotEncoder: BitTreeEncoder[] = [];

  _posEncoders: BitEncoder[] = [];
  _posAlignEncoder: BitTreeEncoder = new BitTreeEncoder(LZMABase.kNumAlignBits);

  _lenEncoder: LenPriceTableEncoder = new LenPriceTableEncoder();
  _repMatchLenEncoder: LenPriceTableEncoder = new LenPriceTableEncoder();

  _literalEncoder: LiteralEncoder = new LiteralEncoder();

  _matchDistances: Uint32Array = new Uint32Array(LZMABase.kMatchMaxLen * 2 + 2);

  _numFastBytes: number = this.kNumFastBytesDefault;
  _longestMatchLength: number = 0;
  _numDistancePairs: number = 0;

  _additionalOffset: number = 0;

  _optimumEndIndex: number = 0;
  _optimumCurrentIndex: number = 0;

  _longestMatchWasFound: boolean = false;

  _posSlotPrices: Uint32Array = new Uint32Array(1 << (LZMABase.kNumPosSlotBits + LZMABase.kNumLenToPosStatesBits));
  _distancesPrices: Uint32Array = new Uint32Array(LZMABase.kNumFullDistances << LZMABase.kNumLenToPosStatesBits);
  _alignPrices: Uint32Array = new Uint32Array(LZMABase.kAlignTableSize);
  _alignPriceCount: number = 0;

  _distTableSize: number = this.kDefaultDictionaryLogSize * 2;

  _posStateBits: number = 2;
  _posStateMask: number = 4 - 1;
  _numLiteralPosStateBits: number = 0;
  _numLiteralContextBits: number = 3;

  _dictionarySize: number = 1 << this.kDefaultDictionaryLogSize;
  _dictionarySizePrev: number = 0xFFFFFFFF;
  _numFastBytesPrev: number = 0xFFFFFFFF;

  nowPos64: number = 0;
  _finished: boolean = false;
  _inStream: Stream | null = null;

  _matchFinderType: number = EMatchFinderType.BT4;
  _writeEndMark: boolean = false;

  _needReleaseMFStream: boolean = false;

  Create: () => void = () => {
    if (this._matchFinder == null) {
      const bt = new BinTree();
      let numHashBytes = 4;
      if (this._matchFinderType == EMatchFinderType.BT2) {
        numHashBytes = 2;
      }
      bt.SetType(numHashBytes);
      this._matchFinder = bt;
    }
    this._literalEncoder.Create(this._numLiteralPosStateBits, this._numLiteralContextBits);

    if (this._dictionarySize == this._dictionarySizePrev && this._numFastBytesPrev == this._numFastBytes) {
      return;
    }
    this._matchFinder.CreateB(this._dictionarySize, this.kNumOpts, this._numFastBytes, LZMABase.kMatchMaxLen + 1);
    this._dictionarySizePrev = this._dictionarySize;
    this._numFastBytesPrev = this._numFastBytes;
  }

  constructor() {
    LZMAEncoder.Encoder();
    BitEncoder.BitEncoder();
    for (let i = 0; i < this.kNumOpts; i++) {
      this._optimum[i] = new Optimal();
    }
    for (let i = 0; i < LZMABase.kNumLenToPosStates; i++) {
      this._posSlotEncoder[i] = new BitTreeEncoder(LZMABase.kNumPosSlotBits);
    }
  }

  SetWriteEndMarkerMode: (writeEndMarker: boolean) => void = (writeEndMarker: boolean) => {
    this._writeEndMark = writeEndMarker;
  }

  Init: () => void = () => {
    this.BaseInit();
    this._rangeEncoder.Init();

    let i: number;
    for (i = 0; i < LZMABase.kNumStates; i++) {
      for (let j = 0; j <= this._posStateMask; j++) {
        const complexState = (i << LZMABase.kNumPosStatesBitsMax) + j;
        this._isMatch[complexState] = new BitEncoder();
        this._isMatch[complexState].Init();
        this._isRep0Long[complexState] = new BitEncoder();
        this._isRep0Long[complexState].Init();
      }
      this._isRep[i] = new BitEncoder();
      this._isRepG0[i] = new BitEncoder();
      this._isRepG1[i] = new BitEncoder();
      this._isRepG2[i] = new BitEncoder();

      this._isRep[i].Init();
      this._isRepG0[i].Init();
      this._isRepG1[i].Init();
      this._isRepG2[i].Init();
    }
    this._literalEncoder.Init();
    for (i = 0; i < LZMABase.kNumLenToPosStates; i++) {
      this._posSlotEncoder[i] = new BitTreeEncoder(LZMABase.kNumPosSlotBits);
      this._posSlotEncoder[i].Init();
    }
    for (i = 0; i < LZMABase.kNumFullDistances - LZMABase.kEndPosModelIndex; i++) {
      this._posEncoders[i] = new BitEncoder();
      this._posEncoders[i].Init();
    }

    this._lenEncoder.Init(1 << this._posStateBits);
    this._repMatchLenEncoder.Init(1 << this._posStateBits);

    this._posAlignEncoder.Init();

    this._longestMatchWasFound = false;
    this._optimumEndIndex = 0;
    this._optimumCurrentIndex = 0;
    this._additionalOffset = 0;
  }

  ReadMatchDistances: (lenRes: number, numDistancePairs: number) => {
    lr: number,
    nD: number
  } = (lenRes: number, numDistancePairs: number) => {
    let lenRes2 = 0;
    let nD = this._matchFinder.GetMatches(this._matchDistances);
    if (nD > 0) {
      lenRes2 = this._matchDistances[nD - 2];
      if (lenRes2 === this._numFastBytes) {
        lenRes2 += this._matchFinder.GetMatchLen(lenRes2 - 1, this._matchDistances[nD - 1], LZMABase.kMatchMaxLen - lenRes2);
      }
    }
    this._additionalOffset++;
    return {lr: lenRes2, nD};
  }

  MovePos: (num: number) => void = (num: number) => {
    if (num > 0) {
      this._matchFinder.Skip(num);
      this._additionalOffset += num;
    }
  }

  GetRepLen1Price: (state: State, posState: number) => number = (state: State, posState: number) => {
    return this._isRepG0[state.Index].GetPrice0() +
      this._isRep0Long[(state.Index << LZMABase.kNumPosStatesBitsMax) + posState].GetPrice0();
  }

  GetPureRepPrice: (repIndex: number, state: number, posState: number) => number = (repIndex: number, state: number, posState: number) => {
    let price: number;
    if (repIndex === 0) {
      price = this._isRepG0[state].GetPrice0();
      price += this._isRep0Long[(state << LZMABase.kNumPosStatesBitsMax) + posState].GetPrice1();
    } else {
      price = this._isRepG0[state].GetPrice1();
      if (repIndex === 1) {
        price += this._isRepG1[state].GetPrice0();
      } else {
        price += this._isRepG1[state].GetPrice1();
        price += this._isRepG2[state].GetPrice(repIndex - 2);
      }
    }
    return price;
  }

  GetRepPrice: (repIndex: number, len: number, state: number, posState: number) => number = (repIndex: number, len: number, state: number, posState: number) => {
    const price = this._repMatchLenEncoder.GetPrice(len - LZMABase.kMatchMinLen, posState);
    return price + this.GetPureRepPrice(repIndex, state, posState);
  }

  GetPosLenPrice: (pos: number, len: number, posState: number) => number = (pos: number, len: number, posState: number) => {
    let price: number;
    const lenToPosState = LZMABase.GetLenToPosState(len);
    if (pos < LZMABase.kNumFullDistances) {
      price = this._distancesPrices[(lenToPosState * LZMABase.kNumFullDistances) + pos];
    } else {
      price = this._posSlotPrices[(lenToPosState << LZMABase.kNumPosSlotBits) + LZMAEncoder.GetPosSlot2(pos)] +
        this._alignPrices[pos & LZMABase.kAlignMask];
    }
    return price + this._lenEncoder.GetPrice(len - LZMABase.kMatchMinLen, posState);
  }

  Backward: (cur: number) => { ret: number; backRes: number } = (cur: number) => {
    let backRes = 0;
    this._optimumEndIndex = cur;
    let posMem = this._optimum[cur].PosPrev;
    let backMem = this._optimum[cur].BackPrev;
    do {
      if (this._optimum[cur].Prev1IsChar) {
        this._optimum[posMem].MakeAsChar();
        this._optimum[posMem].PosPrev = posMem - 1;
        if (this._optimum[cur].Prev2) {
          this._optimum[posMem - 1].Prev1IsChar = false;
          this._optimum[posMem - 1].PosPrev = this._optimum[cur].PosPrev2;
          this._optimum[posMem - 1].BackPrev = this._optimum[cur].BackPrev2;
        }
      }
      const posPrev = posMem;
      const backCur = backMem;

      backMem = this._optimum[posPrev].BackPrev;
      posMem = this._optimum[posPrev].PosPrev;

      this._optimum[posPrev].BackPrev = backCur;
      this._optimum[posPrev].PosPrev = cur;
      cur = posPrev;
    } while (cur > 0);
    backRes = this._optimum[0].BackPrev;
    this._optimumCurrentIndex = this._optimum[0].PosPrev;
    return {ret: this._optimumCurrentIndex, backRes};
  }

  reps: Uint32Array = new Uint32Array(LZMABase.kNumRepDistances);
  repLens: Uint32Array = new Uint32Array(LZMABase.kNumRepDistances);

  GetOptimum: (position: number) => { ret: number, backRes: number } = (position: number) => {
    let backRes = 0;
    if (this._optimumEndIndex !== this._optimumCurrentIndex) {
      const lenRes = this._optimum[this._optimumCurrentIndex].PosPrev - this._optimumCurrentIndex;
      backRes = this._optimum[this._optimumCurrentIndex].BackPrev;
      this._optimumCurrentIndex = this._optimum[this._optimumCurrentIndex].PosPrev;
      return {ret: lenRes, backRes};
    }
    this._optimumCurrentIndex = this._optimumEndIndex = 0;

    let lenMain: number;
    let numDistancePairs: number;

    if (!this._longestMatchWasFound) {
      const result = this.ReadMatchDistances(0, 0);
      lenMain = result.lr;
      numDistancePairs = result.nD;
    } else {
      lenMain = this._longestMatchLength;
      numDistancePairs = this._numDistancePairs;
      this._longestMatchWasFound = false;
    }

    let numAvailableBytes = this._matchFinder.GetNumAvailableBytes() + 1;
    if (numAvailableBytes < 2) {
      backRes = 0xffffffff >>> 0;
      return {ret: 1, backRes};
    }

    if (numAvailableBytes > LZMABase.kMatchMaxLen) {
      numAvailableBytes = LZMABase.kMatchMaxLen;
    }

    let repMaxIndex = 0;
    let i: number;
    for (i = 0; i < LZMABase.kNumRepDistances; i++) {
      this.reps[i] = this._repDistances[i];
      this.repLens[i] = this._matchFinder.GetMatchLen(0 - 1, this.reps[i], LZMABase.kMatchMaxLen);
      if (this.repLens[i] > this.repLens[repMaxIndex]) {
        repMaxIndex = i;
      }
    }

    if (this.repLens[repMaxIndex] >= this._numFastBytes) {
      backRes = repMaxIndex;
      const lenRes = this.repLens[repMaxIndex];
      this.MovePos(lenRes - 1);
      return {ret: lenRes, backRes};
    }

    if (lenMain >= this._numFastBytes) {
      backRes = this._matchDistances[numDistancePairs - 1] + LZMABase.kNumRepDistances;
      this.MovePos(lenMain - 1);
      return {ret: lenMain, backRes};
    }

    let currentByte = this._matchFinder.GetIndexByte(0 - 1);
    let matchByte = this._matchFinder.GetIndexByte((0 - this._repDistances[0]) - 1 - 1);
    if (lenMain < 2 && currentByte !== matchByte && this.repLens[repMaxIndex] < 2) {
      backRes = 0xffffffff >>> 0;
      return {ret: 1, backRes};
    }

    this._optimum[0].State = this._state;

    let posState = position & this._posStateMask;

    this._optimum[1].Price = this._isMatch[(this._state.Index << LZMABase.kNumPosStatesBitsMax) + posState].GetPrice0() +
      this._literalEncoder.GetSubCoder(position, this._previousByte).GetPrice(!this._state.IsCharState(), matchByte, currentByte);
    this._optimum[1].MakeAsChar();

    let matchPrice = this._isMatch[(this._state.Index << LZMABase.kNumPosStatesBitsMax) + posState].GetPrice1();
    let repMatchPrice = matchPrice + this._isRep[this._state.Index].GetPrice1();

    if (matchByte === currentByte) {
      const shortRepPrice = repMatchPrice + this.GetRepLen1Price(this._state, posState);
      if (shortRepPrice < this._optimum[1].Price) {
        this._optimum[1].Price = shortRepPrice;
        this._optimum[1].MakeAsShortRep();
      }
    }

    let lenEnd = lenMain >= this.repLens[repMaxIndex] ? lenMain : this.repLens[repMaxIndex];
    if (lenEnd < 2) {
      backRes = this._optimum[1].BackPrev;
      return {ret: 1, backRes};
    }

    this._optimum[1].PosPrev = 0;

    this._optimum[0].Backs0 = this.reps[0];
    this._optimum[0].Backs1 = this.reps[1];
    this._optimum[0].Backs2 = this.reps[2];
    this._optimum[0].Backs3 = this.reps[3];

    let len = lenEnd;
    do {
      this._optimum[len--].Price = this.kIfinityPrice;
    } while (len >= 2);

    for (i = 0; i < LZMABase.kNumRepDistances; i++) {
      let repLen = this.repLens[i];
      if (repLen < 2) {
        continue;
      }
      const price = repMatchPrice + this.GetPureRepPrice(i, this._state.Index, posState);
      do {
        const curAndLenPrice = price + this._repMatchLenEncoder.GetPrice(repLen - 2, posState);
        const optimum = this._optimum[repLen];
        if (curAndLenPrice < optimum.Price) {
          optimum.Price = curAndLenPrice;
          optimum.PosPrev = 0;
          optimum.BackPrev = i;
          optimum.Prev1IsChar = false;
        }
      } while (--repLen >= 2);
    }

    let normalMatchPrice = matchPrice + this._isRep[this._state.Index].GetPrice0();

    len = this.repLens[0] >= 2 ? this.repLens[0] + 1 : 2;
    if (len <= lenMain) {
      let offs = 0;
      while (len > this._matchDistances[offs]) {
        offs += 2;
      }
      for (; ; len++) {
        const distance = this._matchDistances[offs + 1];
        const curAndLenPrice = normalMatchPrice + this.GetPosLenPrice(distance, len, posState);
        const optimum = this._optimum[len];
        if (curAndLenPrice < optimum.Price) {
          optimum.Price = curAndLenPrice;
          optimum.PosPrev = 0;
          optimum.BackPrev = distance + LZMABase.kNumRepDistances;
          optimum.Prev1IsChar = false;
        }
        if (len === this._matchDistances[offs]) {
          offs += 2;
          if (offs === numDistancePairs) {
            break;
          }
        }
      }
    }

    let cur = 0;

    while (true) {
      cur++;
      if (cur === lenEnd) {
        const r = this.Backward(cur);
        backRes = r.backRes;
        return {ret: r.ret, backRes};
      }
      let newLen;
      const r = this.ReadMatchDistances(0, numDistancePairs);
      if (r.lr >= this._numFastBytes) {
        this._numDistancePairs = r.nD;
        this._longestMatchLength = r.lr;
        this._longestMatchWasFound = true;
        newLen = r.lr;
        return {ret: newLen, backRes};
      }

      position++;
      let posPrev = this._optimum[cur].PosPrev;
      let state: State;
      if (this._optimum[cur].Prev1IsChar) {
        posPrev--;
        if (this._optimum[cur].Prev2) {
          state = this._optimum[this._optimum[cur].PosPrev2].State;
          if (this._optimum[cur].BackPrev2 < LZMABase.kNumRepDistances) {
            state.UpdateRep();
          } else {
            state.UpdateMatch();
          }
        } else {
          state = this._optimum[posPrev].State;
        }
        state.UpdateChar();
      } else {
        state = this._optimum[posPrev].State;
      }

      if (posPrev === cur - 1) {
        if (this._optimum[cur].IsShortRep()) {
          state.UpdateShortRep();
        } else {
          state.UpdateChar();
        }
      } else {
        let pos;
        if (this._optimum[cur].Prev1IsChar && this._optimum[cur].Prev2) {
          posPrev = this._optimum[cur].PosPrev2;
          pos = this._optimum[cur].BackPrev2;
          state.UpdateRep();
        } else {
          pos = this._optimum[cur].BackPrev;
          if (pos < LZMABase.kNumRepDistances) {
            state.UpdateRep();
          } else {
            state.UpdateMatch();
          }
        }
        const opt = this._optimum[posPrev];
        if (pos < LZMABase.kNumRepDistances) {
          if (pos === 0) {
            this.reps[0] = opt.Backs0;
            this.reps[1] = opt.Backs1;
            this.reps[2] = opt.Backs2;
            this.reps[3] = opt.Backs3;
          } else if (pos === 1) {
            this.reps[0] = opt.Backs1;
            this.reps[1] = opt.Backs0;
            this.reps[2] = opt.Backs2;
            this.reps[3] = opt.Backs3;
          } else if (pos === 2) {
            this.reps[0] = opt.Backs2;
            this.reps[1] = opt.Backs0;
            this.reps[2] = opt.Backs1;
            this.reps[3] = opt.Backs3;
          } else {
            this.reps[0] = opt.Backs3;
            this.reps[1] = opt.Backs0;
            this.reps[2] = opt.Backs1;
            this.reps[3] = opt.Backs2;
          }
        } else {
          this.reps[0] = pos - LZMABase.kNumRepDistances;
          this.reps[1] = opt.Backs0;
          this.reps[2] = opt.Backs1;
          this.reps[3] = opt.Backs2;
        }
      }
      this._optimum[cur].State = state;
      this._optimum[cur].Backs0 = this.reps[0];
      this._optimum[cur].Backs1 = this.reps[1];
      this._optimum[cur].Backs2 = this.reps[2];
      this._optimum[cur].Backs3 = this.reps[3];
      const curPrice = this._optimum[cur].Price;

      currentByte = this._matchFinder.GetIndexByte(0 - 1);
      matchByte = this._matchFinder.GetIndexByte(0 - this.reps[0] - 1 - 1);

      posState = position & this._posStateMask;

      const curAnd1Price = curPrice +
        this._isMatch[(state.Index << LZMABase.kNumPosStatesBitsMax) + posState].GetPrice0() +
        this._literalEncoder.GetSubCoder(position, this._matchFinder.GetIndexByte(0 - 2)).GetPrice(!state.IsCharState(), matchByte, currentByte);

      const nextOptimum = this._optimum[cur + 1];

      let nextIsChar = false;
      if (curAnd1Price < nextOptimum.Price) {
        nextOptimum.Price = curAnd1Price;
        nextOptimum.PosPrev = cur;
        nextOptimum.MakeAsChar();
        nextIsChar = true;
      }

      matchPrice = curPrice + this._isMatch[(state.Index << LZMABase.kNumPosStatesBitsMax) + posState].GetPrice1();
      repMatchPrice = matchPrice + this._isRep[state.Index].GetPrice1();

      if (matchByte === currentByte &&
        !(nextOptimum.PosPrev < cur && nextOptimum.BackPrev === 0)) {
        const shortRepPrice = repMatchPrice + this.GetRepLen1Price(state, posState);
        if (shortRepPrice <= nextOptimum.Price) {
          nextOptimum.Price = shortRepPrice;
          nextOptimum.PosPrev = cur;
          nextOptimum.MakeAsShortRep();
          nextIsChar = true;
        }
      }

      let numAvailableBytesFull = this._matchFinder.GetNumAvailableBytes() + 1;
      numAvailableBytesFull = Math.min(this.kNumOpts - 1 - cur, numAvailableBytesFull);
      numAvailableBytes = numAvailableBytesFull;

      if (numAvailableBytes < 2) {
        continue;
      }
      if (numAvailableBytes > this._numFastBytes) {
        numAvailableBytes = this._numFastBytes;
      }
      if (!nextIsChar && matchByte !== currentByte) {
        // try Literal + rep0
        const t = Math.min(numAvailableBytesFull - 1, this._numFastBytes);
        let lenTest2 = this._matchFinder.GetMatchLen(0, this.reps[0], t);
        if (lenTest2 >= 2) {
          const state2 = state;
          state2.UpdateChar();
          const posStateNext = (position + 1) & this._posStateMask;
          const nextRepMatchPrice = curAnd1Price +
            this._isMatch[(state2.Index << LZMABase.kNumPosStatesBitsMax) + posStateNext].GetPrice1() +
            this._isRep[state2.Index].GetPrice1();
          {
            const offset = cur + 1 + lenTest2;
            while (lenEnd < offset) {
              this._optimum[++lenEnd].Price = this.kIfinityPrice;
            }
            let curAndLenPrice = nextRepMatchPrice + this.GetRepPrice(
              0, lenTest2, state2.Index, posStateNext);
            let optimum = this._optimum[offset];
            if (curAndLenPrice < optimum.Price) {
              optimum.Price = curAndLenPrice;
              optimum.PosPrev = cur + 1;
              optimum.BackPrev = 0;
              optimum.Prev1IsChar = true;
              optimum.Prev2 = false;
            }
          }
        }
      }

      let startLen = 2;

      for (let repIndex = 0; repIndex < LZMABase.kNumRepDistances; repIndex++) {
        let lenTest = this._matchFinder.GetMatchLen(0 - 1, this.reps[repIndex], numAvailableBytes);
        if (lenTest < 2) {
          continue;
        }
        let lenTestTemp = lenTest;
        do {
          while (lenEnd < cur + lenTest) {
            this._optimum[++lenEnd].Price = this.kIfinityPrice;
            let curAndLenPrice = repMatchPrice + this.GetRepPrice(repIndex, lenTest, state.Index, posState);
            let optimum = this._optimum[cur + lenTest];
            if (curAndLenPrice < optimum.Price) {
              optimum.Price = curAndLenPrice;
              optimum.PosPrev = cur;
              optimum.BackPrev = repIndex;
              optimum.Prev1IsChar = false;
            }
          }
        } while (--lenTest >= 2);
        lenTest = lenTestTemp;

        if (repIndex === 0) {
          startLen = lenTest + 1;
        }

        if (lenTest < numAvailableBytesFull) {
          let t = Math.min(numAvailableBytesFull - 1 - lenTest, this._numFastBytes);
          let lenTest2 = this._matchFinder.GetMatchLen(lenTest, this.reps[repIndex], t);
          if (lenTest2 >= 2) {
            let state2 = state;
            state2.UpdateRep();
            let posStateNext = (position + lenTest) & this._posStateMask;
            let curAndLenCharPrice = repMatchPrice + this.GetRepPrice(repIndex, lenTest, state.Index, posState) +
              this._isMatch[(state2.Index << LZMABase.kNumPosStatesBitsMax) + posStateNext].GetPrice0() +
              this._literalEncoder.GetSubCoder(position + lenTest,
                this._matchFinder.GetIndexByte(lenTest - 1 - 1)).GetPrice(true,
                this._matchFinder.GetIndexByte(lenTest - 1 - (this.reps[repIndex] + 1)),
                this._matchFinder.GetIndexByte(lenTest - 1));
            state2.UpdateChar();
            posStateNext = (position + lenTest + 1) & this._posStateMask;
            let nextMatchPrice = curAndLenCharPrice + this._isMatch[(state2.Index << LZMABase.kNumPosStatesBitsMax) + posStateNext].GetPrice1();
            let nextRepMatchPrice = nextMatchPrice + this._isRep[state2.Index].GetPrice1();

            let offset = lenTest + 1 + lenTest2;
            while (lenEnd < cur + offset) {
              this._optimum[++lenEnd].Price = this.kIfinityPrice;
            }
            let curAndLenPrice = nextRepMatchPrice + this.GetRepPrice(0, lenTest2, state2.Index, posStateNext);
            let optimum = this._optimum[cur + offset];
            if (curAndLenPrice < optimum.Price) {
              optimum.Price = curAndLenPrice;
              optimum.PosPrev = cur + lenTest + 1;
              optimum.BackPrev = 0;
              optimum.Prev1IsChar = true;
              optimum.Prev2 = true;
              optimum.PosPrev2 = cur;
              optimum.BackPrev2 = repIndex;
            }
          }
        }
      }

      if (newLen > numAvailableBytes) {
        newLen = numAvailableBytes;
        for (numDistancePairs = 0; newLen > this._matchDistances[numDistancePairs]; numDistancePairs += 2) ;
        this._matchDistances[numDistancePairs] = newLen;
        numDistancePairs += 2;
      }

      if (newLen >= startLen) {
        normalMatchPrice = matchPrice + this._isRep[state.Index].GetPrice0();
        while (lenEnd < cur + newLen) {
          this._optimum[++lenEnd].Price = this.kIfinityPrice;
        }

        let offs = 0;
        while (startLen > this._matchDistances[offs]) {
          offs += 2;
        }

        for (let lenTest = startLen; ; lenTest++) {
          let curBack = this._matchDistances[offs + 1];
          let curAndLenPrice = normalMatchPrice + this.GetPosLenPrice(curBack, lenTest, posState);
          let optimum = this._optimum[cur + lenTest];
          if (curAndLenPrice < optimum.Price) {
            optimum.Price = curAndLenPrice;
            optimum.PosPrev = cur;
            optimum.BackPrev = curBack + LZMABase.kNumRepDistances;
            optimum.Prev1IsChar = false;
          }

          if (lenTest === this._matchDistances[offs]) {
            if (lenTest < numAvailableBytesFull) {
              let t = Math.min(numAvailableBytesFull - 1 - lenTest, this._numFastBytes);
              let lenTest2 = this._matchFinder.GetMatchLen(lenTest, curBack, t);
              if (lenTest2 >= 2) {
                let state2 = state;
                state2.UpdateMatch();
                let posStateNext = (position + lenTest) & this._posStateMask;
                let curAndLenCharPrice = curAndLenPrice + this._isMatch[(state2.Index << LZMABase.kNumPosStatesBitsMax) + posStateNext].GetPrice0() +
                  this._literalEncoder.GetSubCoder(position + lenTest,
                    this._matchFinder.GetIndexByte(lenTest - 1 - 1)).GetPrice(true,
                    this._matchFinder.GetIndexByte(lenTest - (curBack + 1) - 1),
                    this._matchFinder.GetIndexByte(lenTest - 1));
                state2.UpdateChar();
                posStateNext = (position + lenTest + 1) & this._posStateMask;
                let nextMatchPrice = curAndLenCharPrice + this._isMatch[(state2.Index << LZMABase.kNumPosStatesBitsMax) + posStateNext].GetPrice1();
                let nextRepMatchPrice = nextMatchPrice + this._isRep[state2.Index].GetPrice1();

                let offset = lenTest + 1 + lenTest2;
                while (lenEnd < cur + offset) {
                  this._optimum[++lenEnd].Price = this.kIfinityPrice;
                }
                curAndLenPrice = nextRepMatchPrice + this.GetRepPrice(0, lenTest2, state2.Index, posStateNext);
                optimum = this._optimum[cur + offset];
                if (curAndLenPrice < optimum.Price) {
                  optimum.Price = curAndLenPrice;
                  optimum.PosPrev = cur + lenTest + 1;
                  optimum.BackPrev = 0;
                  optimum.Prev1IsChar = true;
                  optimum.Prev2 = true;
                  optimum.PosPrev2 = cur;
                  optimum.BackPrev2 = curBack + LZMABase.kNumRepDistances;
                }
              }
            }
            offs += 2;
            if (offs === numDistancePairs) {
              break;
            }
          }
        }
      }
    }
  }

  ChangePair: (smallDist: number, bigDist: number) => boolean = (smallDist: number, bigDist: number): boolean => {
    const kDif = 7;
    return (smallDist < (1 << (32 - kDif)) && bigDist >= (smallDist << kDif));
  }

  WriteEndMarker: (posState: number) => void = (posState: number): void => {
    if (!this._writeEndMark) {
      return;
    }

    this._isMatch[(this._state.Index << LZMABase.kNumPosStatesBitsMax) + posState].Encode(this._rangeEncoder, 1);
    this._isRep[this._state.Index].Encode(this._rangeEncoder, 0);
    this._state.UpdateMatch();
    let len = LZMABase.kMatchMinLen;
    this._lenEncoder.Encode(this._rangeEncoder, len - LZMABase.kMatchMinLen, posState);
    let posSlot = (1 << LZMABase.kNumPosSlotBits) - 1;
    let lenToPosState = LZMABase.GetLenToPosState(len);
    this._posSlotEncoder[lenToPosState].Encode(this._rangeEncoder, posSlot);
    let footerBits = 30;
    let posReduced = ((1 << footerBits) - 1) >>> 0;
    this._rangeEncoder.EncodeDirectBits(posReduced >> LZMABase.kNumAlignBits, footerBits - LZMABase.kNumAlignBits);
    this._posAlignEncoder.ReverseEncode(this._rangeEncoder, posReduced & LZMABase.kAlignMask);
  }

  Flush: (nowPos: number) => void = (nowPos: number): void => {
    this.ReleaseMFStream();
    this.WriteEndMarker(nowPos & this._posStateMask);
    this._rangeEncoder.FlushData();
    this._rangeEncoder.FlushStream();
  }

  CodeOneBlock: (i: number, o: number, finished: boolean) => {
    inSize: number,
    outSize: number,
    finished: boolean
  } = (i: number, o: number, f: boolean) => {
    let inSize = 0
    let outSize = 0
    let finished = true

    if (this._inStream !== null) {
      this._matchFinder.SetStream(this._inStream);
      this._matchFinder.Init();
      this._needReleaseMFStream = true;
      this._inStream = null;
      if (this._trainSize > 0) {
        this._matchFinder.Skip(this._trainSize);
      }
    }

    if (this._finished) {
      return {inSize: inSize, outSize: outSize, finished};
    }
    this._finished = true;

    let progressPosValuePrev = this.nowPos64;
    if (this.nowPos64 === 0) {
      if (this._matchFinder.GetNumAvailableBytes() === 0) {
        this.Flush((<number>this.nowPos64) & this._posStateMask);
        return {inSize: inSize, outSize: outSize, finished};
      }

      const r = this.ReadMatchDistances(0, 0);
      let posState = (<number>this.nowPos64) & this._posStateMask;
      this._isMatch[(this._state.Index << LZMABase.kNumPosStatesBitsMax) + posState].Encode(this._rangeEncoder, 0);
      this._state.UpdateChar();
      let curByte = this._matchFinder.GetIndexByte(0 - this._additionalOffset);
      this._literalEncoder.GetSubCoder(this.nowPos64, this._previousByte).Encode(this._rangeEncoder, curByte);
      this._previousByte = curByte;
      this._additionalOffset--;
      this.nowPos64++;
    }
    if (this._matchFinder.GetNumAvailableBytes() === 0) {
      this.Flush(this.nowPos64);
      return {inSize: inSize, outSize: outSize, finished};
    }

    while (true) {
      const r = this.GetOptimum(this.nowPos64);
      let pos = r.backRes
      let len = r.ret

      let posState = (<number>this.nowPos64) & this._posStateMask;
      let complexState = (this._state.Index << LZMABase.kNumPosStatesBitsMax) + posState;
      if (len === 1 && pos === 0xFFFFFFFF) {
        this._isMatch[complexState].Encode(this._rangeEncoder, 0);
        let curByte = this._matchFinder.GetIndexByte(0 - this._additionalOffset);
        let subCoder = this._literalEncoder.GetSubCoder(this.nowPos64, this._previousByte);
        if (!this._state.IsCharState()) {
          let matchByte = this._matchFinder.GetIndexByte(0 - this._repDistances[0] - 1 - this._additionalOffset);
          subCoder.EncodeMatched(this._rangeEncoder, matchByte, curByte);
        } else {
          subCoder.Encode(this._rangeEncoder, curByte);
        }
        this._previousByte = curByte;
        this._state.UpdateChar();
      } else {
        this._isMatch[complexState].Encode(this._rangeEncoder, 1);
        if (pos < LZMABase.kNumRepDistances) {
          this._isRep[this._state.Index].Encode(this._rangeEncoder, 1);
          if (pos === 0) {
            this._isRepG0[this._state.Index].Encode(this._rangeEncoder, 0);
            if (len === 1) {
              this._isRep0Long[complexState].Encode(this._rangeEncoder, 0);
            } else {
              this._isRep0Long[complexState].Encode(this._rangeEncoder, 1);
            }
          } else {
            this._isRepG0[this._state.Index].Encode(this._rangeEncoder, 1);
            if (pos === 1) {
              this._isRepG1[this._state.Index].Encode(this._rangeEncoder, 0);
            } else {
              this._isRepG1[this._state.Index].Encode(this._rangeEncoder, 1);
              this._isRepG2[this._state.Index].Encode(this._rangeEncoder, pos - 2);
            }
          }
          if (len === 1) {
            this._state.UpdateShortRep();
          } else {
            this._repMatchLenEncoder.Encode(this._rangeEncoder, len - LZMABase.kMatchMinLen, posState);
            this._state.UpdateRep();
          }
          let distance = this._repDistances[pos];
          if (pos !== 0) {
            for (let i = pos; i >= 1; i--) {
              this._repDistances[i] = this._repDistances[i - 1];
            }
            this._repDistances[0] = distance;
          }
        } else {
          this._isRep[this._state.Index].Encode(this._rangeEncoder, 0);
          this._state.UpdateMatch();
          this._lenEncoder.Encode(this._rangeEncoder, len - LZMABase.kMatchMinLen, posState);
          pos -= LZMABase.kNumRepDistances;
          let posSlot = LZMAEncoder.GetPosSlot(pos);
          let lenToPosState = LZMABase.GetLenToPosState(len);
          this._posSlotEncoder[lenToPosState].Encode(this._rangeEncoder, posSlot);
          if (posSlot >= LZMABase.kStartPosModelIndex) {
            let footerBits = ((posSlot >>> 1) - 1);
            let baseVal = ((2 | (posSlot & 1)) << footerBits);
            let posReduced = pos - baseVal;
            if (posSlot < LZMABase.kEndPosModelIndex) {
              BitTreeEncoder.ReverseEncode(this._posEncoders, baseVal - posSlot - 1, this._rangeEncoder, footerBits, posReduced);
            } else {
              this._rangeEncoder.EncodeDirectBits(posReduced >>> LZMABase.kNumAlignBits, footerBits - LZMABase.kNumAlignBits);
              this._posAlignEncoder.ReverseEncode(this._rangeEncoder, posReduced & LZMABase.kAlignMask);
              this._alignPriceCount++;
            }
          }
          let distance = pos;
          for (let i = LZMABase.kNumRepDistances - 1; i >= 1; i--) {
            this._repDistances[i] = this._repDistances[i - 1];
          }
          this._repDistances[0] = distance;
          this._matchPriceCount++;
        }
        this._previousByte = this._matchFinder.GetIndexByte(len - 1 - this._additionalOffset);
      }
      this._additionalOffset -= len;
      this.nowPos64 += len;
      if (this._additionalOffset === 0) {
        if (this._matchPriceCount >= (1 << 7)) {
          this.FillDistancesPrices();
        }
        if (this._alignPriceCount >= LZMABase.kAlignTableSize) {
          this.FillAlignPrices();
        }
        inSize = this.nowPos64;
        outSize = this._rangeEncoder.GetProcessedSizeAdd();
        if (this._matchFinder.GetNumAvailableBytes() === 0) {
          this.Flush(this.nowPos64);
          return {inSize: inSize, outSize: outSize, finished};
        }
        if (this.nowPos64 - progressPosValuePrev >= (1 << 12)) {
          this._finished = false;
          finished = false;
          return {inSize: inSize, outSize: outSize, finished};
        }
      }
    }
  }

  ReleaseMFStream: () => void = () => {
    if (this._matchFinder && this._needReleaseMFStream) {
      this._matchFinder.ReleaseStream();
      this._needReleaseMFStream = false;
    }
  }

  SetOutStream: (outStream: Stream) => void = (outStream) => {
    this._rangeEncoder.SetStream(outStream);
  }

  ReleaseOutStream: () => void = () => {
    this._rangeEncoder.ReleaseStream();
  }

  ReleaseStreams: () => void = () => {
    this.ReleaseMFStream();
    this.ReleaseOutStream();
  }

  SetStreams: (inStream: Stream, outStream: Stream, inSize: number, outSize: number) => void = (inStream, outStream, inSize, outSize) => {
    this._inStream = inStream;
    this._finished = false;
    this.Create();
    this.SetOutStream(outStream);
    this.Init();

    this.FillDistancesPrices();
    this.FillAlignPrices();

    this._lenEncoder.SetTableSize(this._numFastBytes + 1 - LZMABase.kMatchMinLen);
    this._lenEncoder.UpdateTables(1 << this._posStateBits);
    this._repMatchLenEncoder.SetTableSize(this._numFastBytes + 1 - LZMABase.kMatchMinLen);
    this._repMatchLenEncoder.UpdateTables(1 << this._posStateBits);

    this.nowPos64 = 0;
  }

  Code: (inStream: Stream, outStream: Stream, inSize: number, outSize: number, progress: any) => void = (inStream, outStream, inSize, outSize, progress) => {
    this._needReleaseMFStream = false;
    try {
      this.SetStreams(inStream, outStream, inSize, outSize);
      while (true) {

        let progressRes = this.CodeOneBlock(0, 0, false);
        if (progressRes.finished) {
          return;
        }
        if (progress) {
          progress.SetProgress(progressRes.inSize, progressRes.outSize);
        }
      }
    } finally {
      this.ReleaseStreams();
    }
  }

  kPropSize = 5;
  properties: Uint8Array = new Uint8Array(this.kPropSize);

  WriteCoderProperties: (outStream: Stream) => void = (outStream) => {
    this.properties[0] = ((this._posStateBits * 5 + this._numLiteralPosStateBits) * 9 + this._numLiteralContextBits);
    for (let i = 0; i < 4; i++) {
      this.properties[1 + i] = (this._dictionarySize >>> (8 * i));
    }
    outStream.Write(this.properties, 0, this.kPropSize);
  }

  tmpPrices: Uint32Array = new Uint32Array(LZMABase.kNumFullDistances);
  _matchPriceCount: number = 0;

  FillDistancesPrices: () => void = () => {
    for (let i = LZMABase.kStartPosModelIndex; i < LZMABase.kNumFullDistances; i++) {
      let posSlot = LZMAEncoder.GetPosSlot(i);
      let footerBits = ((posSlot >>> 1) - 1);
      let baseVal = ((2 | (posSlot & 1)) << footerBits);
      this.tmpPrices[i] = BitTreeEncoder.ReverseGetPrice(this._posEncoders, baseVal - posSlot - 1, footerBits, i - baseVal);
    }
    for (let lenToPosState = 0; lenToPosState < LZMABase.kNumLenToPosStates; lenToPosState++) {
      let encoder = this._posSlotEncoder[lenToPosState];
      let st = (lenToPosState << LZMABase.kNumPosSlotBits);
      for (let posSlot = 0; posSlot < this._distTableSize; posSlot++) {
        this._posSlotPrices[st + posSlot] = encoder.GetPrice(posSlot);
      }
      for (let posSlot = LZMABase.kEndPosModelIndex; posSlot < this._distTableSize; posSlot++) {
        this._posSlotPrices[st + posSlot] += ((((posSlot >>> 1) - 1) - LZMABase.kNumAlignBits) << BitEncoder.kNumBitPriceShiftBits);
      }
      let st2 = (lenToPosState * LZMABase.kNumFullDistances);
      let i = 0;
      for (; i < LZMABase.kStartPosModelIndex; i++) {
        this._distancesPrices[st2 + i] = this._posSlotPrices[st + i];
      }
      for (; i < LZMABase.kNumFullDistances; i++) {
        this._distancesPrices[st2 + i] = this._posSlotPrices[st + LZMAEncoder.GetPosSlot(i)] + this.tmpPrices[i];
      }
    }
    this._matchPriceCount = 0;
  }

  FillAlignPrices: () => void = () => {
    for (let i = 0; i < LZMABase.kAlignTableSize; i++) {
      this._alignPrices[i] = this._posAlignEncoder.ReverseGetPrice(i);
    }
    this._alignPriceCount = 0;
  }

  kMatchFinderIDs: any[] = [
    {name: "BT2"},
    {name: "BT4"},
  ]

  FindMatchFinder: (name: string) => any = (name) => {
    for (let m = 0; m < this.kMatchFinderIDs.length; m++) {
      let info = this.kMatchFinderIDs[m];
      if (info.name === name) {
        return info;
      }
    }
  }

  SetCoderProperties: (propIDs: CoderPropID[], properties: any) => void = (propIDs, properties) => {
    for (let i = 0; i < properties.length; i++) {
      let prop = properties[i];
      switch (propIDs[i]) {
        case CoderPropID.NumFastBytes: {
          if (prop < 5 || prop > LZMABase.kMatchMaxLen) {
            throw new Error("Unsupported prop");
          }
          this._numFastBytes = prop;
          break;
        }
        case CoderPropID.Algorithm: {
          break;
        }
        case CoderPropID.MatchFinder: {
          // TODO ???
          console.log(prop)
          let m = this.FindMatchFinder(prop.toString());
          if (!m) {
            throw new Error("Unsupported prop");
          }
          this._matchFinderType = m;
          if(this._matchFinder) {
            this._dictionarySizePrev = -1;
            this._matchFinder = null;
          }
          break;
        }
        case CoderPropID.DictionarySize: {
          const kDicLogSizeMaxCompress: number = 30;
          let dictionarySize: number = prop;
          if (dictionarySize < (1 << LZMABase.kDicLogSizeMin) ||
            dictionarySize > (1 << kDicLogSizeMaxCompress)) {
            throw new Error("Unsupported prop");
          }
          this._dictionarySize = dictionarySize;
          let dicLogSize: number = 0;
          while (dictionarySize > (1 << dicLogSize)) {
            dicLogSize++;
          }
          this._distTableSize = dicLogSize * 2;
          break;
        }
        case CoderPropID.PosStateBits: {
          let v = prop;
          if (v < 0 || v > LZMABase.kNumPosStatesBitsEncodingMax) {
            throw new Error("Unsupported prop");
          }
          this._posStateBits = v;
          this._posStateMask = ((1) << (this._posStateBits)) - 1;
          break;
        }
        case CoderPropID.LitContextBits: {
          let v = prop;
          if (v < 0 || v > LZMABase.kNumLitContextBitsMax) {
            throw new Error("Unsupported prop");
          }
          this._numLiteralContextBits = v;
          break;
        }
        case CoderPropID.LitPosBits: {
          let v = prop;
          if (v < 0 || v > LZMABase.kNumLitPosStatesBitsEncodingMax) {
            throw new Error("Unsupported prop");
          }
          this._numLiteralPosStateBits = v;
          break;
        }
        case CoderPropID.EndMarker: {
          this.SetWriteEndMarkerMode(!!prop);
          break;
        }
        default: {
          throw new Error("Unsupported prop");
        }
      }
    }
  }

  _trainSize: number = 0;

  setTrainSize: (trainSize: number) => void = (trainSize) => {
    this._trainSize = trainSize;
  }
}

export enum CoderPropID
{
  DefaultProp = 0,
  DictionarySize,
  UsedMemorySize,
  Order,
  BlockSize,
  PosStateBits,
  LitContextBits,
  LitPosBits,
  NumFastBytes,
  MatchFinder,
  MatchFinderCycles,
  NumPasses,
  Algorithm,
  NumThreads,
  EndMarker
};