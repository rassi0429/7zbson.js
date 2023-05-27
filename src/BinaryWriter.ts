import {State} from "./LZMADecoder";
import {Stream} from "./Stream";

export class BinaryWriter {
  _stream: Stream;

  constructor(stream: Stream) {
    this._stream = stream
  }

  Write: (value: number) => void = (value: number) => {
    // write 8 bytes
    this._stream.WriteLongLong(value)
  }
}