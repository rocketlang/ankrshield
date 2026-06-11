// Minimal `crypto` shim for React Native bundling. The @ankrshield packages only use
// crypto.randomUUID() (to mint a non-security alert id). RN has no node:crypto, so provide
// an RFC-4122 v4 generator. Not for cryptographic use — only for identifiers.
function randomUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
const shim = { randomUUID };
module.exports = shim;
module.exports.default = shim;
