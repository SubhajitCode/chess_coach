export interface NotationCardProps {
  movePairs?: { num: number; white: string; black: string }[]
  historyLength?: number
  copiedPgn?: boolean
  onCopyPgn: () => void
}

export default function NotationCard({
  movePairs = [],
  historyLength = 0,
  copiedPgn = false,
  onCopyPgn,
}: NotationCardProps) {
  return (
    <div className="p-4 rounded-2xl bg-gray-900 border border-gray-800 flex flex-col gap-3 flex-1 min-h-[220px]">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5">
          <span>📜</span> Move Notation
        </div>
        <button
          type="button"
          onClick={onCopyPgn}
          disabled={historyLength === 0}
          className="text-[11px] text-gray-400 hover:text-gray-200 transition px-2 py-0.5 rounded bg-gray-800 border border-gray-700 disabled:opacity-40 cursor-pointer"
        >
          {copiedPgn ? '✓ Copied' : 'Copy PGN'}
        </button>
      </div>

      <div className="flex-1 max-h-56 overflow-y-auto pr-1">
        {movePairs.length > 0 ? (
          <div className="grid grid-cols-12 text-xs font-mono gap-y-1">
            {movePairs.map((p) => (
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
  )
}
