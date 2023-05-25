# 7zbson.js

this is a simple implementation of a 7zbson decompress and compress in javascript

## Usage
compress is WIP
### Node
```javascript
import { Decompress } from "7zbson.js";
import fs from "fs/promises";

const data = fs.readFile("file.7zbson");
const biteArray = new Uint8Array(data);
const decompress = new Decompress(biteArray);

console.log(decompress);
```
### Web
sample is [here](https://github.com/rassi0429/7zbsonjs-example)


