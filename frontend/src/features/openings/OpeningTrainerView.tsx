import { useEffect } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { Chessboard } from 'react-chessboard'
import { useOpeningTrainer } from './hooks/useOpeningTrainer'
import ExplanationCard from './components/ExplanationCard'
import StatsCard from './components/StatsCard'
import FeedbackBanner from './components/FeedbackBanner'
import CompletionCard from './components/CompletionCard'
import NotationPanel from './components/NotationPanel'
import type { OpeningScenario } from '../../types/openings'

export default function OpeningTrainerView() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as {
    eco: string
    name: string
    trainAs: 'white' | 'black'
    scenarioId?: string
    adaptive?: boolean
  }

  useEffect(() => {
    if (!state) {
      navigate('/openings')
    }
  }, [state, navigate])

  if (!state) return null

  const {
    session,
    fen,
    moveHistory,
    isLoading,
    error,
    boardShake,
    squaresToHighlight,
    feedbackType,
    feedbackMessage,
    feedbackSubMessage,
    wrongDetails,
    explanation,
    stats,
    comfortLevel,
    accuracy,
    isAdaptive,
    isOpponentThinking,
    branchNotification,
    availableScenarios,
    activeScenario,
    handlePieceDrop,
    handleHint,
    handleSkip,
    handleReset,
    handleSelectScenario,
    handleToggleAdaptive,
  } = useOpeningTrainer({
    eco: state.eco,
    openingName: state.name,
    trainAs: state.trainAs,
    scenarioId: state.scenarioId,
    adaptive: state.adaptive,
  })

  if (isLoading && !session) {
    return (
      <div className="min-h-screen bg-gray-950 p-8 flex flex-col justify-center items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
        <div className="text-gray-400 text-sm">Loading deep opening scenarios...</div>
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen bg-gray-950 p-8 flex flex-col justify-center items-center gap-4">
        <div className="text-red-400 bg-red-900/30 p-4 rounded-xl border border-red-800 text-center max-w-md">
          {error || 'Failed to initialize session'}
        </div>
        <button
          type="button"
          onClick={() => navigate('/openings')}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
        >
          Back to Openings
        </button>
      </div>
    )
  }

  const { state: sessionState } = session
  const isWhite = state.trainAs === 'white'

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 lg:p-8 text-gray-100">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-900/80 rounded-2xl p-4 sm:p-5 border border-gray-800/80 shadow-xl">
          <div className="flex items-center gap-3.5">
            <Link
              to="/openings"
              className="p-2 bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl transition-all border border-gray-700"
              title="Back to Openings"
            >
              ← Back
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="bg-blue-900/50 border border-blue-700/60 text-blue-300 text-xs font-mono font-bold px-2 py-0.5 rounded">
                  {state.eco}
                </span>
                <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  {state.name}
                </h1>
                {activeScenario && (
                  <span className="text-xs text-gray-400 font-normal">
                    • {activeScenario.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-1 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${isWhite ? 'bg-white' : 'bg-gray-950 border border-gray-500'}`} />
                  Training as <span className="font-semibold text-gray-300">{isWhite ? 'White' : 'Black'}</span>
                </div>
                <span>•</span>
                <span className="text-emerald-400 font-mono font-medium">
                  {sessionState.total_moves} half-moves deep
                </span>
                <span>•</span>
                {isOpponentThinking ? (
                  <span className="text-amber-400 font-semibold animate-pulse flex items-center gap-1 bg-amber-950/70 border border-amber-800/80 px-2 py-0.5 rounded-md">
                    <span>♟️</span> Opponent moving...
                  </span>
                ) : sessionState.completed ? (
                  <span className="text-emerald-400 font-semibold bg-emerald-950/70 border border-emerald-800/80 px-2 py-0.5 rounded-md">
                    ✓ Completed
                  </span>
                ) : (
                  <span className="text-blue-400 font-medium bg-blue-950/50 border border-blue-800/60 px-2 py-0.5 rounded-md">
                    Your turn
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="w-full sm:w-auto text-left sm:text-right flex sm:flex-col justify-between items-center sm:items-end gap-2">
            <div className="text-xs font-medium text-gray-400">
              Move <span className="text-white font-bold">{sessionState.move_index}</span> of {sessionState.total_moves}
            </div>
            <div className="w-36 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${sessionState.progress_pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Multi-Scenario Bar */}
        {availableScenarios.length > 0 && (
          <div className="bg-gray-900/60 border border-gray-800/80 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-base">🎭</span>
                <h2 className="text-sm font-semibold text-gray-200">
                  Scenarios & Opponent Variations ({availableScenarios.length})
                </h2>
                <span className="text-xs text-gray-500">Pick a specific branch to drill or use Adaptive mode</span>
              </div>

              {/* Adaptive Opponent Mode Toggle */}
              <button
                type="button"
                onClick={() => handleToggleAdaptive(!isAdaptive)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
                  isAdaptive
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white ring-2 ring-purple-400/50'
                    : 'bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 border border-gray-700'
                }`}
                title="When active, the opponent randomly tests different branches at key decision points"
              >
                <span>🎲</span>
                <span>Adaptive Opponent Mode</span>
                {isAdaptive && <span className="text-[10px] bg-purple-950 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">ON</span>}
              </button>
            </div>

            {/* Scenario Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {availableScenarios.map((sc: OpeningScenario, idx: number) => {
                const isActive = activeScenario?.id === sc.id && !isAdaptive
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => handleSelectScenario(sc.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium flex-shrink-0 transition-all flex items-center gap-2 border ${
                      isActive
                        ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-900/40'
                        : 'bg-gray-800/60 hover:bg-gray-700/70 text-gray-300 border-gray-700/70 hover:text-white'
                    }`}
                  >
                    <span className="text-gray-400 font-mono text-[11px]">{idx + 1}.</span>
                    <span className="font-semibold">{sc.name.split(':')[1]?.trim() || sc.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isActive ? 'bg-blue-800 text-blue-100' : 'bg-gray-900 text-gray-400'}`}>
                      {sc.move_count} moves
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Active Scenario Strategic Guide */}
            {activeScenario && (
              <div className="bg-gray-950/60 border border-gray-800/60 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="font-semibold text-gray-200 text-sm">
                    {activeScenario.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {activeScenario.difficulty && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                        activeScenario.difficulty === 'Beginner'
                          ? 'bg-emerald-950 border-emerald-800 text-emerald-300'
                          : activeScenario.difficulty === 'Advanced'
                          ? 'bg-purple-950 border-purple-800 text-purple-300'
                          : 'bg-amber-950 border-amber-800 text-amber-300'
                      }`}>
                        {activeScenario.difficulty}
                      </span>
                    )}
                    <span className="text-gray-400 font-mono text-[11px]">
                      {activeScenario.move_count} moves deep
                    </span>
                  </div>
                </div>

                <p className="text-gray-300 leading-relaxed">
                  {activeScenario.description}
                </p>

                {activeScenario.key_ideas && activeScenario.key_ideas.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    <span className="text-gray-500 font-medium">Key ideas:</span>
                    {activeScenario.key_ideas.map((idea, i) => (
                      <span
                        key={i}
                        className="bg-gray-800/80 border border-gray-700/60 text-gray-300 px-2 py-0.5 rounded-md text-[11px]"
                      >
                        💡 {idea}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Dynamic Branch Notification Banner */}
        {branchNotification && (
          <div className="bg-gradient-to-r from-purple-900/60 to-indigo-900/60 border border-purple-600/70 p-3.5 rounded-xl flex items-center gap-3 animate-pulse shadow-lg">
            <span className="text-xl">⚡</span>
            <div>
              <div className="text-xs font-bold text-purple-300 uppercase tracking-wider">
                Dynamic Branch Activated
              </div>
              <div className="text-sm font-semibold text-white">
                {branchNotification}
              </div>
            </div>
          </div>
        )}

        {/* Main Columns: Board Left, Explanations Right */}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
          
          {/* Left Column: Board and Controls */}
          <div className="w-full lg:max-w-2xl flex flex-col gap-4">
            <div className={`rounded-2xl overflow-hidden border-4 ${
              feedbackType === 'correct'
                ? 'border-emerald-500 shadow-lg shadow-emerald-900/30'
                : feedbackType === 'wrong'
                ? 'border-red-500 shadow-lg shadow-red-900/30'
                : 'border-gray-800'
            } transition-colors duration-300 ${boardShake ? 'animate-shake' : ''}`}>
              <Chessboard
                options={{
                  id: "opening-trainer-board",
                  position: fen,
                  boardOrientation: state.trainAs,
                  onPieceDrop: handlePieceDrop as any,
                  darkSquareStyle: { backgroundColor: '#4b5563' },
                  lightSquareStyle: { backgroundColor: '#9ca3af' },
                  squareStyles: squaresToHighlight,
                  allowDragging: sessionState.is_user_turn && !isOpponentThinking && !sessionState.completed
                }}
              />
            </div>

            {/* Action Bar */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleHint}
                disabled={!sessionState.is_user_turn || isOpponentThinking || sessionState.completed}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-gray-700/60 cursor-pointer"
              >
                <span>💡</span> Hint
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={!sessionState.is_user_turn || isOpponentThinking || sessionState.completed}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-gray-700/60 cursor-pointer"
              >
                <span>⏭</span> Skip Move
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="bg-gray-800 hover:bg-gray-700 text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all border border-gray-700/60 cursor-pointer"
              >
                <span>🔄</span> Reset Drill
              </button>
            </div>
          </div>

          {/* Right Column: Notation Sheet, Feedback, Explanations, and Stats */}
          <div className="flex-1 w-full flex flex-col gap-4">
            <FeedbackBanner
              type={feedbackType}
              message={feedbackMessage}
              subMessage={feedbackSubMessage}
              wrongDetails={wrongDetails}
            />

            {/* Chess Notation Panel: live score table & target line follower */}
            <NotationPanel
              targetMoves={sessionState.target_moves}
              moveHistory={moveHistory}
              currentIndex={sessionState.move_index}
              totalMoves={sessionState.total_moves}
              isUserTurn={sessionState.is_user_turn}
              isOpponentThinking={isOpponentThinking}
              trainAs={state.trainAs}
              pgn={sessionState.scenario_pgn || activeScenario?.pgn || ''}
              completed={sessionState.completed}
              scenarioName={activeScenario?.name || sessionState.scenario_name || state.name}
              eco={state.eco}
            />

            {sessionState.completed && (
              <CompletionCard
                accuracy={accuracy}
                comfortLevel={comfortLevel}
                onRetry={handleReset}
              />
            )}

            {!sessionState.completed && explanation && (
              <ExplanationCard explanation={explanation} />
            )}

            {!sessionState.completed && stats && (
              <StatsCard stats={stats} />
            )}
          </div>
        </div>
      </div>

      <style>{`
        .animate-shake {
          animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
      `}</style>
    </div>
  )
}
