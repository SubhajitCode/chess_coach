import '@testing-library/jest-dom'

if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  const nodeCrypto = require('node:crypto')
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeCrypto.webcrypto || nodeCrypto,
  })
}
