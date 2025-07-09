import {Stream} from "./Stream";
import {LZMADecoder} from "./LZMADecoder";
import {BinaryReader} from "./BinaryReader";
import {BSON, EJSON, Document} from 'bson-fork';

export function Decompress(binary: Uint8Array): string | null {
    const bson = DecompressToBson(binary);
    return EJSON.stringify(bson);
}

export function DecompressToBson(binary: Uint8Array): Document {
    const inStream = new Stream(binary);
    let numArray = new Uint8Array(5);
    if (inStream.Read3(numArray, 0, 5) != 5)
        throw new Error("input .lzma is too short");
    let decoder = new LZMADecoder();
    decoder.SetDecoderProperties(numArray);
    const binaryReader = new BinaryReader(inStream);
    const outSize = binaryReader.ReadInt64();
    const inSize = binaryReader.ReadInt64();
    const outStream = new Stream(new Uint8Array(outSize));
    decoder.Code(inStream, outStream, inSize, outSize, null);
    return BSON.deserialize(outStream.ToArray());
}
