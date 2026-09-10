import { Chessboard } from 'react-chessboard'
import { useAnalysisSession } from './hooks/useAnalysisSession'
import AnalysisHeader from './components/AnalysisHeader'
import SummaryPerformancePanel from './components/SummaryPerformancePanel'
import GameOverviewPanel from './components/GameOverviewPanel'
import PracticeCTA from './components/PracticeCTA'
import DeviationPanel from './components/DeviationPanel'
import CoachPanel from '../coach/CoachPanel'
import EvalBar from '../../components/chess/EvalBar'
import EvalChart from '../../components/chess/EvalChart'
import MoveTable from '../../components/chess/MoveTable'
import BoardNavigation from '../../components/chess/BoardNavigation'
import Tabs from '../../components/ui/Tabs'
import { CLASSIFICATION_BADGE } from '../../core/chess/moveClassifier'
import { prettifyOpening } from '../../core/chess/pgnParser'

export default function AnalysisView() {
  const {
    game,
    username,
    playerColor,
    setPlayerColor,
    streamedMoves,
    totalMoves,
    currentIndex,
    setCurrentIndex,
    summary,
    gameMeta,
    analyzing,
    analyzeError,
    analyzedCount,
    selectedEngine,
    setSelectedEngine,
    availableEngines,
    moveCoaching,
    coachProfile,
    coachLoading,
    coachError,
    gameOverview,
    overviewLoading,
    overviewError,
    depth,
    setDepth,
    showArrows,
    setShowArrows,
    trackLatest,
    setTrackLatestState,
    fromCache,
    bestLinePreview,
    setBestLinePreview,
    clearPreviewState,
    previewActiveRef,
    rightTab,
    switchRightTab,
    exploreMode,
    exploreStack,
    exploreAnalyzing,
    exploreBoardFen,
    boardPosition,
    analysisArrows,
    highlightSquares,
    currentMove,
    currentEval,
    hasMoveCoaching,
    fullAnalysis,
    maxNavigableIndex,
    handleAnalyze,
    handleStopAnalysis,
    handleMoveClick,
    handleRequestOverview,
    handleRequestCoaching,
    handleEnterExplore,
    handleExitExplore,
    handleExploreUndo,
    handleExploreReset,
    handleExplorePieceDrop,
    navigate,
  } = useAnalysisSession()

  if (!game?.pgn) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-400">
        No game selected.{' '}
        <button
          type="button"
          onClick={() => navigate('/')}
          className="ml-2 text-blue-400 underline cursor-pointer"
        >
          Go back
        </button>
      </div>
    )
  }

  const opponent = playerColor === 'white' ? game.black : game.white

  const analysisTabs = [
    { id: 'moves', label: 'Moves', icon: '📋' },
    { id: 'coach', label: 'Coach', icon: '🎓', badge: hasMoveCoaching },
    ...(exploreMode ? [{ id: 'explore', label: 'Explore', icon: '🔍' }] : []),
  ]

  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-gray-950 text-gray-100 flex flex-col">
      <AnalysisHeader
        game={game}
        gameMeta={gameMeta}
        fromCache={fromCache}
        selectedEngine={selectedEngine}
        setSelectedEngine={setSelectedEngine}
        availableEngines={availableEngines}
        depth={depth}
        setDepth={setDepth}
        analyzing={analyzing}
        showArrows={showArrows}
        setShowArrows={setShowArrows}
        analyzedCount={analyzedCount}
        totalMoves={totalMoves}
        onAnalyze={handleAnalyze}
        onStop={handleStopAnalysis}
        onBack={() => navigate('/')}
      />

      {/* Error Banner */}
      {analyzeError && (
        <div className="flex-shrink-0 px-3 sm:px-6 pt-2 max-w-7xl w-full mx-auto">
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">
            {analyzeError}
          </div>
        </div>
      )}

      <main className="flex-1 lg:overflow-hidden min-h-0 overflow-y-auto">
        <div className="h-full max-w-7xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Left: Board Column */}
          <div className="w-full max-w-[min(550px,calc(100vh-200px))] mx-auto lg:mx-0 flex flex-col gap-2 flex-shrink-0 lg:overflow-y-auto">
            {/* Opponent label */}
            <div className="flex items-center gap-2 px-1 ml-[30px]">
              <div
                className={`w-4 h-4 rounded-sm flex-shrink-0 ${
                  playerColor === 'white'
                    ? 'bg-gray-700 border border-gray-500'
                    : 'bg-gray-200'
                }`}
              />
              <span className="text-sm text-gray-300 font-medium truncate">
                {opponent}
              </span>
            </div>

            {/* Eval Bar + Board row */}
            <div className="flex gap-2 items-stretch justify-center w-full">
              <EvalBar evalScore={currentEval} />

              {/* Board */}
              <div className="w-full max-w-[min(520px,calc(100vh-230px))] aspect-square rounded-xl overflow-hidden border border-gray-700 shadow-2xl relative flex-1 min-w-0">
                {bestLinePreview && !exploreMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-emerald-900/90 border border-emerald-600 rounded-full text-[11px] text-emerald-300 font-medium pointer-events-none">
                    Previewing best line
                  </div>
                )}
                {exploreMode && (
                  <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-purple-900/90 border border-purple-600 rounded-full text-[11px] text-purple-300 font-medium pointer-events-none">
                    {exploreStack.length === 0
                      ? '🔍 Explore — drag a piece'
                      : `🔍 Exploring (+${exploreStack.length})`}
                  </div>
                )}
                <Chessboard
                  options={{
                    id: `analysis-board-${playerColor}`,
                    position: exploreMode
                      ? bestLinePreview?.fen?.split(' ')[0] ??
                        exploreBoardFen?.split(' ')[0] ??
                        boardPosition
                      : boardPosition,
                    boardOrientation: playerColor,
                    allowDragging: exploreMode && !bestLinePreview,
                    onPieceDrop: exploreMode
                      ? (handleExplorePieceDrop as any)
                      : undefined,
                    animationDurationInMs: bestLinePreview ? 0 : 200,
                    boardStyle: { borderRadius: '0' },
                    darkSquareStyle: {
                      backgroundColor: exploreMode ? '#3d6b4f' : '#4a7c59',
                    },
                    lightSquareStyle: {
                      backgroundColor: exploreMode ? '#d4c5a0' : '#f0d9b5',
                    },
                    squareStyles: bestLinePreview
                      ? {}
                      : exploreMode
                      ? {}
                      : highlightSquares,
                    arrows: (exploreMode ? [] : analysisArrows) as any,
                  }}
                />
              </div>
            </div>

            {/* Player label */}
            <div className="flex items-center gap-2 px-1 ml-[30px]">
              <div
                className={`w-4 h-4 rounded-sm flex-shrink-0 ${
                  playerColor === 'white'
                    ? 'bg-gray-200'
                    : 'bg-gray-700 border border-gray-500'
                }`}
              />
              <span className="text-sm text-gray-300 font-medium truncate">
                {username || (playerColor === 'white' ? game.white : game.black)}
              </span>
            </div>

            {/* Navigation */}
            <BoardNavigation
              activeIndex={currentIndex}
              maxNavigableIndex={maxNavigableIndex}
              currentMove={currentMove}
              onFirst={() => {
                setTrackLatestState(false)
                clearPreviewState()
                setCurrentIndex(-1)
              }}
              onPrev={() => {
                setTrackLatestState(false)
                clearPreviewState()
                setCurrentIndex((i) => Math.max(-1, i - 1))
              }}
              onNext={() => {
                setTrackLatestState(false)
                clearPreviewState()
                setCurrentIndex((i) => Math.min(maxNavigableIndex, i + 1))
              }}
              onLast={() => {
                setTrackLatestState(false)
                clearPreviewState()
                setCurrentIndex(maxNavigableIndex)
              }}
            />

            {/* Explore Mode toggle button */}
            {!analyzing && streamedMoves.length > 0 && (
              <button
                type="button"
                onClick={exploreMode ? handleExitExplore : handleEnterExplore}
                className={`text-xs py-1.5 px-3 rounded-lg border transition-colors text-center ml-[30px] cursor-pointer ${
                  exploreMode
                    ? 'border-purple-500 text-purple-300 bg-purple-900/30 hover:bg-purple-900/50'
                    : 'border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-300'
                }`}
              >
                {exploreMode ? '✕ Exit Explore' : '🔍 Explore this position'}
              </button>
            )}

            {/* Move classification badge */}
            {currentMove && currentMove.classification && (
              <div className="flex items-center gap-2 px-1 ml-[30px]">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    CLASSIFICATION_BADGE[currentMove.classification]?.color ||
                    'bg-gray-700'
                  }`}
                >
                  {CLASSIFICATION_BADGE[currentMove.classification]?.label}
                </span>
                {currentMove.best_move_san &&
                  currentMove.classification !== 'best' && (
                    <span className="text-xs text-gray-400">
                      Best:{' '}
                      <span className="font-mono text-emerald-400 font-semibold">
                        {currentMove.best_move_san}
                      </span>
                    </span>
                  )}
                <span className="ml-auto">
                  {currentEval !== null && (
                    <span
                      className={`text-xs font-mono font-bold ${
                        currentEval >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {currentEval >= 9000
                        ? 'M+'
                        : currentEval <= -9000
                        ? 'M-'
                        : `${(currentEval / 100).toFixed(2)}`}
                    </span>
                  )}
                </span>
              </div>
            )}

            {/* Track latest toggle when streaming */}
            {analyzing && streamedMoves.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const nextValue = !trackLatest
                  setTrackLatestState(nextValue)
                  if (nextValue && streamedMoves.length > 0) {
                    clearPreviewState()
                    setCurrentIndex(streamedMoves.length - 1)
                  }
                }}
                className={`text-xs py-1.5 px-3 rounded-lg border transition-colors text-center ml-[30px] cursor-pointer ${
                  trackLatest
                    ? 'border-blue-500 text-blue-400 bg-blue-900/20'
                    : 'border-gray-600 text-gray-500 hover:border-gray-400 hover:text-gray-400'
                }`}
              >
                {trackLatest ? '📍 Tracking latest move' : '📌 Track latest'}
              </button>
            )}

            {!analyzing && streamedMoves.length === 0 && (
              <div className="text-center text-xs text-gray-500 py-1 ml-[30px]">
                ← Use arrow keys or click moves to navigate
              </div>
            )}
          </div>

          {/* Right Panel: Tabbed Navigation & Panels */}
          <div className="flex-1 min-w-0 flex flex-col lg:overflow-hidden lg:min-h-0">
            {streamedMoves.length > 0 && (
              <Tabs
                tabs={analysisTabs}
                activeTab={rightTab}
                onTabChange={switchRightTab}
              />
            )}

            <div className="flex-1 lg:overflow-y-auto min-h-0 py-3 sm:py-4">
              {/* Moves Tab */}
              {(rightTab === 'moves' || streamedMoves.length === 0) && (
                <div className="flex flex-col gap-4">
                  {!analyzing && streamedMoves.length === 0 && (
                    <div className="bg-gray-900 rounded-xl border border-gray-700 border-dashed p-8 text-center">
                      <div className="text-4xl mb-3">♟</div>
                      <h3 className="text-gray-200 font-semibold mb-1">
                        Ready to analyze
                      </h3>
                      <p className="text-gray-500 text-sm mb-4">
                        Click{' '}
                        <span className="text-blue-400 font-medium">
                          ▶ Analyze
                        </span>{' '}
                        in the header to start Stockfish analysis.
                      </p>
                      <button
                        type="button"
                        onClick={handleAnalyze}
                        className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-all cursor-pointer"
                      >
                        ▶ Analyze Game
                      </button>
                    </div>
                  )}

                  {analyzing && streamedMoves.length === 0 && (
                    <div className="bg-gray-900 rounded-xl border border-blue-800/40 p-6 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                          </span>
                          <div>
                            <h4 className="text-sm font-semibold text-white">Starting Engine Analysis</h4>
                            <p className="text-xs text-gray-400">
                              Evaluating {totalMoves} moves with {availableEngines.find((e) => e.id === selectedEngine)?.name || selectedEngine}...
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-blue-400 font-medium">0 / {totalMoves}</span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Initial engine analysis progress"
                        aria-valuenow={0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="w-full bg-gray-800 rounded-full h-2 overflow-hidden"
                      >
                        <div className="h-full bg-blue-500 animate-pulse rounded-full w-1/6" />
                      </div>
                    </div>
                  )}

                  {analyzing && streamedMoves.length > 0 && (
                    <div className="bg-gray-900/90 rounded-xl border border-blue-900/60 p-3.5 flex flex-col gap-2 shadow-sm">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-blue-300 font-medium">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                          </span>
                          <span>Analyzing moves with engine...</span>
                        </div>
                        <span className="font-mono text-gray-300 font-semibold">
                          {analyzedCount} / {totalMoves} moves ({totalMoves > 0 ? Math.round((analyzedCount / totalMoves) * 100) : 0}%)
                        </span>
                      </div>
                      <div
                        role="progressbar"
                        aria-label="Live analysis progress"
                        aria-valuenow={totalMoves > 0 ? Math.round((analyzedCount / totalMoves) * 100) : 0}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        className="w-full bg-gray-800 rounded-full h-2 overflow-hidden shadow-inner"
                      >
                        <div
                          className="h-full bg-gradient-to-r from-blue-600 via-blue-500 to-emerald-400 transition-all duration-300 rounded-full"
                          style={{
                            width: `${totalMoves > 0 ? Math.round((analyzedCount / totalMoves) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {streamedMoves.length > 0 && (
                    <EvalChart
                      moves={streamedMoves}
                      currentIndex={currentIndex}
                      onMoveClick={handleMoveClick}
                    />
                  )}

                  {streamedMoves.length > 0 && (
                    <MoveTable
                      moves={streamedMoves}
                      currentIndex={currentIndex}
                      onMoveClick={handleMoveClick}
                    />
                  )}

                  {(summary ||
                    (analyzing && streamedMoves.length > 0)) && (
                    <SummaryPerformancePanel
                      summary={summary}
                      streamedMoves={streamedMoves}
                      playerColor={playerColor}
                      onSelectColor={setPlayerColor}
                      whiteName={game?.white || 'White'}
                      blackName={game?.black || 'Black'}
                      analyzing={analyzing}
                      opening={prettifyOpening(
                        gameMeta?.opening || game?.opening
                      )}
                    />
                  )}

                  {(streamedMoves.length > 0 ||
                    overviewLoading ||
                    overviewError ||
                    gameOverview) && (
                    <GameOverviewPanel
                      overview={gameOverview}
                      loading={overviewLoading}
                      error={overviewError}
                      onRetry={handleRequestOverview}
                    />
                  )}

                  {!analyzing && streamedMoves.length > 0 && (
                    <PracticeCTA
                      moves={streamedMoves}
                      playerColor={playerColor}
                      onOpen={() =>
                        navigate('/practice', {
                          state: {
                            moves: streamedMoves,
                            pgn: game.pgn,
                            playerColor,
                            username,
                            gameInfo: {
                              white: game.white,
                              black: game.black,
                              result: game.result,
                              time_control: game.time_control,
                              opening: game.opening,
                            },
                          },
                        })
                      }
                    />
                  )}
                </div>
              )}

              {/* Coach Tab */}
              {rightTab === 'coach' && streamedMoves.length > 0 && (
                <CoachPanel
                  moveCoaching={moveCoaching}
                  currentIndex={currentIndex}
                  currentMove={currentMove}
                  playerColor={playerColor}
                  loading={coachLoading}
                  error={coachError}
                  hasAnalysis={!!fullAnalysis}
                  coachingProfile={coachProfile}
                  onRequest={handleRequestCoaching}
                  analyzing={analyzing}
                  onPreviewBestLineStep={setBestLinePreview}
                  onResetBestLinePreview={clearPreviewState}
                  onPreviewModeChange={(active) => {
                    previewActiveRef.current = active
                  }}
                />
              )}

              {/* Explore Tab */}
              {rightTab === 'explore' && exploreMode && (
                <DeviationPanel
                  key={`explore-${currentIndex}-${exploreStack.length}`}
                  exploreStack={exploreStack}
                  analyzing={exploreAnalyzing}
                  playerColor={playerColor}
                  gameMoveNumber={currentMove?.move_number}
                  username={username}
                  onPreviewStep={(step) =>
                    setBestLinePreview({
                      fen: step.fenAfter,
                      from: step.from,
                      to: step.to,
                    })
                  }
                  onExitPreview={clearPreviewState}
                  onPreviewModeChange={(active) => {
                    previewActiveRef.current = active
                  }}
                  onUndo={handleExploreUndo}
                  onReset={handleExploreReset}
                  onExit={handleExitExplore}
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
