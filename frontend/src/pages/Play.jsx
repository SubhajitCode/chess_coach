import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { Chess } from 'chess.js'
import { getAiMove } from '../api/chess'
import EvalBar from '../components/EvalBar'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

const STYLES = [
  { id: 0.0, label: '🎯 Strict', desc: 'Top Human Move' },
  { id: 0.25, label: '🎲 Natural', desc: '1400–1800 Club Variety' },
  { id: 0.6, label: '🌪️ Creative', desc: 'Unorthodox Play' },
]

export default function Play() {
  const navigate = useNavigate()

  // Game setup
  const [playerColor, setPlayerColor] = useState('white') // 'white' | 'black'
  const [engine, setEngine] = useState('human_model') // 'human_model' | 'stockfish'
  const [temperature, setTemperature] = useState(0.25)
  const [boardOrientation, setBoardOrientation] = useState('white')

  // Live game state
  const chessRef = useRef(new Chess())
  const [fen, setFen] = useState(START_FEN)
  const [history, setHistory] = useState([]) // array of { san, uci, from, to, color }
  const [aiThinking, setAiThinking] = useState(false)
  const [lastCandidates, setLastCandidates] = useState([])
  const [lastEval, setLastEval] = useState(0.0)
  const [lastWinPct, setLastWinPct] = useState(50.0)
  const [gameOver, setGameOver] = useState(null) // { reason, result, winner }
  const [customHighlight, setCustomHighlight] = useState({})
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [copiedPgn, setCopiedPgn] = useState(false)

  // Sync orientation with playerColor on setup
  useEffect(() => {
    setBoardOrientation(playerColor)
  }, [playerColor])

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
      if (ch.isThreefoldRepetition && ch.isThreefoldRepetition()) reason = 'Draw by Threefold Repetition.'
      setGameOver({
        reason,
        result: '1/2-1/2',
        winner: 'Draw',
      })
    }
  }, [])

  const triggerAiMove = useCallback(async (currentFen) => {
    setAiThinking(true)
    setSelectedSquare(null)
    try {
      const data = await getAiMove({
        fen: currentFen,
        engine,
        temperature,
        topK: 4,
      })

      if (data && data.selected_move_uci) {
        const uci = data.selected_move_uci
        const from = uci.slice(0, 2)
        const to = uci.slice(2, 4)
        const promo = uci[4] || undefined

        const moveRes = chessRef.current.move({ from, to, promotion: promo })
        if (moveRes) {
          const nextFen = chessRef.current.fen()
          setFen(nextFen)
          setHistory(prev => [
            ...prev,
            {
              san: moveRes.san,
              uci,
              from,
              to,
              color: moveRes.color === 'w' ? 'white' : 'black',
            }
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
  }, [engine, temperature, checkGameStatus])

  // If Black is chosen, trigger AI's opening move as White
  useEffect(() => {
    if (playerColor === 'black' && history.length === 0 && !aiThinking && !gameOver) {
      triggerAiMove(START_FEN)
    }
  }, [playerColor, history.length, aiThinking, gameOver, triggerAiMove])

  // Execute a player move and trigger AI reply
  const makePlayerMove = useCallback((sourceSquare, targetSquare, piece) => {
    if (gameOver || aiThinking) return false

    // Ensure it is user's turn
    const turnColor = chessRef.current.turn() === 'w' ? 'white' : 'black'
    if (turnColor !== playerColor) return false

    try {
      const pieceType = (typeof piece === 'string' && piece.length >= 2) ? piece[1].toLowerCase() : ''
      const isPawn = pieceType === 'p' || (!pieceType && chessRef.current.get(sourceSquare)?.type === 'p')
      const isPromotion = isPawn && (targetSquare[1] === '8' || targetSquare[1] === '1')

      const moveRes = chessRef.current.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: isPromotion ? 'q' : undefined,
      })

      if (!moveRes) return false

      const nextFen = chessRef.current.fen()
      setFen(nextFen)
      setSelectedSquare(null)
      setHistory(prev => [
        ...prev,
        {
          san: moveRes.san,
          uci: `${sourceSquare}${targetSquare}${moveRes.promotion || ''}`,
          from: sourceSquare,
          to: targetSquare,
          color: moveRes.color === 'w' ? 'white' : 'black',
        }
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
  }, [gameOver, aiThinking, playerColor, checkGameStatus, triggerAiMove])

  // Handles drag-and-drop from react-chessboard (v5 object or legacy args)
  const handlePlayerPieceDrop = useCallback((args, targetSquareArg, pieceArg) => {
    let sourceSquare, targetSquare, piece
    if (typeof args === 'object' && args !== null && 'sourceSquare' in args) {
      sourceSquare = args.sourceSquare
      targetSquare = args.targetSquare
      const p = args.piece
      piece = typeof p === 'string' ? p : (p?.pieceType || '')
    } else {
      sourceSquare = args
      targetSquare = targetSquareArg
      piece = pieceArg
    }

    if (!sourceSquare || !targetSquare) return false
    return makePlayerMove(sourceSquare, targetSquare, piece)
  }, [makePlayerMove])

  // Handles click-to-move for clicking piece then destination square
  const handleSquareClick = useCallback(({ square, piece }) => {
    if (gameOver || aiThinking) return
    const turnColor = chessRef.current.turn() === 'w' ? 'white' : 'black'
    if (turnColor !== playerColor) return

    const clickedPiece = chessRef.current.get(square)

    // If already selected a square
    if (selectedSquare) {
      if (selectedSquare === square) {
        setSelectedSquare(null)
        return
      }

      // Try making move to clicked square
      const success = makePlayerMove(selectedSquare, square)
      if (success) return

      // If clicked another own piece, switch selection
      if (clickedPiece && clickedPiece.color === (playerColor === 'white' ? 'w' : 'b')) {
        setSelectedSquare(square)
        return
      }

      setSelectedSquare(null)
      return
    }

    // Select piece if it belongs to current player
    if (clickedPiece && clickedPiece.color === (playerColor === 'white' ? 'w' : 'b')) {
      setSelectedSquare(square)
    }
  }, [gameOver, aiThinking, playerColor, selectedSquare, makePlayerMove])

  // Calculate dynamic square highlights (last move + selected piece + legal moves)
  const computedSquareStyles = useMemo(() => {
    const styles = { ...customHighlight }

    if (selectedSquare) {
      styles[selectedSquare] = {
        backgroundColor: 'rgba(234, 179, 8, 0.45)',
        borderRadius: '6px',
      }

      const legalMoves = chessRef.current.moves({ square: selectedSquare, verbose: true })
      for (const m of legalMoves) {
        styles[m.to] = {
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.6) 24%, transparent 25%)',
          borderRadius: '50%',
        }
      }
    }

    return styles
  }, [customHighlight, selectedSquare])

  const handleNewGame = () => {
    chessRef.current = new Chess()
    setFen(START_FEN)
    setHistory([])
    setSelectedSquare(null)
    setLastCandidates([])
    setLastEval(0.0)
    setLastWinPct(50.0)
    setGameOver(null)
    setCustomHighlight({})

    if (playerColor === 'black') {
      setTimeout(() => triggerAiMove(START_FEN), 150)
    }
  }

  const handleTakeback = () => {
    if (aiThinking || history.length === 0) return

    // Undo player move and AI move if played
    const ch = chessRef.current
    ch.undo()
    if (ch.turn() !== (playerColor === 'white' ? 'w' : 'b') && ch.history().length > 0) {
      ch.undo()
    }
    setFen(ch.fen())
    setSelectedSquare(null)
    setGameOver(null)

    // Reconstruct history
    const replay = new Chess()
    const newHist = []
    for (const san of ch.history()) {
      const m = replay.move(san)
      newHist.push({
        san: m.san,
        uci: `${m.from}${m.to}${m.promotion || ''}`,
        from: m.from,
        to: m.to,
        color: m.color === 'w' ? 'white' : 'black',
      })
    }
    setHistory(newHist)
    setCustomHighlight({})
  }

  const handleResign = () => {
    if (gameOver) return
    const winner = playerColor === 'white' ? 'Black (AI)' : 'White (AI)'
    setGameOver({
      reason: `You resigned. ${winner} wins.`,
      result: playerColor === 'white' ? '0-1' : '1-0',
      winner,
    })
  }

  const handleAnalyzeInCoach = (targetPerspective = null) => {
    const pgn = chessRef.current.pgn() || ''
    const aiColor = playerColor === 'white' ? 'black' : 'white'
    const colorToAnalyze = targetPerspective || playerColor

    const aiLabel = engine === 'human_model'
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
      }
    })
  }

  const handleCopyPgn = () => {
    const pgn = chessRef.current.pgn()
    navigator.clipboard.writeText(pgn)
    setCopiedPgn(true)
    setTimeout(() => setCopiedPgn(false), 2000)
  }

  // Group move history into pairs
  const movePairs = useMemo(() => {
    const pairs = []
    for (let i = 0; i < history.length; i += 2) {
      pairs.push({
        num: Math.floor(i / 2) + 1,
        white: history[i]?.san || '',
        black: history[i + 1]?.san || '',
      })
    }
    return pairs
  }, [history])

  const aiColor = playerColor === 'white' ? 'black' : 'white'

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top Navbar */}
      <header className="px-6 py-3.5 bg-gray-900/90 border-b border-gray-800 backdrop-blur flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-gray-800"
          >
            ← Dashboard
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xl">⚔️</span>
            <div>
              <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                Sparring Arena
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-900/60 text-purple-300 border border-purple-700/60">
                  {engine === 'human_model' ? '🧠 Human AI Model (1400–1800)' : engine === 'hybrid' ? '♟️ Hybrid Coach' : '⚡ Stockfish 16'}
                </span>
              </h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAnalyzeInCoach(playerColor)}
            disabled={history.length === 0}
            title="Analyze your own moves with Stockfish"
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow flex items-center gap-1.5"
          >
            👤 Analyze My Play
          </button>
          <button
            onClick={() => handleAnalyzeInCoach(aiColor)}
            disabled={history.length === 0}
            title="Analyze the Human AI's gameplay, accuracy, and estimated Elo with Stockfish"
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow flex items-center gap-1.5 border border-purple-400/30"
          >
            🤖 Analyze AI with Stockfish
          </button>
        </div>
      </header>

      {/* Main Play Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Board Column (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-center gap-3">
          {/* Opponent Info Bar */}
          <div className="w-full max-w-[500px] flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900 border border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-purple-950 border border-purple-700 flex items-center justify-center text-sm shadow">
                {engine === 'human_model' ? '🧠' : '⚡'}
              </div>
              <div>
                <div className="text-xs font-bold text-gray-200">
                  {engine === 'human_model' ? 'Human AI Model' : 'Stockfish 16'}
                </div>
                <div className="text-[10px] text-gray-400">
                  {engine === 'human_model' ? '1400–1800 Elo Dual-Head Policy' : 'Classical Search Depth 12'}
                </div>
              </div>
            </div>
            {aiThinking && (
              <span className="text-xs text-purple-400 font-medium animate-pulse flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
                Thinking…
              </span>
            )}
          </div>

          {/* Chessboard container with EvalBar */}
          <div className="relative flex gap-3 items-center justify-center p-2 rounded-2xl bg-gray-900/60 border border-gray-800/80 shadow-2xl">
            <EvalBar evalCp={lastEval} playerColor={playerColor} />

            <div className="w-[340px] sm:w-[440px] md:w-[480px]">
              <Chessboard
                options={{
                  id: `sparring-board-${playerColor}`,
                  position: fen,
                  boardOrientation: boardOrientation,
                  allowDragging: !gameOver && !aiThinking,
                  onPieceDrop: handlePlayerPieceDrop,
                  onSquareClick: handleSquareClick,
                  squareStyles: computedSquareStyles,
                  boardStyle: {
                    borderRadius: '12px',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
                  },
                  darkSquareStyle: { backgroundColor: '#4a5568' },
                  lightSquareStyle: { backgroundColor: '#cbd5e1' },
                  animationDurationInMs: 200,
                }}
              />
            </div>
          </div>

          {/* Player Info Bar */}
          <div className="w-full max-w-[500px] flex items-center justify-between px-3 py-2 rounded-xl bg-gray-900 border border-gray-800">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-blue-950 border border-blue-700 flex items-center justify-center text-sm shadow">
                👤
              </div>
              <div>
                <div className="text-xs font-bold text-gray-200">You ({playerColor.toUpperCase()})</div>
                <div className="text-[10px] text-gray-400">
                  {chessRef.current.turn() === (playerColor === 'white' ? 'w' : 'b') ? 'Your Turn (drag or click to move)' : 'Waiting for AI…'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                title="Flip Board Orientation"
                className="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs transition"
              >
                🔄 Flip
              </button>
            </div>
          </div>

          {/* Game Over Banner */}
          {gameOver && (
            <div className="w-full max-w-[500px] p-4 rounded-xl bg-gradient-to-r from-purple-950/80 to-blue-950/80 border border-purple-600/50 shadow-xl flex flex-col items-center text-center gap-2 animate-fade-in">
              <div className="text-base font-bold text-white">🏆 Game Concluded</div>
              <div className="text-xs text-purple-200">{gameOver.reason}</div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                <button
                  onClick={handleNewGame}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow"
                >
                  Play Again
                </button>
                <button
                  onClick={() => handleAnalyzeInCoach(playerColor)}
                  className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow"
                >
                  👤 Analyze My Play
                </button>
                <button
                  onClick={() => handleAnalyzeInCoach(aiColor)}
                  className="px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition shadow border border-purple-400/30"
                >
                  🤖 Audit AI with Stockfish
                </button>
              </div>
            </div>
          )}

          {/* Action Toolbar */}
          <div className="w-full max-w-[500px] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={handleNewGame}
                className="flex-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition border border-gray-700"
              >
                🔄 New Game
              </button>
              <button
                onClick={handleTakeback}
                disabled={history.length === 0 || aiThinking}
                className="flex-1 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 text-gray-200 text-xs font-semibold transition border border-gray-700"
              >
                ⏪ Takeback
              </button>
              <button
                onClick={handleResign}
                disabled={!!gameOver}
                className="flex-1 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 disabled:opacity-40 text-red-300 text-xs font-semibold transition border border-red-800/60"
              >
                🏳️ Resign
              </button>
            </div>

            {/* Quick Stockfish Analyze Row */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handleAnalyzeInCoach(aiColor)}
                disabled={history.length === 0}
                className="py-2 px-3 rounded-xl bg-purple-900/40 hover:bg-purple-800/60 border border-purple-600/50 disabled:opacity-30 disabled:cursor-not-allowed text-purple-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow"
              >
                🤖 Analyze AI with Stockfish
              </button>
              <button
                onClick={() => handleAnalyzeInCoach(playerColor)}
                disabled={history.length === 0}
                className="py-2 px-3 rounded-xl bg-blue-900/40 hover:bg-blue-800/60 border border-blue-600/50 disabled:opacity-30 disabled:cursor-not-allowed text-blue-200 text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow"
              >
                👤 Analyze My Play
              </button>
            </div>
          </div>
        </div>

        {/* Right Diagnostics & Match Controls Column (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Match Configuration Card */}
          <div className="p-4 rounded-2xl bg-gray-900 border border-gray-800 flex flex-col gap-3.5 shadow-md">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
              <span>⚙️</span> Sparring Settings
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Opponent Selection */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Opponent</label>
                <select
                  value={engine}
                  onChange={e => setEngine(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-purple-500 font-medium"
                >
                  <option value="human_model">🧠 Human AI Model (1400–1800)</option>
                  <option value="hybrid">♟️ Hybrid Coach (Stockfish + Neural)</option>
                  <option value="stockfish">⚡ Stockfish 16</option>
                </select>
              </div>

              {/* Your Color */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">Play As</label>
                <div className="grid grid-cols-2 gap-1 bg-gray-800 p-0.5 rounded-lg border border-gray-700">
                  <button
                    onClick={() => { setPlayerColor('white'); handleNewGame() }}
                    className={`py-1 text-xs font-semibold rounded ${playerColor === 'white' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    ⚪ White
                  </button>
                  <button
                    onClick={() => { setPlayerColor('black'); handleNewGame() }}
                    className={`py-1 text-xs font-semibold rounded ${playerColor === 'black' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}
                  >
                    ⚫ Black
                  </button>
                </div>
              </div>
            </div>

            {/* AI Style & Variety Slider */}
            {engine === 'human_model' && (
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1.5 flex items-center justify-between">
                  <span>AI Play Variety (Temperature)</span>
                  <span className="text-purple-400 font-bold">{temperature.toFixed(2)}</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {STYLES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setTemperature(s.id)}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        Math.abs(temperature - s.id) < 0.1
                          ? 'bg-purple-950/60 border-purple-500 text-purple-200 shadow'
                          : 'bg-gray-800/60 border-gray-700/60 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="text-xs font-bold">{s.label}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{s.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* AI Live Thought Process & Candidates Card */}
          <div className="p-4 rounded-2xl bg-gray-900 border border-purple-900/40 flex flex-col gap-3 shadow-md">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-300 flex items-center gap-1.5">
                <span>🧠</span> AI Candidate Thoughts
              </div>
              <div className="text-[11px] font-semibold text-gray-400">
                Win Prob: <span className="text-purple-300">{lastWinPct}%</span>
              </div>
            </div>

            {lastCandidates.length > 0 ? (
              <div className="space-y-2">
                {lastCandidates.map((cand, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-xs">
                    <span className="w-5 text-gray-500 font-mono text-[10px]">#{idx + 1}</span>
                    <span className="font-mono font-bold text-gray-100 w-12">{cand.move_san}</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-purple-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(8, cand.probability))}%` }}
                      />
                    </div>
                    <span className="text-gray-300 font-medium text-[11px] w-12 text-right">
                      {cand.probability}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-500 italic py-2 text-center">
                Play a move to see the Human AI model's candidate considerations!
              </div>
            )}
          </div>

          {/* Move History Notation Table */}
          <div className="p-4 rounded-2xl bg-gray-900 border border-gray-800 flex flex-col gap-3 flex-1 min-h-[220px]">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
                <span>📜</span> Move Notation
              </div>
              <button
                onClick={handleCopyPgn}
                disabled={history.length === 0}
                className="text-[11px] text-gray-400 hover:text-gray-200 transition px-2 py-0.5 rounded bg-gray-800 border border-gray-700 disabled:opacity-40"
              >
                {copiedPgn ? '✓ Copied' : 'Copy PGN'}
              </button>
            </div>

            <div className="flex-1 max-h-56 overflow-y-auto pr-1">
              {movePairs.length > 0 ? (
                <div className="grid grid-cols-12 text-xs font-mono gap-y-1">
                  {movePairs.map(p => (
                    <div key={p.num} className="contents hover:bg-gray-800/40">
                      <span className="col-span-2 text-gray-500 py-0.5">{p.num}.</span>
                      <span className="col-span-5 text-gray-200 py-0.5">{p.white}</span>
                      <span className="col-span-5 text-gray-400 py-0.5">{p.black}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic py-4 text-center">
                  Moves will appear here as you play.
                </div>
              )}
            </div>
          </div>

          {/* Stockfish Game & AI Elo Audit Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/60 via-gray-900 to-blue-950/60 border border-purple-700/60 flex flex-col gap-3 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold uppercase tracking-wider text-purple-200 flex items-center gap-1.5">
                <span>⚡</span> Stockfish Game & Elo Audit
              </div>
              <span className="text-[10px] text-purple-300 font-semibold px-2 py-0.5 rounded-full bg-purple-900/60 border border-purple-600/50">
                Stockfish 16 Engine
              </span>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Evaluate move accuracy, mistake classifications, and measure the <strong>calibrated Estimated Elo</strong> of the Human AI Model and yourself.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <button
                onClick={() => handleAnalyzeInCoach(aiColor)}
                disabled={history.length === 0}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg border border-purple-400/40"
              >
                🤖 Analyze AI's Elo & Play
              </button>
              <button
                onClick={() => handleAnalyzeInCoach(playerColor)}
                disabled={history.length === 0}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg border border-blue-400/40"
              >
                👤 Analyze My Play
              </button>
            </div>
            {history.length === 0 && (
              <span className="text-[10px] text-gray-500 italic text-center">
                Play at least 1 move on the board to enable Stockfish analysis.
              </span>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
