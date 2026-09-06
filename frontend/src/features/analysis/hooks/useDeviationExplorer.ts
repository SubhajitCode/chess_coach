import { useState, useCallback, useMemo } from 'react'
import { Chess } from 'chess.js'
import { analyzePosition } from '../../../api/chess'
import type { MoveClassification, PlayerColor } from '../../../types/chess'

export interface ExploreMoveItem {
  fen: string
  moveUci: string
  moveSan: string
  moveSummary?: string | null
  color: PlayerColor
  evalBefore?: number
  evalAfter?: number
  cpLoss?: number
  classification?: MoveClassification
  bestMoveUci?: string
  bestMoveSan?: string
  bestLineSan?: string[]
  bestLineUci?: string[]
  deviationBestLineSan?: string[]
  deviationBestLineUci?: string[]
  fenAfter: string
}

export interface UseDeviationExplorerProps {
  currentFen: string
  onExitCallback?: () => void
}

export function useDeviationExplorer({
  currentFen,
  onExitCallback,
}: UseDeviationExplorerProps) {
  const [exploreMode, setExploreMode] = useState<boolean>(false)
  const [exploreStack, setExploreStack] = useState<ExploreMoveItem[]>([])
  const [exploreAnalyzing, setExploreAnalyzing] = useState<boolean>(false)

  const exploreBoardFen = useMemo(() => {
    if (!exploreMode) return null
    if (exploreStack.length === 0) return currentFen
    return exploreStack[exploreStack.length - 1].fenAfter ?? currentFen
  }, [exploreMode, exploreStack, currentFen])

  const handleEnterExplore = useCallback(() => {
    setExploreStack([])
    setExploreMode(true)
  }, [])

  const handleExitExplore = useCallback(() => {
    setExploreMode(false)
    setExploreStack([])
    onExitCallback?.()
  }, [onExitCallback])

  const handleExploreUndo = useCallback(() => {
    setExploreStack((prev) => prev.slice(0, -1))
  }, [])

  const handleExploreReset = useCallback(() => {
    setExploreStack([])
  }, [])

  const handleExplorePieceDrop = useCallback(
    async (args: any, targetSquareArg?: string) => {
      let sourceSquare: string
      let targetSquare: string
      let pieceCode = ''

      if (typeof args === 'object' && args !== null && 'sourceSquare' in args) {
        sourceSquare = args.sourceSquare
        targetSquare = args.targetSquare
        const p = args.piece
        pieceCode = typeof p === 'string' ? p : p?.pieceType || ''
      } else {
        sourceSquare = args
        targetSquare = targetSquareArg as string
      }

      const isPawn = pieceCode[1]?.toUpperCase() === 'P'
      const isPromotion =
        isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1')
      const moveUci = `${sourceSquare}${targetSquare}${isPromotion ? 'q' : ''}`

      const fenToPlayOn =
        exploreStack.length === 0
          ? currentFen
          : exploreStack[exploreStack.length - 1].fenAfter ?? currentFen
      const ch = new Chess(fenToPlayOn)
      let result = null
      try {
        result = ch.move({
          from: sourceSquare as any,
          to: targetSquare as any,
          promotion: isPromotion ? 'q' : undefined,
        })
      } catch {
        return false
      }
      if (!result) return false

      setExploreAnalyzing(true)
      try {
        const res = await analyzePosition(fenToPlayOn, moveUci, 12, 5)
        const d = res.data
        setExploreStack((prev) => [
          ...prev,
          {
            fen: fenToPlayOn,
            moveUci,
            moveSan: d.move_san || result!.san,
            moveSummary: d.move_summary || null,
            color: (d.color || (ch.turn() === 'w' ? 'black' : 'white')) as PlayerColor,
            evalBefore: d.eval_before,
            evalAfter: d.eval_after,
            cpLoss: d.cp_loss,
            classification: d.classification,
            bestMoveUci: d.best_move_uci,
            bestMoveSan: d.best_move_san,
            bestLineSan: d.best_line_san || [],
            bestLineUci: d.best_line_uci || [],
            deviationBestLineSan: d.deviation_best_line_san || [],
            deviationBestLineUci: d.deviation_best_line_uci || [],
            fenAfter: d.fen_after || ch.fen(),
          },
        ])
      } catch {
        setExploreStack((prev) => [
          ...prev,
          {
            fen: fenToPlayOn,
            moveUci,
            moveSan: result!.san,
            moveSummary: null,
            color: (ch.turn() === 'w' ? 'black' : 'white') as PlayerColor,
            fenAfter: ch.fen(),
            bestLineSan: [],
            bestLineUci: [],
            deviationBestLineSan: [],
            deviationBestLineUci: [],
          },
        ])
      } finally {
        setExploreAnalyzing(false)
      }
      return true
    },
    [currentFen, exploreStack]
  )

  return {
    exploreMode,
    setExploreMode,
    exploreStack,
    setExploreStack,
    exploreAnalyzing,
    exploreBoardFen,
    handleEnterExplore,
    handleExitExplore,
    handleExploreUndo,
    handleExploreReset,
    handleExplorePieceDrop,
  }
}
