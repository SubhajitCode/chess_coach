import { useState, useMemo, useCallback } from 'react'
import { decodeLine } from '../../core/chess/fenTree'
import type { LineStep } from '../../types/chess'

export interface LineStepViewerProps {
  label: string
  uciList?: string[]
  fenBefore: string
  maxSteps?: number
  onStepPreview?: (step: LineStep) => void
  onExitPreview?: () => void
  onPreviewModeChange?: (active: boolean) => void
}

export default function LineStepViewer({
  label,
  uciList = [],
  fenBefore,
  maxSteps = 8,
  onStepPreview,
  onExitPreview,
  onPreviewModeChange,
}: LineStepViewerProps) {
  const [activeStep, setActiveStep] = useState<number | null>(null)

  const steps: LineStep[] = useMemo(() => {
    if (!uciList || uciList.length === 0 || !fenBefore) return []
    return decodeLine(fenBefore, uciList, maxSteps)
  }, [uciList, fenBefore, maxSteps])

  const handleStepClick = useCallback(
    (idx: number) => {
      if (activeStep === idx) {
        setActiveStep(null)
        onExitPreview?.()
        onPreviewModeChange?.(false)
      } else {
        setActiveStep(idx)
        onStepPreview?.(steps[idx])
        onPreviewModeChange?.(true)
      }
    },
    [activeStep, steps, onStepPreview, onExitPreview, onPreviewModeChange]
  )

  const handlePrev = useCallback(() => {
    if (activeStep === null || activeStep === 0) {
      setActiveStep(null)
      onExitPreview?.()
      onPreviewModeChange?.(false)
    } else {
      const prev = activeStep - 1
      setActiveStep(prev)
      onStepPreview?.(steps[prev])
    }
  }, [activeStep, steps, onStepPreview, onExitPreview, onPreviewModeChange])

  const handleNext = useCallback(() => {
    if (activeStep === null) {
      setActiveStep(0)
      onStepPreview?.(steps[0])
      onPreviewModeChange?.(true)
    } else if (activeStep < steps.length - 1) {
      const next = activeStep + 1
      setActiveStep(next)
      onStepPreview?.(steps[next])
    }
  }, [activeStep, steps, onStepPreview, onPreviewModeChange])

  const handleExit = useCallback(() => {
    setActiveStep(null)
    onExitPreview?.()
    onPreviewModeChange?.(false)
  }, [onExitPreview, onPreviewModeChange])

  if (steps.length === 0) return null

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          {label}
        </div>
        <div className="flex items-center gap-1">
          {activeStep !== null && (
            <button
              type="button"
              onClick={handleExit}
              className="text-[10px] text-gray-500 hover:text-gray-300 mr-1 px-1 py-0.5 rounded transition-colors cursor-pointer"
            >
              ✕ Exit preview
            </button>
          )}
          <button
            type="button"
            onClick={handlePrev}
            disabled={activeStep === null}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs text-gray-300 transition-colors cursor-pointer"
            title="Previous step"
          >
            ‹
          </button>
          <span className="text-[10px] text-gray-400 font-mono px-1">
            {activeStep !== null
              ? `${activeStep + 1}/${steps.length}`
              : `0/${steps.length}`}
          </span>
          <button
            type="button"
            onClick={handleNext}
            disabled={activeStep === steps.length - 1}
            className="w-5 h-5 flex items-center justify-center rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed text-xs text-gray-300 transition-colors cursor-pointer"
            title="Next step"
          >
            ›
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {steps.map((step, idx) => {
          const isSelected = activeStep === idx
          const isPassed = activeStep !== null && idx <= activeStep

          return (
            <button
              key={step.uci + idx}
              type="button"
              onClick={() => handleStepClick(idx)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2 cursor-pointer ${
                isSelected
                  ? 'bg-blue-900/60 border border-blue-500/70 text-white'
                  : isPassed
                  ? 'bg-gray-800/60 text-gray-300 hover:bg-gray-800'
                  : 'bg-transparent text-gray-400 hover:bg-gray-800/40 hover:text-gray-200'
              }`}
            >
              <span
                className={`font-mono text-[10px] w-4 text-right flex-shrink-0 ${
                  isSelected
                    ? 'text-blue-300 font-bold'
                    : 'text-gray-600'
                }`}
              >
                {idx + 1}.
              </span>
              <span
                className={`font-mono font-semibold text-xs flex-shrink-0 ${
                  isSelected
                    ? 'text-blue-200'
                    : step.color === 'white'
                    ? 'text-gray-100'
                    : 'text-gray-300'
                }`}
              >
                {step.san}
              </span>
              <span className="text-[11px] text-gray-400 truncate min-w-0">
                {step.description}
              </span>
              {isSelected && (
                <span className="ml-auto text-[10px] text-blue-400 flex-shrink-0 font-medium">
                  ● on board
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
