export function hexToBytes(hex) {
    const clean = hex.replace(/\s|0x/gi, "").toUpperCase();
    if (clean.length % 2 !== 0)
        throw new Error("hex length must be even");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
        out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    return out;
}
export function bytesToHex(bytes) {
    return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}
