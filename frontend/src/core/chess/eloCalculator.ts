import type { ChessMove, SideStats } from '../../types/chess'

export const MOVE_ACCURACY_WEIGHTS: Record<string, number> = {
  best: 100,
  book: 100,
  excellent: 90,
  good: 75,
  inaccuracy: 50,
  mistake: 25,
  blunder: 0,
}

export const ACCURACY_ELO_MAP: [number, number][] = [
  [98.0, 2800],
  [95.0, 2500],
  [90.0, 2150],
  [85.0, 1850],
  [80.0, 1600],
  [75.0, 1450],
  [70.0, 1300],
  [65.0, 1150],
  [60.0, 1000],
  [50.0, 750],
  [40.0, 500],
  [25.0, 300],
]

export const MAX_CP_LOSS_FOR_STATS = 200

export function estimateElo(
  avgCpLoss: number | null,
  accuracy: number | null = null
): number | null {
  if (avgCpLoss === null && accuracy === null) return null

  let eloAcc = 1200
  if (accuracy !== null) {
    const acc = Math.max(0, Math.min(100, accuracy))
    if (acc >= ACCURACY_ELO_MAP[0][0]) {
      eloAcc = ACCURACY_ELO_MAP[0][1]
    } else if (acc <= ACCURACY_ELO_MAP[ACCURACY_ELO_MAP.length - 1][0]) {
      eloAcc = ACCURACY_ELO_MAP[ACCURACY_ELO_MAP.length - 1][1]
    } else {
      for (let i = 0; i < ACCURACY_ELO_MAP.length - 1; i++) {
        const [topAcc, topElo] = ACCURACY_ELO_MAP[i]
        const [botAcc, botElo] = ACCURACY_ELO_MAP[i + 1]
        if (acc <= topAcc && acc >= botAcc) {
          const span = topAcc - botAcc
          const progress = span > 0 ? (acc - botAcc) / span : 0
          eloAcc = botElo + (topElo - botElo) * progress
          break
        }
      }
    }
  }

  let finalElo: number
  if (avgCpLoss !== null) {
    const cappedCp = Math.min(MAX_CP_LOSS_FOR_STATS, Math.max(0, avgCpLoss))
    const eloCp = Math.max(300, Math.min(2800, 2600 - cappedCp * 16))
    if (accuracy !== null) {
      finalElo = Math.round(eloAcc * 0.75 + eloCp * 0.25)
    } else {
      finalElo = Math.round(eloCp)
    }
  } else {
    finalElo = Math.round(eloAcc)
  }

  return Math.max(300, Math.min(2850, finalElo))
}

export function computeSideStats(moves: Partial<ChessMove>[] = []): SideStats {
  const total = moves.length
  if (total === 0) {
    return {
      total: 0,
      accuracy: null,
      avgCpLoss: null,
      estimated_elo: null,
      blunders: 0,
      mistakes: 0,
      inaccuracies: 0,
      good_moves: 0,
      excellent_moves: 0,
      best_moves: 0,
      book_moves: 0,
    }
  }

  let totalLoss = 0
  let lossCount = 0
  let blunders = 0
  let mistakes = 0
  let inaccuracies = 0
  let good = 0
  let excellent = 0
  let best = 0
  let book = 0
  let weightedScore = 0
  let classifiedCount = 0

  for (const m of moves) {
    if (m.cp_loss !== undefined && m.cp_loss !== null) {
      totalLoss += Math.min(Math.max(0, m.cp_loss), MAX_CP_LOSS_FOR_STATS)
      lossCount++
    }
    const c = m.classification
    if (c) {
      weightedScore += MOVE_ACCURACY_WEIGHTS[c] ?? 75
      classifiedCount++
    }
    if (c === 'blunder') blunders++
    else if (c === 'mistake') mistakes++
    else if (c === 'inaccuracy') inaccuracies++
    else if (c === 'good') good++
    else if (c === 'excellent') excellent++
    else if (c === 'best') best++
    else if (c === 'book') book++
  }

  const avgCpLoss =
    lossCount > 0 ? Math.round((totalLoss / lossCount) * 10) / 10 : null

  const accuracy =
    classifiedCount > 0
      ? Math.round((weightedScore / classifiedCount) * 10) / 10
      : null

  const estimated_elo = estimateElo(avgCpLoss, accuracy)

  return {
    total,
    accuracy,
    avgCpLoss,
    estimated_elo,
    blunders,
    mistakes,
    inaccuracies,
    good_moves: good,
    excellent_moves: excellent,
    best_moves: best,
    book_moves: book,
  }
}
