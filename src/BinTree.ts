import {InWindow} from "./InWindow";
import {Stream} from "./Stream";
import {CRC} from "./CRC";

export class BinTree extends InWindow {
  _cyclicBufferPos: number = 0;
  _cyclicBufferSize: number = 0;
  _matchMaxLen: number = 0;

  _son: Uint32Array = new Uint32Array(0);
  _hash: Uint32Array = new Uint32Array(0);

  _cutValue: number = 0xFF;
  _hashMask: number = 0;
  _hashSizeSum: number = 0;

  HASH_ARRAY: boolean = true;

  kHash2Size: number = 1 << 10;
  kHash3Size: number = 1 << 16;
  kBT2HashSize: number = 1 << 16;
  kStartMaxLen: number = 1;
  kHash3Offset: number = this.kHash2Size;
  kEmptyHashValue: number = 0;
  kMaxValForNormalize: number = ((1 << 31) - 1) >>> 0;

  kNumHashDirectBytes: number = 0;
  kMinMatchCheck: number = 4;
  kFixHashSize: number = this.kHash2Size + this.kHash3Size;

  constructor() {
    new CRC()
    super();
  }

  SetType: (numHashBytes: number) => void = (numHashBytes: number) => {
    this.HASH_ARRAY = (numHashBytes > 2);
    if (this.HASH_ARRAY) {
      this.kNumHashDirectBytes = 0;
      this.kMinMatchCheck = 4;
      this.kFixHashSize = this.kHash2Size + this.kHash3Size;
    } else {
      this.kNumHashDirectBytes = 2;
      this.kMinMatchCheck = 2 + 1;
      this.kFixHashSize = 0;
    }
  }

  SetStream: (stream: Stream) => void = (stream: Stream) => {
    this.SetStreamP(stream);
  }

  ReleaseStream: () => void = () => {
    this.ReleaseStreamP();
  }

  Init: () => void = () => {
    this.InitP();
    for (let i = 0; i < this._hashSizeSum; i++) {
      this._hash[i] = this.kEmptyHashValue;
    }
    this._cyclicBufferPos = 0;
    this.ReduceOffsets(-1);
  }

  MovePos: () => void = () => {
    if (++this._cyclicBufferPos >= this._cyclicBufferSize) {
      this._cyclicBufferPos = 0;
    }
    this.MovePosP();
    if (this._pos == this.kMaxValForNormalize) {
      this.Normalize();
    }
  }

  // GetIndexByte: (index: number) => number = (index: number) => {
  //   return super.GetIndexByte(index);
  // }
  //
  // GetMatchLen: (index: number, distance: number, limit: number) => number = (index: number, distance: number, limit: number) => {
  //   return super.GetMatchLen(index, distance, limit);
  // }

  // GetNumAvailableBytes: () => number = () => {
  //   return this.GetNumAvailableBytes();
  // }

  CreateB: (historySize: number, keepAddBufferBefore: number, matchMaxLen: number, keepAddBufferAfter: number) => void = (historySize: number, keepAddBufferBefore: number, matchMaxLen: number, keepAddBufferAfter: number) => {
    if (historySize > this.kMaxValForNormalize - 256) {
      throw new Error("historySize > kMaxValForNormalize - 256");
    }
    this._cutValue = 16 + (matchMaxLen >> 1);

    const windowReservSize: number = Math.floor((historySize + keepAddBufferBefore + matchMaxLen + keepAddBufferAfter) / 2) + 256;

    this.Create(historySize + keepAddBufferBefore, matchMaxLen + keepAddBufferAfter, windowReservSize);

    this._matchMaxLen = matchMaxLen;

    const cyclicBufferSize: number = historySize + 1;
    if (this._cyclicBufferSize !== cyclicBufferSize) {
      this._son = new Uint32Array((this._cyclicBufferSize = cyclicBufferSize) * 2);
    }

    let hs: number = this.kBT2HashSize;
    if (this.HASH_ARRAY) {
      hs = historySize - 1;
      hs |= (hs >> 1);
      hs |= (hs >> 2);
      hs |= (hs >> 4);
      hs |= (hs >> 8);
      hs >>= 1;
      hs |= 0xFFFF;
      if (hs > (1 << 24)) {
        hs >>= 1;
      }
      this._hashMask = hs;
      hs++;
      hs += this.kFixHashSize;
    }
    if (hs !== this._hashSizeSum) {
      this._hash = new Uint32Array((this._hashSizeSum = hs));
    }
  }

