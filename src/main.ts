import {Stream} from "./Stream";
import {Decoder} from "./RangeCoder";
import {LZMADecoder} from "./LZMADecoder";
import fs from "fs/promises"
import {BinaryReader} from "./BinaryReader";
import {BSON, EJSON} from 'bson-fork';
import {CoderPropID, LZMAEncoder} from "./LZMAEncoder";
import {BinaryWriter} from "./BinaryWriter";
import {Decompress} from "./7zbson";

class Main {

  async Decompress() {
    const start = new Date().getTime()
    const data = await fs.readFile("./Jsimple.7zbson")
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
    console.log(outStream.ToArray())
    const d = BSON.deserialize(outStream.ToArray())
    const end = new Date().getTime()
    console.log(EJSON.stringify(d))
    console.log("Time taken: ", end - start)
  }

  propIDs = [
    CoderPropID.DictionarySize,
    CoderPropID.PosStateBits,
    CoderPropID.LitContextBits,
    CoderPropID.LitPosBits,
    CoderPropID.Algorithm,
    CoderPropID.NumFastBytes,
    CoderPropID.MatchFinder,
    CoderPropID.EndMarker
  ];

  dictionary = 2097152;
  posStateBits = 2;
  litContextBits = 3;
  litPosBits = 0;
  algorithm = 2;
  numFastBytes = 32;
  eos = false;

  props = [this.dictionary, this.posStateBits, this.litContextBits, this.litPosBits, this.algorithm, this.numFastBytes, "BT4", this.eos]

  async Compress() {
    // const data = JSON.parse((await fs.readFile("simple.json")).toString())
    // const bson = BSON.serialize(data)
    const inStream = new Stream(new Uint8Array([22,0,0,0,2,104,101,108,108,111,0,6,0,0,0,119,111,114,108,100,0,0]))
    console.log(inStream.ToArray())
    // ?
    const outStream = new Stream(new Uint8Array(inStream.Length * 2))

    const encoder = new LZMAEncoder()
    encoder.SetCoderProperties(this.propIDs, this.props)
    encoder.WriteCoderProperties(outStream)
    const binaryWriter = new BinaryWriter(outStream)
    binaryWriter.Write(inStream.Length - inStream.Position) // Extracted size
    const positionForCompressedSize = outStream.Position
    binaryWriter.Write(0)
    const positionForCompressedData = outStream.Position
    encoder.Code(inStream, outStream, -1, -1, null)
    const positionAfterCompressedData = outStream.Position
    outStream.Position = positionForCompressedSize
    binaryWriter.Write(positionAfterCompressedData - positionForCompressedData) // Compressed size
    outStream.Position = positionAfterCompressedData

    const binaryArray = outStream.ToArray()
    console.log(binaryArray)
    await fs.writeFile("./Jsimple.7zbson", binaryArray)
  }
}

const main = new Main()
main.Compress().then(() => {
  main.Decompress()
})