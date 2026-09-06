import type { ChessMove, SideStats } from '../../types/chess'

export function estimateElo(
  avgCpLoss: number | null,
  accuracy: number | null = null
): number | null {
  if (avgCpLoss === null && accuracy === null) return null

  let eloFromLoss = 1500
  if (avgCpLoss !== null) {
    if (avgCpLoss <= 10) eloFromLoss = 2700 - avgCpLoss * 30
    else if (avgCpLoss <= 25) eloFromLoss = 2400 - (avgCpLoss - 10) * 26.6
    else if (avgCpLoss <= 45) eloFromLoss = 2000 - (avgCpLoss - 25) * 20
    else if (avgCpLoss <= 70) eloFromLoss = 1600 - (avgCpLoss - 45) * 16
    else if (avgCpLoss <= 100) eloFromLoss = 1200 - (avgCpLoss - 70) * 13.3
    else if (avgCpLoss <= 150) eloFromLoss = 800 - (avgCpLoss - 100) * 8
    else eloFromLoss = Math.max(300, 400 - (avgCpLoss - 150) * 2)
  }

  let eloFromAcc = 1500
  if (accuracy !== null) {
    if (accuracy >= 98) eloFromAcc = 2500 + (accuracy - 98) * 150
    else if (accuracy >= 90) eloFromAcc = 2000 + (accuracy - 90) * 62.5
    else if (accuracy >= 80) eloFromAcc = 1500 + (accuracy - 80) * 50
    else if (accuracy >= 65) eloFromAcc = 1000 + (accuracy - 65) * 33.3
    else if (accuracy >= 50) eloFromAcc = 600 + (accuracy - 50) * 26.6
    else eloFromAcc = Math.max(300, 600 - (50 - accuracy) * 10)
  }

  let estimated: number
  if (avgCpLoss !== null && accuracy !== null) {
    estimated = eloFromLoss * 0.6 + eloFromAcc * 0.4
  } else if (avgCpLoss !== null) {
    estimated = eloFromLoss
  } else {
    estimated = eloFromAcc
  }

  return Math.round(Math.max(300, Math.min(2900, estimated)))
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

  for (const m of moves) {
    if (m.cp_loss !== undefined && m.cp_loss !== null) {
      totalLoss += m.cp_loss
      lossCount++
    }
    const c = m.classification
    if (c === 'blunder') blunders++
    else if (c === 'mistake') mistakes++
    else if (c === 'inaccuracy') inaccuracies++
    else if (c === 'good') good++
    else if (c === 'excellent') excellent++
    else if (c === 'best') best++
  }

  const avgCpLoss = lossCount > 0 ? totalLoss / lossCount : null
  const accuracy =
    avgCpLoss !== null
      ? Math.round(
          Math.max(
            0,
            Math.min(
              100,
              100 * Math.exp(-0.004 * avgCpLoss) - (blunders * 2 + mistakes * 1)
            )
          )
        )
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
  }
}
