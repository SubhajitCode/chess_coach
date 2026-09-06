import apiClient from './client'
import { readSseStream } from './sseStream'
import type {
  AnalyzeGameStreamOptions,
  AnalyzePositionResponse,
  CachedAnalysisResponse,
  FetchEnginesResponse,
  PerMoveCoachingResponse,
} from '../types/api'
import type {
  AiMoveResponse,
  GameItem,
  PlayerColor,
} from '../types/chess'
import type {
  AskCoachPayload,
  AskCoachResponse,
  CoachProfile,
  DeviationPayload,
  FullAnalysisPayload,
  GameOverviewResponse,
  PlatformId,
} from '../types/coaching'

export async function fetchChessComGames(
  username: string,
  year: number,
  month: number
): Promise<{ games: GameItem[] }> {
  const { data } = await apiClient.get('/api/games', {
    params: { source: 'chesscom', username, year, month },
  })
  return data
}

export async function fetchLichessGames(
  username: string,
  maxGames = 20
): Promise<{ games: GameItem[] }> {
  const { data } = await apiClient.get('/api/games', {
    params: { source: 'lichess', username, max_games: maxGames },
  })
  return data
}

export async function checkCacheBatch(
  pgnHashes: string[]
): Promise<Record<string, boolean>> {
  const { data } = await apiClient.post('/api/analysis/cache/batch', {
    pgn_hashes: pgnHashes,
  })
  return data
}

export async function getCachedAnalysis(
  pgnHash: string
): Promise<CachedAnalysisResponse | null> {
  try {
    const { data } = await apiClient.get(`/api/analysis/cache/${pgnHash}`)
    return data
  } catch {
    return null
  }
}

export function analyzeGameStream(options: AnalyzeGameStreamOptions): {
  abort: () => void
} {
  const {
    pgn,
    depth = 18,
    playerColor = 'white',
    engine = 'stockfish',
    onMeta,
    onMove,
    onSummary,
    onDone,
    onError,
  } = options

  let abortFn: (() => void) | null = null

  readSseStream(
    '/api/analyze/stream',
    {
      pgn,
      depth,
      player_color: playerColor,
      engine,
    },
    {
      onEvent: (event, data) => {
        if (event === 'meta') onMeta?.(data)
        else if (event === 'move') onMove?.(data)
        else if (event === 'summary') onSummary?.(data)
        else if (event === 'error') onError?.(data?.error || 'Analysis failed')
      },
      onDone,
      onError: (err) => onError?.(err.message),
    }
  ).then((cancel) => {
    abortFn = cancel
  })

  return {
    abort: () => abortFn?.(),
  }
}

export async function getPerMoveCoaching(
  pgnHash: string,
  analysis: FullAnalysisPayload,
  playerColor: PlayerColor = 'white',
  username?: string | null
): Promise<{ data: PerMoveCoachingResponse }> {
  return apiClient.post('/api/coaching/per-move', {
    pgn_hash: pgnHash,
    analysis,
    player_color: playerColor,
    username,
  })
}

export async function getCachedPerMoveCoaching(
  pgnHash: string
): Promise<PerMoveCoachingResponse | null> {
  try {
    const { data } = await apiClient.get(`/api/coaching/per-move/${pgnHash}`)
    return data
  } catch {
    return null
  }
}

export async function getGameOverview(
  pgnHash: string,
  analysis: FullAnalysisPayload,
  playerColor: PlayerColor = 'white',
  username?: string | null
): Promise<{ data: GameOverviewResponse }> {
  return apiClient.post('/api/coaching/overview', {
    pgn_hash: pgnHash,
    analysis,
    player_color: playerColor,
    username,
  })
}

export async function analyzePosition(
  fen: string,
  moveUci: string,
  depth = 18,
  pvLength = 5
): Promise<AnalyzePositionResponse> {
  return apiClient.post('/api/analyze/position', {
    fen,
    move_uci: moveUci,
    depth,
    pv_length: pvLength,
  })
}

export async function getDeviationCoaching(
  payload: DeviationPayload
): Promise<{ data: { coaching: string } }> {
  return apiClient.post('/api/coaching/deviation', payload)
}

export async function askCoach(
  payload: AskCoachPayload
): Promise<AskCoachResponse> {
  const { data } = await apiClient.post('/api/coach/ask', payload)
  return data
}

export async function getAiMove(payload: {
  fen: string
  engine?: string
  temperature?: number
  topK?: number
}): Promise<AiMoveResponse> {
  const { data } = await apiClient.post('/api/play/move', {
    fen: payload.fen,
    engine: payload.engine || 'human_model',
    temperature: payload.temperature ?? 0.25,
    top_k: payload.topK ?? 4,
  })
  return data
}

export async function fetchProfile(
  username: string,
  platform: PlatformId = 'chesscom'
): Promise<CoachProfile> {
  const { data } = await apiClient.get('/api/profile', {
    params: { username, platform },
  })
  return data?.profile ?? data
}

export async function saveProfile(
  profile: Partial<CoachProfile>
): Promise<CoachProfile> {
  const { data } = await apiClient.put('/api/profile', profile)
  return data?.profile ?? data
}

export async function fetchEngines(): Promise<FetchEnginesResponse> {
  const { data } = await apiClient.get('/api/engines')
  return data
}
