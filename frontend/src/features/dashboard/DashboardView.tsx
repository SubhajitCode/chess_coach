import { useDashboard } from './hooks/useDashboard'
import ProfileForm from './components/ProfileForm'
import CoachPlanCard from './components/CoachPlanCard'
import ResumeSessionCard from './components/ResumeSessionCard'
import ImprovementLoopGuide from './components/ImprovementLoopGuide'
import GameFetchForm from './components/GameFetchForm'
import GameList from './components/GameList'

export default function DashboardView() {
  const {
    profile,
    profileSaving,
    profileNotice,
    activePlan,
    planProfile,
    lastSession,
    games,
    loading,
    error,
    cacheStatus,
    gamesSource,
    selectedGame,
    sortMode,
    setSortMode,
    playerColor,
    setPlayerColor,
    customPgn,
    setCustomPgn,
    showPasteModal,
    setShowPasteModal,
    profileModalOpen,
    setProfileModalOpen,
    handleSaveProfile,
    handleFetchGames,
    handleSelectGame,
    handleAnalyzeCustomPgn,
    handleResumeSession,
    navigate,
  } = useDashboard()

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">♟</span>
            <div>
              <h1 className="text-lg font-bold text-white tracking-wide">
                Chess Coach & Analyzer
              </h1>
              <p className="text-xs text-gray-400">
                Turn your blunders into breakthroughs
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/play')}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-all shadow flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚔️</span> Sparring Arena
            </button>
            <button
              type="button"
              onClick={() => setShowPasteModal(true)}
              className="px-3 py-1.5 text-xs text-gray-300 hover:text-white border border-gray-700 rounded-lg hover:border-gray-500 transition-colors cursor-pointer"
            >
              Paste PGN
            </button>
            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="px-3 py-1.5 text-xs text-blue-400 border border-blue-900/60 rounded-lg hover:bg-blue-950/40 transition-colors cursor-pointer"
            >
              {profile.username ? `Coach: ${profile.username}` : 'Setup Profile'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8 flex flex-col gap-6">
        <ResumeSessionCard
          lastSession={lastSession}
          onResume={handleResumeSession}
        />

        <CoachPlanCard
          activePlan={activePlan}
          planProfile={planProfile}
          onEditProfile={() => setProfileModalOpen(true)}
        />

        <ImprovementLoopGuide
          onPasteClick={() => setShowPasteModal(true)}
          onSparringClick={() => navigate('/play')}
        />

        <GameFetchForm
          profile={profile}
          loading={loading}
          gamesSource={gamesSource}
          onFetch={handleFetchGames}
          onOpenProfile={() => setProfileModalOpen(true)}
        />

        {error && (
          <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <GameList
          games={games}
          loading={loading}
          selectedGame={selectedGame}
          onSelectGame={handleSelectGame}
          gamesSource={gamesSource}
          username={profile.username}
          sortMode={sortMode}
          onSortChange={setSortMode}
          cacheStatus={cacheStatus}
        />
      </main>

      {/* Profile Modal */}
      {profileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Coaching Profile</h2>
              <button
                type="button"
                onClick={() => setProfileModalOpen(false)}
                className="text-gray-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <ProfileForm
              profile={profile}
              saving={profileSaving}
              notice={profileNotice}
              onSave={handleSaveProfile}
              onCancel={() => setProfileModalOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Paste PGN Modal */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Analyze Custom PGN</h2>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-gray-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <textarea
              rows={6}
              placeholder="Paste PGN here... (e.g. 1. e4 e5 2. Nf3...)"
              value={customPgn}
              onChange={(e) => setCustomPgn(e.target.value)}
              className="w-full rounded-xl border border-gray-700 bg-gray-800 p-3 text-xs text-gray-100 font-mono placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <span>Analyze as:</span>
                <button
                  type="button"
                  onClick={() => setPlayerColor('white')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                    playerColor === 'white'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  White
                </button>
                <button
                  type="button"
                  onClick={() => setPlayerColor('black')}
                  className={`px-2.5 py-1 rounded-md font-medium cursor-pointer ${
                    playerColor === 'black'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  Black
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPasteModal(false)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAnalyzeCustomPgn}
                  disabled={!customPgn.trim()}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-medium rounded-lg transition-colors cursor-pointer"
                >
                  Analyze
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
