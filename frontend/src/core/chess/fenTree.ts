import { Chess } from 'chess.js'
import { START_FEN } from './pgnParser'
import type { LineStep, PlayerColor } from '../../types/chess'

export { START_FEN }

export const PIECE_NAMES: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
}

export const PIECE_ICONS: Record<string, Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
}

export function buildFensBefore(moves: { move_uci?: string }[] = []): string[] {
  const chess = new Chess()
  const result: string[] = []
  for (const m of moves) {
    result.push(chess.fen())
    if (m.move_uci) {
      try {
        chess.move({
          from: m.move_uci.slice(0, 2),
          to: m.move_uci.slice(2, 4),
          promotion: m.move_uci[4] || undefined,
        })
      } catch {
        // ignore illegal moves in sequence
      }
    }
  }
  return result
}

export function buildFensAfter(moves: { move_uci?: string }[] = []): string[] {
  const chess = new Chess()
  const result: string[] = []
  for (const m of moves) {
    if (m.move_uci) {
      try {
        chess.move({
          from: m.move_uci.slice(0, 2),
          to: m.move_uci.slice(2, 4),
          promotion: m.move_uci[4] || undefined,
        })
      } catch {
        // ignore
      }
    }
    result.push(chess.fen())
  }
  return result
}

export function computeFenForMoveIndex(
  moves: { move_uci?: string }[] = [],
  index: number
): string {
  if (index < 0) return START_FEN
  const chess = new Chess()
  for (let i = 0; i <= index && i < moves.length; i++) {
    const m = moves[i]
    if (m?.move_uci) {
      try {
        chess.move({
          from: m.move_uci.slice(0, 2),
          to: m.move_uci.slice(2, 4),
          promotion: m.move_uci[4] || undefined,
        })
      } catch {
        // ignore
      }
    }
  }
  return chess.fen()
}

export function uciToReadable(uci?: string | null): string {
  if (!uci || uci.length < 4) return uci || ''
  return `${uci.slice(0, 2).toUpperCase()} → ${uci.slice(2, 4).toUpperCase()}`
}

export function decodeLine(
  fenBefore: string,
  uciList: string[] = [],
  maxSteps = 6
): LineStep[] {
  if (!fenBefore || !uciList || uciList.length === 0) return []
  const steps: LineStep[] = []
  try {
    const ch = new Chess(fenBefore)
    for (const uci of uciList.slice(0, maxSteps)) {
      if (!uci || uci.length < 4) break
      const from = uci.slice(0, 2)
      const to = uci.slice(2, 4)
      const promo = uci[4] || undefined
      const piece = ch.get(from as any)
      const targetPiece = ch.get(to as any)
      const color: PlayerColor = ch.turn() === 'w' ? 'white' : 'black'
      const colorKey = ch.turn()
      const stepFenBefore = ch.fen()

      let res = null
      try {
        res = ch.move({ from, to, promotion: promo })
      } catch {
        break
      }
      if (!res) break

      const isCapture = res.flags.includes('c') || res.flags.includes('e')
      const isCastle = res.flags.includes('k') || res.flags.includes('q')
      const castleSide = res.flags.includes('k') ? 'kingside' : 'queenside'
      const isCheck = ch.inCheck()
      const isCheckmate = ch.isCheckmate()

      const pType = piece ? piece.type : res.piece
      const icon = PIECE_ICONS[colorKey]?.[pType] || ''
      const name = PIECE_NAMES[pType] || pType.toUpperCase()
      const targetIcon = targetPiece
        ? PIECE_ICONS[targetPiece.color]?.[targetPiece.type] || ''
        : ''
      const targetName = targetPiece
        ? PIECE_NAMES[targetPiece.type] || targetPiece.type
        : ''

      let description: string
      if (isCastle) {
        description = `${icon} Castle ${castleSide}`
      } else if (isCapture) {
        description = `${icon} ${name} captures ${targetName ? `${targetIcon} ${targetName}` : to}`
      } else {
        description = `${icon} ${name} to ${to}`
      }
      if (isCheckmate) description += ' #'
      else if (isCheck) description += ' +'

      steps.push({
        uci,
        san: res.san,
        from,
        to,
        color,
        pieceIcon: icon,
        pieceName: name,
        isCapture,
        isCheck,
        isCheckmate,
        isCastle,
        castleSide: isCastle ? castleSide : undefined,
        captureTargetName: targetName || undefined,
        captureTargetIcon: targetIcon || undefined,
        description,
        fenBefore: stepFenBefore,
        fenAfter: ch.fen(),
      })
    }
  } catch {
    // return parsed steps up to failure
  }
  return steps
}
