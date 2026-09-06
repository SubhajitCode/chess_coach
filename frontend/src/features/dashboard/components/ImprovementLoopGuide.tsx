export interface ImprovementLoopGuideProps {
  onPasteClick: () => void
  onSparringClick: () => void
}

export default function ImprovementLoopGuide({
  onPasteClick,
  onSparringClick,
}: ImprovementLoopGuideProps) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
          The 4-Step Improvement Loop
        </h3>
        <span className="text-[11px] text-purple-400 font-medium">
          Fast-track your rating
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded-xl bg-gray-850/80 border border-gray-800/80 flex flex-col justify-between gap-2">
          <div>
            <div className="font-bold text-gray-200 flex items-center gap-1.5 mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-950 text-blue-400 border border-blue-800 flex items-center justify-center text-[10px]">
                1
              </span>
              Load Games
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Fetch from Chess.com/Lichess or paste PGN notation directly.
            </p>
          </div>
          <button
            type="button"
            onClick={onPasteClick}
            className="text-[11px] text-blue-400 hover:text-blue-300 text-left font-medium cursor-pointer"
          >
            Paste PGN →
          </button>
        </div>

        <div className="p-3 rounded-xl bg-gray-850/80 border border-gray-800/80 flex flex-col justify-between gap-2">
          <div>
            <div className="font-bold text-gray-200 flex items-center gap-1.5 mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 flex items-center justify-center text-[10px]">
                2
              </span>
              Analyze & Audit
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Stockfish calculates your Estimated Elo and identifies critical swings.
            </p>
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">
            AI Key Moments
          </span>
        </div>

        <div className="p-3 rounded-xl bg-gray-850/80 border border-gray-800/80 flex flex-col justify-between gap-2">
          <div>
            <div className="font-bold text-gray-200 flex items-center gap-1.5 mb-1">
              <span className="w-5 h-5 rounded-full bg-purple-950 text-purple-400 border border-purple-800 flex items-center justify-center text-[10px]">
                3
              </span>
              Practice Mistakes
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Solve blunders like tactical puzzles with dynamic piece hints.
            </p>
          </div>
          <span className="text-[11px] text-purple-400 font-medium">
            Active Recall
          </span>
        </div>

        <div className="p-3 rounded-xl bg-gray-850/80 border border-gray-800/80 flex flex-col justify-between gap-2">
          <div>
            <div className="font-bold text-gray-200 flex items-center gap-1.5 mb-1">
              <span className="w-5 h-5 rounded-full bg-amber-950 text-amber-400 border border-amber-800 flex items-center justify-center text-[10px]">
                4
              </span>
              Sparring Arena
            </div>
            <p className="text-gray-400 text-[11px] leading-relaxed">
              Play against the 1400–1800 Human AI Model and test candidate lines.
            </p>
          </div>
          <button
            type="button"
            onClick={onSparringClick}
            className="text-[11px] text-amber-400 hover:text-amber-300 text-left font-medium cursor-pointer"
          >
            Enter Arena →
          </button>
        </div>
      </div>
    </section>
  )
}
