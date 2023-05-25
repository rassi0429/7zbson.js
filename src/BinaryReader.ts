import {Stream} from "./Stream";

export class BinaryReader {
  _stream: Stream;
  constructor(inStream: Stream) {
    this._stream = inStream;
  }
  ReadInt64(): number {
    let result = 0;
    for (let i = 0; i < 8; i++) {
      result |= this._stream.ReadByte() << (8 * i);
    }
    return result;
  }
}