  GetMatches: (distances: Uint32Array) => number = (distances: Uint32Array) => {
    let lenlimit
    if (this._pos + this._matchMaxLen <= this._streamPos) {
      lenlimit = this._matchMaxLen;
    } else {
      lenlimit = this._streamPos - this._pos;
      if (lenlimit < this.kMinMatchCheck) {
        this.MovePos();
        return 0;
      }
    }

    let offset = 0;
    let matchMinPos = (this._pos > this._cyclicBufferSize) ? (this._pos - this._cyclicBufferSize) : 0;
    let cur = this._bufferOffset + this._pos;
    let maxLen = this.kStartMaxLen; // to avoid items for len < hashSize;
    let hashValue;
    let hash2Value = 0;
    let hash3Value = 0;

    if (this.HASH_ARRAY) {
      let temp = ((CRC.Table[this._bufferBase[cur]] >>> 0) ^ this._bufferBase[cur + 1]) >>> 0;
      hash2Value = temp & (this.kHash2Size - 1);
      temp = (temp ^ ((this._bufferBase[cur + 2] << 8))) >>> 0;
      hash3Value = temp & (this.kHash3Size - 1);
      hashValue = (temp ^ (CRC.Table[this._bufferBase[cur + 3]] << 5)) & this._hashMask;
    } else {
      hashValue = this._bufferBase[cur] ^ ((this._bufferBase[cur + 1]) << 8);
    }

    let curMatch = this._hash[this.kFixHashSize + hashValue];
    if (this.HASH_ARRAY) {
      let curMatch2 = this._hash[hash2Value];
      let curMatch3 = this._hash[this.kHash3Offset + hash3Value];
      this._hash[hash2Value] = this._pos;
      this._hash[this.kHash3Offset + hash3Value] = this._pos;
      if (curMatch2 > matchMinPos) {
        if (this._bufferBase[this._bufferOffset + curMatch2] === this._bufferBase[cur]) {
          distances[offset++] = maxLen = 2;
          distances[offset++] = this._pos - curMatch2 - 1;
        }
      }
      if (curMatch3 > matchMinPos) {
        if (this._bufferBase[this._bufferOffset + curMatch3] === this._bufferBase[cur]) {
          if (curMatch3 === curMatch2) {
            offset -= 2;
          }
          distances[offset++] = maxLen = 3;
          distances[offset++] = this._pos - curMatch3 - 1;
          curMatch2 = curMatch3;
        }
      }
      if (offset !== 0 && curMatch2 === curMatch) {
        offset -= 2;
        maxLen = this.kStartMaxLen;
      }
    }

    this._hash[this.kFixHashSize + hashValue] = this._pos;

    let ptr0 = (this._cyclicBufferPos << 1) + 1;
    let ptr1 = (this._cyclicBufferPos << 1);

    let len0 = this.kNumHashDirectBytes
    let len1 = len0

    if (this.kNumHashDirectBytes !== 0) {
      if (curMatch > matchMinPos) {
        if (this._bufferBase[this._bufferOffset + curMatch + this.kNumHashDirectBytes] !== this._bufferBase[cur + this.kNumHashDirectBytes]) {
          distances[offset++] = maxLen = this.kNumHashDirectBytes;
          distances[offset++] = this._pos - curMatch - 1;
        }
      }
    }

    let count = this._cutValue;

    while (true) {
      if (curMatch <= matchMinPos || count-- === 0) {
        this._son[ptr0] = this._son[ptr1] = this.kEmptyHashValue;
        break;
      }
      let delta = this._pos - curMatch;
      let cyclicPos = ((delta <= this._cyclicBufferPos) ? (this._cyclicBufferPos - delta) : (this._cyclicBufferPos - delta + this._cyclicBufferSize)) << 1;

      let pby1 = this._bufferOffset + curMatch;
      let len = Math.min(len0, len1);
      if (this._bufferBase[pby1 + len] === this._bufferBase[cur + len]) {
        while (++len !== lenlimit) {
          if (this._bufferBase[pby1 + len] !== this._bufferBase[cur + len]) {
            break;
          }
        }
        if (maxLen < len) {
          distances[offset++] = maxLen = len;
          distances[offset++] = delta - 1;
          if (len === lenlimit) {
            this._son[ptr1] = this._son[cyclicPos];
            this._son[ptr0] = this._son[cyclicPos + 1];
            break;
          }
        }
      }
      if (this._bufferBase[pby1 + len] < this._bufferBase[cur + len]) {
        this._son[ptr1] = curMatch;
        ptr1 = cyclicPos + 1;
        curMatch = this._son[ptr1];
        len1 = len;
      } else {
        this._son[ptr0] = curMatch;
        ptr0 = cyclicPos;
        curMatch = this._son[ptr0];
        len0 = len;
      }
    }
    this.MovePos();
    return offset;
  }

