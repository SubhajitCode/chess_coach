import '@testing-library/jest-dom'
import nodeCrypto from 'node:crypto'

if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: nodeCrypto.webcrypto || nodeCrypto,
  })
}
