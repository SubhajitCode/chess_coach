/**
 * Compute a 24-char hex hash of a PGN string (matches backend sha256 truncated).
 * Uses SubtleCrypto with deterministic fallback.
 * @param pgn PGN text string
 * @returns 24-character hexadecimal hash
 */
export async function computePgnHash(pgn: string): Promise<string> {
  if (!pgn) return ''
  const trimmed = pgn.trim()
  const data = new TextEncoder().encode(trimmed)

  const subtle = globalThis.crypto?.subtle
  if (subtle) {
    const buf = await subtle.digest('SHA-256', data)
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    return hex.slice(0, 24)
  }

  // Fallback for environments where crypto is not polyfilled
  let hash = 0
  for (let i = 0; i < trimmed.length; i++) {
    hash = (hash << 5) - hash + trimmed.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(24, '0').slice(0, 24)
}
