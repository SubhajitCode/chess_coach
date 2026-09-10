import { Chessboard } from 'react-chessboard'
import { useSparringSession } from './hooks/useSparringSession'
import MatchConfigCard from './components/MatchConfigCard'
import PlayerInfoBar from './components/PlayerInfoBar'
import AiCandidatesCard from './components/AiCandidatesCard'
import NotationCard from './components/NotationCard'
import GameOverBanner from './components/GameOverBanner'
import SparringToolbar from './components/SparringToolbar'
import EvalBar from '../../components/chess/EvalBar'

export default function PlayView() {
  const {
    playerColor,
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
  } = useSparringSession()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top Navbar */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-gray-900/90 border-b border-gray-800 backdrop-blur flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-800 cursor-pointer flex-shrink-0"
          >
            ← Dashboard
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg sm:text-xl flex-shrink-0">⚔️</span>
            <div className="min-w-0">
              <h1 className="text-xs sm:text-sm font-bold text-white tracking-wide flex items-center gap-1.5 flex-wrap">
                <span>Sparring Arena</span>
                <span className="px-1.5 sm:px-2 py-0.5 text-[10px] font-semibold rounded-full bg-purple-900/60 text-purple-300 border border-purple-700/60 truncate max-w-[140px] sm:max-w-none">
                  {engine === 'human_model'
                    ? '🧠 Human AI'
                    : engine === 'hybrid'
                    ? '♟️ Hybrid'
                    : '⚡ Stockfish'}
                </span>
              </h1>
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAnalyzeInCoach(playerColor)}
            disabled={history.length === 0}
            title="Analyze your own moves with Stockfish"
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
          >
            👤 Analyze My Play
          </button>
          <button
            type="button"
            onClick={() => handleAnalyzeInCoach(aiColor)}
            disabled={history.length === 0}
            title="Analyze the Human AI's gameplay with Stockfish"
            className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow flex items-center gap-1.5 border border-purple-400/30 cursor-pointer disabled:cursor-not-allowed"
          >
            🤖 Analyze AI with Stockfish
          </button>
        </div>
      </header>

      {/* Main Play Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-2 sm:p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        {/* Left Board Column (7 cols) */}
        <div className="lg:col-span-7 flex flex-col items-center gap-2.5 sm:gap-3 w-full max-w-[520px] mx-auto">
          {/* Opponent Info Bar */}
          <PlayerInfoBar
            isOpponent
            engine={engine}
            aiThinking={aiThinking}
          />

          {/* Chessboard container with EvalBar */}
          <div className="w-full relative flex gap-2 sm:gap-3 items-stretch justify-center p-2 rounded-2xl bg-gray-900/60 border border-gray-800/80 shadow-2xl">
            <EvalBar evalScore={lastEval} playerColor={playerColor} />

            <div className="w-full max-w-[480px] aspect-square flex-1 min-w-0">
              <Chessboard
                options={{
                  id: `sparring-board-${playerColor}`,
                  position: fen,
                  boardOrientation,
                  allowDragging: !gameOver && !aiThinking,
                  onPieceDrop: handlePlayerPieceDrop as any,
                  onSquareClick: handleSquareClick as any,
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
          <PlayerInfoBar
            isOpponent={false}
            playerColor={playerColor}
            isPlayerTurn={isPlayerTurn}
            onFlipBoard={() =>
              setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))
            }
          />

          {/* Game Over Banner */}
          <GameOverBanner
            gameOver={gameOver}
            playerColor={playerColor}
            aiColor={aiColor}
            onNewGame={() => handleStartGame(playerColor)}
            onAnalyzeMyPlay={handleAnalyzeInCoach}
            onAnalyzeAiPlay={handleAnalyzeInCoach}
          />

          {/* Action Toolbar */}
          <SparringToolbar
            historyLength={history.length}
            aiThinking={aiThinking}
            gameOver={gameOver}
            playerColor={playerColor}
            aiColor={aiColor}
            onNewGame={() => handleStartGame(playerColor)}
            onTakeback={handleTakeback}
            onResign={handleResign}
            onAnalyzeAi={handleAnalyzeInCoach}
            onAnalyzePlayer={handleAnalyzeInCoach}
          />
        </div>

        {/* Right Diagnostics & Match Controls Column (5 cols) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <MatchConfigCard
            engine={engine}
            setEngine={setEngine}
            playerColor={playerColor}
            onColorChange={(color) => handleStartGame(color)}
            temperature={temperature}
            setTemperature={setTemperature}
          />

          <AiCandidatesCard
            lastCandidates={lastCandidates}
            lastWinPct={lastWinPct}
          />

          <NotationCard
            movePairs={movePairs}
            historyLength={history.length}
            copiedPgn={copiedPgn}
            onCopyPgn={handleCopyPgn}
          />

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
              Evaluate move accuracy, mistake classifications, and measure the{' '}
              <strong>calibrated Estimated Elo</strong> of the Human AI Model and
              yourself.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => handleAnalyzeInCoach(aiColor)}
                disabled={history.length === 0}
                className="w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg border border-purple-400/40 cursor-pointer"
              >
                🤖 Analyze AI's Elo & Play
              </button>
              <button
                type="button"
                onClick={() => handleAnalyzeInCoach(playerColor)}
                disabled={history.length === 0}
                className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-lg border border-blue-400/40 cursor-pointer"
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
