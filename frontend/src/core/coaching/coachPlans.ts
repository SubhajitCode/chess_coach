import type { CoachPlan, CoachProfile, PlatformId } from '../../types/coaching'

export const PLATFORMS: { id: PlatformId; label: string; icon: string }[] = [
  { id: 'chesscom', label: 'Chess.com', icon: '♟' },
  { id: 'lichess', label: 'Lichess', icon: '♞' },
]

export const TIME_CONTROL_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Select your main time control' },
  { id: 'bullet', label: 'Bullet (1–2 min)' },
  { id: 'blitz', label: 'Blitz (3–5 min)' },
  { id: 'rapid', label: 'Rapid (10–15 min)' },
  { id: 'classical', label: 'Classical / Daily' },
]

export const GOAL_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Select your primary goal' },
  { id: 'stop-blundering', label: 'Stop blundering hanging pieces' },
  { id: 'punish-mistakes', label: 'Punish opponent mistakes faster' },
  { id: 'opening-repertoire', label: 'Build a reliable opening setup' },
  { id: 'endgame-conversion', label: 'Convert winning endgames cleanly' },
  { id: 'time-management', label: 'Stop losing games in time trouble' },
]

export const FOCUS_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Select current study focus' },
  { id: 'tactics', label: 'Tactics & Calculation' },
  { id: 'openings', label: 'Opening Principles & Repertoire' },
  { id: 'strategy', label: 'Pawn Structure & Strategy' },
  { id: 'endgames', label: 'Basic & Practical Endgames' },
  { id: 'defense', label: 'Defending Difficult Positions' },
]

export const SORT_OPTIONS: { id: string; label: string }[] = [
  { id: 'date_desc', label: 'Newest first' },
  { id: 'date_asc', label: 'Oldest first' },
  { id: 'result', label: 'Result (Wins first)' },
  { id: 'opponent', label: 'Opponent name' },
]

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export function prettifyProfileValue(val?: string | null): string {
  if (!val) return ''
  return val
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function getCoachPlan(profile?: Partial<CoachProfile> | null): CoachPlan {
  const goal = profile?.improvement_goal || ''
  const focus = profile?.focus_area || ''

  if (goal === 'stop-blundering' || focus === 'tactics') {
    return {
      id: 'stop-blundering',
      title: 'Blunder Reduction Routine',
      theme: 'Blunder Reduction Routine',
      bandLabel: 'Tactics & Calculation',
      summary:
        'Focus on candidate moves, king safety, and loose pieces before committing.',
      description:
        'Focus on candidate moves, king safety, and loose pieces before committing.',
      checklist: [
        'Check all checks, captures, and threats before moving.',
        'Review blunder moments in Practice right after importing.',
        'Target fewer than 2 blunders per game.',
      ],
      drills: [
        'Solve 5 blunder-prevention puzzles before starting games.',
        'Always scan undefended pieces for both players.',
        'Review all blunders and mistakes in Practice mode.',
      ],
    }
  }

  if (goal === 'opening-repertoire' || focus === 'openings') {
    return {
      id: 'opening-discipline',
      title: 'Opening Discipline Routine',
      theme: 'Opening Discipline Routine',
      bandLabel: 'Opening Principles',
      summary:
        'Develop pieces quickly, fight for the center, and reach playable middlegames.',
      description:
        'Develop pieces quickly, fight for the center, and reach playable middlegames.',
      checklist: [
        'Study where games leave known theory.',
        'Track opening win rates across your recent games.',
        'Avoid creating early tactical weaknesses.',
      ],
      drills: [
        'Review first 10 moves of your recent games against master database.',
        'Identify where you deviate from main ideas and note the purpose.',
        'Spar against the AI from typical tabiya positions.',
      ],
    }
  }

  if (goal === 'endgame-conversion' || focus === 'endgames') {
    return {
      id: 'endgame-conversion',
      title: 'Conversion & Technique Routine',
      theme: 'Conversion & Technique Routine',
      bandLabel: 'Endgame Technique',
      summary:
        'Turn material or positional advantages into clean, risk-free wins.',
      description:
        'Turn material or positional advantages into clean, risk-free wins.',
      checklist: [
        'Simplify when ahead in material.',
        'Activate king and rooks in endgames.',
        'Review turning points where advantages slipped away.',
      ],
      drills: [
        'Practice converting +3 advantages without blundering counterplay.',
        'Focus on active king placement in simplified positions.',
        'Analyze any drawn games from winning positions.',
      ],
    }
  }

  return {
    id: 'foundation',
    title: 'Solid Improvement Loop',
    theme: 'Solid Improvement Loop',
    bandLabel: 'All Levels',
    summary:
      'Import your recent games, diagnose key turning points, and practice missed ideas.',
    description:
      'Import your recent games, diagnose key turning points, and practice missed ideas.',
    checklist: [
      'Import your recent games each study session.',
      'Check the coach turning point summary on key games.',
      'Finish every analysis by solving the critical positions in Practice.',
    ],
    drills: [
      'Import your latest games after every play session.',
      'Audit estimated Elo and accuracy trends over time.',
      'Play 1 sparring match to test candidate lines under pressure.',
    ],
  }
}
