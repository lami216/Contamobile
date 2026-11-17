// Shared synchronous SHA-256 for stable offline accounting identities and review tokens.
export function sha256Hex(value) {
    const bytes = new TextEncoder().encode(value), length = bytes.length;
    const data = new Uint8Array(Math.ceil((length + 9) / 64) * 64);
    data.set(bytes); data[length] = 128;
    const view = new DataView(data.buffer);
    view.setUint32(data.length - 8, Math.floor(length / 0x20000000));
    view.setUint32(data.length - 4, (length * 8) >>> 0);
    const constants = [], initial = [];
    for (let n = 2; constants.length < 64; n++) {
        let prime = true;
        for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
        if (prime) {
            if (initial.length < 8) initial.push((Math.sqrt(n) * 0x100000000) | 0);
            constants.push((Math.cbrt(n) * 0x100000000) | 0);
        }
    }
    const h = initial, w = new Int32Array(64), rotate = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < data.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const x = w[i - 15], y = w[i - 2];
            w[i] = (w[i - 16] + (rotate(x, 7) ^ rotate(x, 18) ^ (x >>> 3)) + w[i - 7] + (rotate(y, 17) ^ rotate(y, 19) ^ (y >>> 10))) | 0;
        }
        let [a, b, c, d, e, f, g, j] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (j + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + constants[i] + w[i]) | 0;
            const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            j = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
        }
        [a, b, c, d, e, f, g, j].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
    }
    return h.map(n => (n >>> 0).toString(16).padStart(8, '0')).join('');
}
