import { useState, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chess, type Square } from 'chess.js'
import { getAiMove } from '../../../api/chess'
import { START_FEN } from '../../../core/chess/pgnParser'
import type { CandidateMove, PlayerColor } from '../../../types/chess'

export const STYLES: { id: number; label: string; desc: string }[] = [
  { id: 0.0, label: '🎯 Strict', desc: 'Top Human Move' },
  { id: 0.25, label: '🎲 Natural', desc: '1400–1800 Club Variety' },
  { id: 0.6, label: '🌪️ Creative', desc: 'Unorthodox Play' },
]

export interface SparringHistoryMove {
  san: string
  uci: string
  from: string
  to: string
  color: PlayerColor
}

export interface GameOverState {
  reason: string
  result: string
  winner: string
}

export function useSparringSession() {
  const navigate = useNavigate()

  // Match Configuration
  const [playerColor, setPlayerColor] = useState<PlayerColor>('white')
  const [engine, setEngine] = useState<string>('human_model')
  const [temperature, setTemperature] = useState<number>(0.25)
  const [boardOrientation, setBoardOrientation] = useState<PlayerColor>('white')

  // Live game state
  const chessRef = useRef(new Chess())
  const [fen, setFen] = useState<string>(START_FEN)
  const [history, setHistory] = useState<SparringHistoryMove[]>([])
  const [aiThinking, setAiThinking] = useState<boolean>(false)
  const [lastCandidates, setLastCandidates] = useState<CandidateMove[]>([])
  const [lastEval, setLastEval] = useState<number>(0.0)
  const [lastWinPct, setLastWinPct] = useState<number>(50.0)
  const [gameOver, setGameOver] = useState<GameOverState | null>(null)
  const [customHighlight, setCustomHighlight] = useState<Record<string, React.CSSProperties>>({})
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)
  const [copiedPgn, setCopiedPgn] = useState<boolean>(false)
  const [legalDestinations, setLegalDestinations] = useState<Square[]>([])

  const isWhiteTurn = useMemo(() => {
    return fen.split(' ')[1] === 'w'
  }, [fen])

  const activeTurnColor: PlayerColor = isWhiteTurn ? 'white' : 'black'
  const isPlayerTurn = activeTurnColor === playerColor

  const checkGameStatus = useCallback(() => {
    const ch = chessRef.current
    if (ch.isCheckmate()) {
      const winner = ch.turn() === 'w' ? 'Black' : 'White'
      setGameOver({
        reason: `Checkmate! ${winner} wins.`,
        result: ch.turn() === 'w' ? '0-1' : '1-0',
        winner,
      })
    } else if (ch.isDraw()) {
      let reason = 'Draw by repetition or 50-move rule.'
      if (ch.isStalemate()) reason = 'Draw by Stalemate.'
      if (ch.isInsufficientMaterial()) reason = 'Draw by Insufficient Material.'
      if (ch.isThreefoldRepetition && ch.isThreefoldRepetition())
        reason = 'Draw by Threefold Repetition.'
      setGameOver({
        reason,
        result: '1/2-1/2',
        winner: 'Draw',
      })
    }
  }, [])

  const triggerAiMove = useCallback(
    async (currentFen: string) => {
      setAiThinking(true)
      setSelectedSquare(null)
      setLegalDestinations([])
      try {
        const data = await getAiMove({
          fen: currentFen,
          engine,
          temperature,
          topK: 4,
        })

        if (data && data.selected_move_uci) {
          const uci = data.selected_move_uci
          const from = uci.slice(0, 2) as Square
          const to = uci.slice(2, 4) as Square
          const promo = uci[4] || undefined

          const moveRes = chessRef.current.move({
            from,
            to,
            promotion: promo,
          })
          if (moveRes) {
            const nextFen = chessRef.current.fen()
            setFen(nextFen)
            setHistory((prev) => [
              ...prev,
              {
                san: moveRes.san,
                uci,
                from,
                to,
                color: moveRes.color === 'w' ? 'white' : 'black',
              },
            ])
            setCustomHighlight({
              [from]: { backgroundColor: 'rgba(168, 85, 247, 0.35)' },
              [to]: { backgroundColor: 'rgba(168, 85, 247, 0.5)' },
            })
          }
        }

        setLastCandidates(data?.candidates || [])
        setLastEval(data?.eval || 0.0)
        setLastWinPct(data?.win_probability_pct || 50.0)

        checkGameStatus()
      } catch (err) {
        console.error('Failed to get AI move:', err)
      } finally {
        setAiThinking(false)
      }
    },
    [engine, temperature, checkGameStatus]
  )

  const makePlayerMove = useCallback(
    (sourceSquare: Square, targetSquare: Square, piece?: string) => {
      if (gameOver || aiThinking) return false

      const turnColor: PlayerColor = chessRef.current.turn() === 'w' ? 'white' : 'black'
      if (turnColor !== playerColor) return false

      try {
        const pieceType =
          typeof piece === 'string' && piece.length >= 2
            ? piece[1].toLowerCase()
            : ''
        const isPawn =
          pieceType === 'p' ||
          (!pieceType && chessRef.current.get(sourceSquare)?.type === 'p')
        const isPromotion =
          isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1')

        const moveRes = chessRef.current.move({
          from: sourceSquare,
          to: targetSquare,
          promotion: isPromotion ? 'q' : undefined,
        })

        if (!moveRes) return false

        const nextFen = chessRef.current.fen()
        setFen(nextFen)
        setSelectedSquare(null)
        setLegalDestinations([])
        setHistory((prev) => [
          ...prev,
          {
            san: moveRes.san,
            uci: `${sourceSquare}${targetSquare}${moveRes.promotion || ''}`,
            from: sourceSquare,
            to: targetSquare,
            color: moveRes.color === 'w' ? 'white' : 'black',
          },
        ])
        setCustomHighlight({
          [sourceSquare]: { backgroundColor: 'rgba(59, 130, 246, 0.35)' },
          [targetSquare]: { backgroundColor: 'rgba(59, 130, 246, 0.5)' },
        })

        checkGameStatus()

        if (!chessRef.current.isGameOver()) {
          triggerAiMove(nextFen)
        }
        return true
      } catch {
        return false
      }
    },
    [gameOver, aiThinking, playerColor, checkGameStatus, triggerAiMove]
  )

  const handlePlayerPieceDrop = useCallback(
    (args: any, targetSquareArg?: string, pieceArg?: string) => {
      let sourceSquare: Square
      let targetSquare: Square
      let piece: string | undefined
      if (typeof args === 'object' && args !== null && 'sourceSquare' in args) {
        sourceSquare = args.sourceSquare
        targetSquare = args.targetSquare
        const p = args.piece
        piece = typeof p === 'string' ? p : p?.pieceType || ''
      } else {
        sourceSquare = args
        targetSquare = targetSquareArg as Square
        piece = pieceArg
      }

      if (!sourceSquare || !targetSquare) return false
      return makePlayerMove(sourceSquare, targetSquare, piece)
    },
    [makePlayerMove]
  )

  const handleSquareClick = useCallback(
    ({ square }: { square: Square }) => {
      if (gameOver || aiThinking) return
      const turnColor = chessRef.current.turn() === 'w' ? 'white' : 'black'
      if (turnColor !== playerColor) return

      const clickedPiece = chessRef.current.get(square)

      if (selectedSquare) {
        if (selectedSquare === square) {
          setSelectedSquare(null)
          setLegalDestinations([])
          return
        }

        const success = makePlayerMove(selectedSquare, square)
        if (success) return

        if (
          clickedPiece &&
          clickedPiece.color === (playerColor === 'white' ? 'w' : 'b')
        ) {
          setSelectedSquare(square)
          const moves = chessRef.current.moves({ square, verbose: true })
          setLegalDestinations(moves.map((m) => m.to as Square))
          return
        }

        setSelectedSquare(null)
        setLegalDestinations([])
        return
      }

      if (
        clickedPiece &&
        clickedPiece.color === (playerColor === 'white' ? 'w' : 'b')
      ) {
        setSelectedSquare(square)
        const moves = chessRef.current.moves({ square, verbose: true })
        setLegalDestinations(moves.map((m) => m.to as Square))
      }
    },
    [gameOver, aiThinking, playerColor, selectedSquare, makePlayerMove]
  )

  const computedSquareStyles = useMemo(() => {
    const styles: Record<string, React.CSSProperties> = { ...customHighlight }

    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: 'rgba(234, 179, 8, 0.45)',
        borderRadius: '6px',
      }

      for (const toSquare of legalDestinations) {
        styles[toSquare] = {
          background:
            'radial-gradient(circle, rgba(59, 130, 246, 0.6) 24%, transparent 25%)',
          borderRadius: '50%',
        }
      }
    }

    return styles
  }, [customHighlight, selectedSquare, legalDestinations])

  const handleStartGame = useCallback(
    (color: PlayerColor = playerColor) => {
      chessRef.current = new Chess()
      setFen(START_FEN)
      setHistory([])
      setSelectedSquare(null)
      setLegalDestinations([])
      setLastCandidates([])
      setLastEval(0.0)
      setLastWinPct(50.0)
      setGameOver(null)
      setCustomHighlight({})
      setPlayerColor(color)
      setBoardOrientation(color)

      if (color === 'black') {
        setTimeout(() => triggerAiMove(START_FEN), 150)
      }
    },
    [playerColor, triggerAiMove]
  )

  const handleTakeback = useCallback(() => {
    if (aiThinking || history.length === 0) return

    const ch = chessRef.current
    ch.undo()
    if (
      ch.turn() !== (playerColor === 'white' ? 'w' : 'b') &&
      ch.history().length > 0
    ) {
      ch.undo()
    }
    setFen(ch.fen())
    setSelectedSquare(null)
    setLegalDestinations([])
    setGameOver(null)

    const replay = new Chess()
    const newHist: SparringHistoryMove[] = []
    for (const san of ch.history()) {
      const m = replay.move(san)
      if (m) {
        newHist.push({
          san: m.san,
          uci: `${m.from}${m.to}${m.promotion || ''}`,
          from: m.from,
          to: m.to,
          color: m.color === 'w' ? 'white' : 'black',
        })
      }
    }
    setHistory(newHist)
    setCustomHighlight({})
  }, [aiThinking, history.length, playerColor])

  const handleResign = useCallback(() => {
    if (gameOver) return
    const winner = playerColor === 'white' ? 'Black (AI)' : 'White (AI)'
    setGameOver({
      reason: `You resigned. ${winner} wins.`,
      result: playerColor === 'white' ? '0-1' : '1-0',
      winner,
    })
  }, [gameOver, playerColor])

  const handleAnalyzeInCoach = useCallback(
    (targetPerspective?: PlayerColor | null) => {
      const pgn = chessRef.current.pgn() || ''
      const colorToAnalyze = targetPerspective || playerColor

      const aiLabel =
        engine === 'human_model'
          ? 'Human AI Model (1400–1800)'
          : engine === 'hybrid'
          ? 'Hybrid Coach (Stockfish + Neural)'
          : 'Stockfish 16'

      navigate('/analysis', {
        state: {
          game: {
            pgn: pgn.trim() || '1. e4',
            white: playerColor === 'white' ? 'You' : aiLabel,
            black: playerColor === 'black' ? 'You' : aiLabel,
            result: gameOver?.result || '*',
            time_control: 'Sparring Arena',
            opening: 'Sparring Game',
          },
          playerColor: colorToAnalyze,
        },
      })
    },
    [engine, playerColor, gameOver, navigate]
  )

  const handleCopyPgn = useCallback(() => {
    const pgn = chessRef.current.pgn()
    navigator.clipboard.writeText(pgn)
    setCopiedPgn(true)
    setTimeout(() => setCopiedPgn(false), 2000)
  }, [])

  const movePairs = useMemo(() => {
    const pairs: { num: number; white: string; black: string }[] = []
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: history[i]?.san || '',
        black: history[i + 1]?.san || '',
      })
    }
    return pairs
  }, [history])

  const aiColor: PlayerColor = playerColor === 'white' ? 'black' : 'white'

  return {
    playerColor,
    setPlayerColor,
    engine,
    setEngine,
    temperature,
    setTemperature,
    boardOrientation,
    setBoardOrientation,
    fen,
    history,
    movePairs,
    aiThinking,
    lastCandidates,
    lastEval,
    lastWinPct,
    gameOver,
    selectedSquare,
    computedSquareStyles,
    copiedPgn,
    isPlayerTurn,
    aiColor,
    handlePlayerPieceDrop,
    handleSquareClick,
    handleStartGame,
    handleTakeback,
    handleResign,
    handleAnalyzeInCoach,
    handleCopyPgn,
    navigate,
  }
}