  Skip: (num: number) => void = (num: number) => {
    do {
      let lenLimit
      if (this._pos + this._matchMaxLen <= this._streamPos) {
        lenLimit = this._matchMaxLen;
      } else {
        lenLimit = this._streamPos - this._pos;
        if (lenLimit < this.kMinMatchCheck) {
          this.MovePos();
          continue;
        }
      }

      let matchMinPos = (this._pos > this._cyclicBufferSize) ? (this._pos - this._cyclicBufferSize) : 0;
      let cur = this._bufferOffset + this._pos;

      let hashValue;

      if (this.HASH_ARRAY) {
        let temp = CRC.Table[this._bufferBase[cur]] ^ this._bufferBase[cur + 1];
        let hash2Value = temp & (this.kHash2Size - 1);
        this._hash[hash2Value] = this._pos;
        temp ^= ((this._bufferBase[cur + 2] << 8) ^ this._bufferBase[cur + 3]);
        let hash3Value = temp & (this.kHash3Size - 1);
        this._hash[this.kHash3Offset + hash3Value] = this._pos;
        hashValue = (temp ^ (CRC.Table[this._bufferBase[cur + 4]] << 5)) & this._hashMask;
      } else {
        hashValue = this._bufferBase[cur] ^ ((this._bufferBase[cur + 1]) << 8);
      }

      let curMatch = this._hash[this.kFixHashSize + hashValue];
      this._hash[this.kFixHashSize + hashValue] = this._pos;

      let ptr0 = (this._cyclicBufferPos << 1) + 1;
      let ptr1 = (this._cyclicBufferPos << 1);

      let len0 = this.kNumHashDirectBytes
      let len1 = len0

      let count = this._cutValue;

      while (true) {
        if (curMatch <= matchMinPos || count-- === 0) {
          this._son[ptr0] = this._son[ptr1] = this.kEmptyHashValue;
          break;
        }
        let delta = this._pos - curMatch;
        let cyclicPos = ((delta <= this._cyclicBufferPos) ? (this._cyclicBufferPos - delta) : (this._cyclicBufferPos - delta + this._cyclicBufferSize)) << 1;

        let pby1 = this._bufferOffset + curMatch;
        let len = Math.min(len0, len1);
        if (this._bufferBase[pby1 + len] === this._bufferBase[cur + len]) {
          while (++len !== lenLimit) {
            if (this._bufferBase[pby1 + len] !== this._bufferBase[cur + len]) {
              break;
            }
          }
          if (len === lenLimit) {
            this._son[ptr1] = this._son[cyclicPos];
            this._son[ptr0] = this._son[cyclicPos + 1];
            break;
          }
        }
        if (this._bufferBase[pby1 + len] < this._bufferBase[cur + len]) {
          this._son[ptr1] = curMatch;
          ptr1 = cyclicPos + 1;
          curMatch = this._son[ptr1];
          len1 = len;
        } else {
          this._son[ptr0] = curMatch;
          ptr0 = cyclicPos;
          curMatch = this._son[ptr0];
          len0 = len;
        }
      }
    }
    while (--num !== 0);
  }

  NormalizeLinks: (items: Uint32Array, numItems: number, subValue: number) => void = (items: Uint32Array, numItems: number, subValue: number) => {
    for (let i = 0; i < numItems; i++) {
      let value = items[i];
      if (value <= subValue) {
        value = this.kEmptyHashValue;
      } else {
        value -= subValue;
      }
      items[i] = value;
    }
  }

  Normalize: () => void = () => {
    let subValue = this._pos - this._cyclicBufferSize;
    this.NormalizeLinks(this._son, this._cyclicBufferSize * 2, subValue);
    this.NormalizeLinks(this._hash, this._hashSizeSum, subValue);
    this.ReduceOffsets(subValue);
  }

  SetCutValue: (cutValue: number) => void = (cutValue: number) => {
    this._cutValue = cutValue;
  }
}