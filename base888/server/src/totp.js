"use strict";
// Real TOTP (RFC 6238) 2FA using node:crypto — no external dependency.
const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const b of buf) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out = [];
  for (const c of clean) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; } }
  return Buffer.from(out);
}

function generateSecret(bytes = 20) { return base32Encode(crypto.randomBytes(bytes)); }

function otpauthUrl(secret, label, issuer = "Base888") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secretBuf).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | ((hmac[off + 1] & 0xff) << 16) | ((hmac[off + 2] & 0xff) << 8) | (hmac[off + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

function verify(secret, token, window = 1, step = 30) {
  if (!secret || !token) return false;
  const secretBuf = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / step);
  const t = String(token).replace(/\s/g, "");
  for (let i = -window; i <= window; i++) {
    const cand = hotp(secretBuf, counter + i);
    if (cand.length === t.length && crypto.timingSafeEqual(Buffer.from(cand), Buffer.from(t))) return true;
  }
  return false;
}

module.exports = { generateSecret, otpauthUrl, verify, currentCode: (s) => hotp(base32Decode(s), Math.floor(Date.now() / 1000 / 30)) };
