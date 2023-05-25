
import fs from "fs/promises"
import lzma from "lzma"
import { ByteArrayToHexString } from "./lib.mjs"

// lzma.compress("hello world", (result, error) => {
// }, (result) => {
//     console.log("result", ByteArrayToHexString(result))

//     lzma.decompress(result, (result, error) => {
//         console.log("result", result)
//     })
// })

const data = await fs.readFile("Box.7zbson")
const byteArray = new Int8Array(data)
lzma.decompress(byteArray, (result, error) => {
    console.log("result", result)
    console.log("error", error)
}, (result) => {
    console.log("result", result)
})