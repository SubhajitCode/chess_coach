import { analyzePosition } from '../../../api/chess'
import { decodeLine } from '../../../core/chess/fenTree'
import type { LineStep } from '../../../types/chess'
import type { PracticeExplanation, PracticeMoveItem } from '../hooks/usePracticeSession'

export interface PracticeLinePreviewProps {
  current?: PracticeMoveItem
  explanation?: PracticeExplanation
  arrowMode: 'original' | 'preview' | 'both'
  setArrowMode: (m: 'original' | 'preview' | 'both') => void
  bestLineSteps: LineStep[]
  setBestLineSteps: React.Dispatch<React.SetStateAction<LineStep[]>>
  bestLineIdx: number | null
  setBestLineIdx: (idx: number | null) => void
  devLineSteps: LineStep[]
  setDevLineSteps: React.Dispatch<React.SetStateAction<LineStep[]>>
  devLineIdx: number | null
  setDevLineIdx: (idx: number | null) => void
  setBestLinePreview: (preview: { fen: string; from: string; to: string } | null) => void
}

export default function PracticeLinePreview({
  current,
  explanation,
  arrowMode,
  setArrowMode,
  bestLineSteps,
  setBestLineSteps,
  bestLineIdx,
  setBestLineIdx,
  devLineSteps,
  setDevLineSteps,
  devLineIdx,
  setDevLineIdx,
  setBestLinePreview,
}: PracticeLinePreviewProps) {
  if (!current) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span className="text-[11px] text-gray-500 mr-1">Show arrows:</span>
        <button
          type="button"
          onClick={() => setArrowMode('original')}
          className={`px-2 py-1 text-xs rounded cursor-pointer ${
            arrowMode === 'original'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 text-gray-300'
          }`}
        >
          Original
        </button>
        <button
          type="button"
          onClick={() => setArrowMode('preview')}
          className={`px-2 py-1 text-xs rounded cursor-pointer ${
            arrowMode === 'preview'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 text-gray-300'
          }`}
        >
          Blunder
        </button>
        <button
          type="button"
          onClick={() => setArrowMode('both')}
          className={`px-2 py-1 text-xs rounded cursor-pointer ${
            arrowMode === 'both'
              ? 'bg-gray-700 text-white'
              : 'bg-gray-800 text-gray-300'
          }`}
        >
          Both
        </button>
      </div>

      {explanation?.bestLineUci && explanation.bestLineUci.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const uciList = explanation.bestLineUci || []
              const steps = decodeLine(current.fenBefore, uciList, 8)
              setBestLineSteps(steps)
              if (steps.length) {
                setBestLineIdx(0)
                setBestLinePreview({
                  fen: steps[0].fenAfter,
                  from: steps[0].from,
                  to: steps[0].to,
                })
              }

              try {
                const DEPTH_PREVIEW = 12
                const promises = steps.map((s, i) => {
                  const fenBefore =
                    s.fenBefore ||
                    (i === 0 ? current.fenBefore : steps[i - 1]?.fenAfter) ||
                    current.fenBefore
                  return analyzePosition(fenBefore, s.uci, DEPTH_PREVIEW, 1)
                    .then((res) => ({
                      i,
                      evalBefore: res.data.eval_before,
                      evalAfter: res.data.eval_after,
                    }))
                    .catch(() => null)
                })
                const results = await Promise.all(promises)
                setBestLineSteps((prev) =>
                  prev.map((p, idx) => {
                    const r = results.find((item) => item && item.i === idx)
                    return r
                      ? {
                          ...p,
                          evalBefore: r.evalBefore ?? p.evalBefore,
                          evalAfter: r.evalAfter ?? p.evalAfter,
                        }
                      : p
                  })
                )
              } catch {
                // ignore
              }
            }}
            className="px-3 py-1 text-xs rounded bg-gray-800 text-gray-200 cursor-pointer"
          >
            Preview engine best line
          </button>
          <button
            type="button"
            onClick={() => {
              if (bestLineIdx !== null && bestLineIdx > 0) {
                const ni = bestLineIdx - 1
                setBestLineIdx(ni)
                const s = bestLineSteps[ni]
                setBestLinePreview({
                  fen: s.fenAfter,
                  from: s.from,
                  to: s.to,
                })
              }
            }}
            disabled={!bestLineSteps?.length || bestLineIdx === null}
            className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40 cursor-pointer"
          >
            ‹
          </button>
          <div className="text-sm font-mono text-gray-200">
            {bestLineSteps?.length && bestLineIdx !== null
              ? bestLineSteps[bestLineIdx]?.san ?? ''
              : ''}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!bestLineSteps?.length) return
              if (bestLineIdx === null) {
                setBestLineIdx(0)
                setBestLinePreview({
                  fen: bestLineSteps[0].fenAfter,
                  from: bestLineSteps[0].from,
                  to: bestLineSteps[0].to,
                })
              } else if (bestLineIdx < bestLineSteps.length - 1) {
                const ni = bestLineIdx + 1
                setBestLineIdx(ni)
                const s = bestLineSteps[ni]
                setBestLinePreview({
                  fen: s.fenAfter,
                  from: s.from,
                  to: s.to,
                })
              }
            }}
            disabled={!bestLineSteps?.length}
            className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40 cursor-pointer"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              setBestLinePreview(null)
              setBestLineIdx(null)
              setBestLineSteps([])
            }}
            className="px-2 py-1 text-xs rounded bg-gray-800 cursor-pointer"
          >
            Stop
          </button>
        </div>
      )}

      {explanation?.deviationBestLineUci && explanation.deviationBestLineUci.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const uciList = explanation.deviationBestLineUci || []
              const startFen = explanation.fenAfter || current.fenBefore
              const steps = decodeLine(startFen, uciList, 8)
              setDevLineSteps(steps)
              if (steps.length) {
                setDevLineIdx(0)
                setBestLinePreview({
                  fen: steps[0].fenAfter,
                  from: steps[0].from,
                  to: steps[0].to,
                })
              }

              try {
                const DEPTH_PREVIEW = 12
                const promises = steps.map((s, i) => {
                  const fenBefore =
                    s.fenBefore ||
                    (i === 0 ? startFen : steps[i - 1]?.fenAfter) ||
                    startFen
                  return analyzePosition(fenBefore, s.uci, DEPTH_PREVIEW, 1)
                    .then((res) => ({
                      i,
                      evalBefore: res.data.eval_before,
                      evalAfter: res.data.eval_after,
                    }))
                    .catch(() => null)
                })
                const results = await Promise.all(promises)
                setDevLineSteps((prev) =>
                  prev.map((p, idx) => {
                    const r = results.find((item) => item && item.i === idx)
                    return r
                      ? {
                          ...p,
                          evalBefore: r.evalBefore ?? p.evalBefore,
                          evalAfter: r.evalAfter ?? p.evalAfter,
                        }
                      : p
                  })
                )
              } catch {
                // ignore
              }
            }}
            className="px-3 py-1 text-xs rounded bg-gray-800 text-gray-200 cursor-pointer"
          >
            Preview continuation after played move
          </button>
          <button
            type="button"
            onClick={() => {
              if (devLineIdx !== null && devLineIdx > 0) {
                const ni = devLineIdx - 1
                setDevLineIdx(ni)
                const s = devLineSteps[ni]
                setBestLinePreview({
                  fen: s.fenAfter,
                  from: s.from,
                  to: s.to,
                })
              }
            }}
            disabled={!devLineSteps?.length || devLineIdx === null}
            className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40 cursor-pointer"
          >
            ‹
          </button>
          <div className="text-sm font-mono text-gray-200">
            {devLineSteps?.length && devLineIdx !== null ? devLineSteps[devLineIdx]?.san ?? '' : ''}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!devLineSteps?.length) return
              if (devLineIdx === null) {
                setDevLineIdx(0)
                setBestLinePreview({
                  fen: devLineSteps[0].fenAfter,
                  from: devLineSteps[0].from,
                  to: devLineSteps[0].to,
                })
              } else if (devLineIdx < devLineSteps.length - 1) {
                const ni = devLineIdx + 1
                setDevLineIdx(ni)
                const s = devLineSteps[ni]
                setBestLinePreview({
                  fen: s.fenAfter,
                  from: s.from,
                  to: s.to,
                })
              }
            }}
            disabled={!devLineSteps?.length}
            className="px-2 py-1 text-xs rounded bg-gray-800 disabled:opacity-40 cursor-pointer"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => {
              setBestLinePreview(null)
              setDevLineIdx(null)
              setDevLineSteps([])
            }}
            className="px-2 py-1 text-xs rounded bg-gray-800 cursor-pointer"
          >
            Stop
          </button>
        </div>
      )}
    </div>
  )
}
