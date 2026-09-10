import { Chessboard } from 'react-chessboard'
import { usePracticeSession } from './hooks/usePracticeSession'
import PracticeHeader from './components/PracticeHeader'
import PracticePromptCard from './components/PracticePromptCard'
import PracticeControls from './components/PracticeControls'
import PracticeLinePreview from './components/PracticeLinePreview'
import EmptyState from './components/EmptyState'
import DoneSummary from './components/DoneSummary'
import EvalBar from '../../components/chess/EvalBar'

export default function PracticeView() {
  const {
    state,
    moves,
    playerColor,
    gameInfo,
    filter,
    step,
    phase,
    attempts,
    hintsUsed,
    streak,
    maxStreak,
    solvedCount,
    done,
    results,
    shake,
    current,
    showAnswer,
    filtered,
    isPuzzlePosition,
    reviewFen,
    reviewIndex,
    reviewLabel,
    allMistakes,
    mineCount,
    oppCount,
    squareStyles,
    arrows,
    arrowMode,
    setArrowMode,
    currentEvalScore,
    explanations,
    bestLinePreview,
    setBestLinePreview,
    bestLineSteps,
    setBestLineSteps,
    bestLineIdx,
    setBestLineIdx,
    devLineSteps,
    setDevLineSteps,
    devLineIdx,
    setDevLineIdx,
    handlePieceDrop,
    handleHint,
    handleSkip,
    handleExplain,
    handleNext,
    handleReviewPrev,
    handleReviewNext,
    handleResetToPuzzlePosition,
    handleFilterChange,
    resetPuzzleState,
    navigate,
  } = usePracticeSession()

  if (!state || moves.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        No practice data.{' '}
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="ml-2 text-blue-400 underline cursor-pointer"
        >
          Go back
        </button>
      </div>
    )
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        filter={filter}
        mineCount={mineCount}
        oppCount={oppCount}
        setFilter={handleFilterChange}
        onBack={() => navigate(-1)}
      />
    )
  }

  if (done) {
    return (
      <DoneSummary
        solved={solvedCount}
        total={filtered.length}
        maxStreak={maxStreak}
        onRetry={resetPuzzleState}
        onBack={() => navigate(-1)}
      />
    )
  }

  const isMyMistake = current?.color === playerColor
  const explanation = current ? explanations[current.originalIdx] : undefined

  return (
    <>
      <style>{`
        @keyframes shake {
          0%,100%{transform:translateX(0)}
          15%{transform:translateX(-6px)}
          30%{transform:translateX(6px)}
          45%{transform:translateX(-5px)}
          60%{transform:translateX(5px)}
          75%{transform:translateX(-3px)}
          90%{transform:translateX(3px)}
        }
        @keyframes correctFlash {
          0%{box-shadow:0 0 0 0 rgba(34,197,94,0)}
          40%{box-shadow:0 0 32px 8px rgba(34,197,94,0.5)}
          100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}
        }
        .board-shake { animation: shake 0.5s ease-in-out; }
        .board-correct { animation: correctFlash 0.8s ease-out; }
      `}</style>

      <div className="min-h-screen bg-[#0d1117] text-gray-100 flex flex-col select-none">
        <PracticeHeader
          gameInfo={gameInfo}
          filtered={filtered}
          results={results}
          step={step}
          streak={streak}
          filter={filter}
          allMistakesCount={allMistakes.length}
          mineCount={mineCount}
          oppCount={oppCount}
          onFilterChange={handleFilterChange}
          onBack={() => navigate(-1)}
        />

        <main className="flex-1 flex items-start justify-center p-2 sm:p-4">
          <div className="grid gap-4 sm:gap-8 items-start w-full max-w-screen-2xl mx-auto grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            {/* Board Column */}
            <div className="flex flex-col items-center gap-3 w-full max-w-[540px] mx-auto flex-shrink-0">
              <div className="flex items-center gap-2 w-full">
                <div
                  className={`w-4 h-4 rounded-sm border flex-shrink-0 ${
                    current?.color === 'white'
                      ? 'bg-gray-100 border-gray-300'
                      : 'bg-gray-900 border-gray-500'
                  }`}
                />
                <span className="text-sm font-medium text-gray-300 capitalize">
                  {current?.color} to move
                </span>
              </div>

              {/* Board container */}
              <div className="w-full max-w-[540px] mx-auto lg:max-w-[min(900px,calc(100vw-420px))]">
                <div className="flex items-start gap-2 sm:gap-4 aspect-square">
                  <div className="w-7 sm:w-8 flex-shrink-0 h-full flex items-center justify-center">
                    <EvalBar evalScore={currentEvalScore} />
                  </div>
                  <div
                    className={`flex-1 aspect-square rounded-xl overflow-hidden border shadow-2xl transition-all duration-300 mx-auto ${
                      shake
                        ? 'border-red-600 board-shake'
                        : phase === 'correct'
                        ? 'border-emerald-500 board-correct'
                        : phase === 'revealed'
                        ? 'border-gray-600'
                        : 'border-gray-700'
                    }`}
                  >
                    <Chessboard
                      options={{
                        id: 'practice-board',
                        position:
                          (bestLinePreview?.fen ?? reviewFen).split(' ')[0] ||
                          'start',
                        boardOrientation: current?.color || 'white',
                        allowDragging: phase === 'playing' && isPuzzlePosition,
                        boardStyle: { borderRadius: '0' },
                        darkSquareStyle: { backgroundColor: '#4a7c59' },
                        lightSquareStyle: { backgroundColor: '#f0d9b5' },
                        squareStyles,
                        arrows: arrows as any,
                        onPieceDrop: handlePieceDrop as any,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Line Preview toolbar */}
              <PracticeLinePreview
                current={current}
                explanation={explanation}
                arrowMode={arrowMode}
                setArrowMode={setArrowMode}
                bestLineSteps={bestLineSteps}
                setBestLineSteps={setBestLineSteps}
                bestLineIdx={bestLineIdx}
                setBestLineIdx={setBestLineIdx}
                devLineSteps={devLineSteps}
                setDevLineSteps={setDevLineSteps}
                devLineIdx={devLineIdx}
                setDevLineIdx={setDevLineIdx}
                setBestLinePreview={setBestLinePreview}
              />

              {/* Move review navigation */}
              <div className="flex w-full justify-between items-center px-1 gap-3">
                <span className="text-xs text-gray-600 font-mono">
                  Move {current?.move_number}
                </span>
                <span className="text-[11px] text-gray-500 truncate text-right">
                  {reviewLabel}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 sm:gap-2 w-full">
                <button
                  type="button"
                  onClick={handleReviewPrev}
                  disabled={reviewIndex <= -1}
                  className="py-2 text-[11px] sm:text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-[36px]"
                >
                  ← Prev move
                </button>
                <button
                  type="button"
                  onClick={handleResetToPuzzlePosition}
                  disabled={isPuzzlePosition}
                  className="py-2 text-[11px] sm:text-xs font-medium text-gray-200 border border-gray-600 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-[36px]"
                >
                  Puzzle position
                </button>
                <button
                  type="button"
                  onClick={handleReviewNext}
                  disabled={reviewIndex >= moves.length - 1}
                  className="py-2 text-[11px] sm:text-xs font-medium text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer min-h-[36px]"
                >
                  Next move →
                </button>
              </div>

              <div className="flex w-full justify-between items-center px-1 text-[11px] text-gray-600">
                <span>
                  {isMyMistake
                    ? '● Your mistake puzzle'
                    : '● Opponent mistake puzzle'}
                </span>
                <span>
                  {isPuzzlePosition ? 'Drag to solve' : 'Review only'}
                </span>
              </div>
            </div>

            {/* Prompt and Control Panel */}
            <div className="flex flex-col gap-4" style={{ width: 320 }}>
              <PracticePromptCard
                current={current}
                phase={phase}
                attempts={attempts}
                isMyMistake={isMyMistake}
                isPuzzlePosition={isPuzzlePosition}
                showAnswer={showAnswer}
                explanation={explanation}
                onExplain={handleExplain}
              />

              <PracticeControls
                phase={phase}
                hintsUsed={hintsUsed}
                onHint={handleHint}
                onSkip={handleSkip}
                onNext={handleNext}
              />
            </div>
          </div>
        </main>
      </div>
    </>
  )
}
