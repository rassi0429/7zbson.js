import {Document} from "bson";
declare function Decompress(binary: Uint8Array): string | null;
declare function DecompressToBson(binary: Uint8Array): Document;