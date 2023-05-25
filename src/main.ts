import {Stream} from "./Stream";
import {Decoder} from "./RangeCoder";
import {LZMADecoder} from "./LZMADecoder";
import fs from "fs/promises"
import {BinaryReader} from "./BinaryReader";
import {BSON, EJSON} from "bson"

class Main {

  async Decompress() {
    const start = new Date().getTime()
    const data = await fs.readFile("MultiTool.7zbson")
    const inStream = new Stream(new Uint8Array(data))

    let numArray = new Uint8Array(5);
    if (inStream.Read3(numArray, 0, 5) != 5)
      throw new Error("input .lzma is too short");

    let decoder = new LZMADecoder();
    decoder.SetDecoderProperties(numArray);


    const binaryReader = new BinaryReader(inStream);
    const outSize = binaryReader.ReadInt64();
    const inSize = binaryReader.ReadInt64();

    const outStream = new Stream(new Uint8Array(outSize))

    decoder.Code(inStream, outStream, inSize, outSize, null);
    // // console.log(outStream.ToArray())
    const d = BSON.deserialize(outStream.ToArray())
    const end = new Date().getTime()
    // console.log(EJSON.stringify(d))
    console.log("Time taken: ", end - start)
  }
}

const main = new Main()
main.Decompress()