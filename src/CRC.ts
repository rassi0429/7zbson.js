export class CRC {

  static Table: Uint32Array
  constructor() {
    CRC.Table = new Uint32Array(256);
    const kPoly: number = 0xEDB88320;

    for (let i = 0; i < 256; i++) {
      let r = i;
      for (let j = 0; j < 8; j++) {
        if ((r & 1) !== 0) {
          r = ((r >>> 1) ^ kPoly) >>> 0;
        } else {
          r >>>= 1;
        }
      }
      CRC.Table[i] = r >>> 0;
    }
  }

  _value = 0xFFFFFFFF;

  Init: () => void = () => {
    this._value = 0xFFFFFFFF;
  }

  UpdateByte: (b: number) => void = (b: number) => {
    this._value = CRC.Table[(this._value ^ b) & 0xFF] ^ (this._value >>> 8);
  }

  Update: (data: Uint8Array, off: number, size: number) => void = (data: Uint8Array, off: number, size: number) => {
    for (let i = 0; i < size; i++) {
      this._value = CRC.Table[(this._value ^ data[off + i]) & 0xFF] ^ (this._value >>> 8);
    }
  }

  GetDigest: () => number = () => {
    return this._value ^ 0xFFFFFFFF;
  }

  static ComputeDigest: (data: Uint8Array, off: number, size: number) => number = (data: Uint8Array, off: number, size: number) => {
    const crc = new CRC();
    crc.Update(data, off, size);
    return crc.GetDigest();
  }

  VerifyDigest: (digest: number, data: Uint8Array, off: number, size: number) => boolean = (digest: number, data: Uint8Array, off: number, size: number) => {
    return CRC.ComputeDigest(data, off, size) === digest;
  }
}