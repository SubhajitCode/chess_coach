import apiClient from './client'
import type {
  OpeningCategory,
  OpeningEntry,
  OpeningScenario,
  OpeningProgress,
  TrainingSession,
  TrainingMoveResponse,
  HintResponse,
  MoveExplanation,
  OpeningsListResponse,
  OpeningListParams,
} from '../types/openings'

export async function fetchOpeningsCatalog(): Promise<{ categories: OpeningCategory[] }> {
  const { data } = await apiClient.get('/api/openings/catalog')
  return data
}

export async function fetchOpeningScenarios(
  eco: string,
  openingName: string,
  family: string = ''
): Promise<{ eco: string; opening_name: string; scenarios: OpeningScenario[] }> {
  const { data } = await apiClient.get('/api/openings/scenarios', {
    params: { eco, name: openingName, family },
  })
  return data
}

export async function fetchOpeningsList(params?: OpeningListParams): Promise<OpeningsListResponse> {
  const { data } = await apiClient.get('/api/openings/list', { params })
  return data
}

export async function searchOpenings(query: string): Promise<{ results: OpeningEntry[] }> {
  const { data } = await apiClient.get('/api/openings/search', { params: { q: query } })
  return data
}

export async function fetchOpeningDetails(eco: string): Promise<{ eco: string; openings: OpeningEntry[] }> {
  const { data } = await apiClient.get(`/api/openings/${eco}`)
  return data
}

export async function fetchOpeningLine(
  eco: string,
  openingName: string
): Promise<{ opening: OpeningEntry; moves: any[]; progress: OpeningProgress | null }> {
  const { data } = await apiClient.get(`/api/openings/line/${eco}/${encodeURIComponent(openingName)}`)
  return data
}

export async function generateExplanations(eco: string, openingName: string): Promise<{ explanations: MoveExplanation[] }> {
  const { data } = await apiClient.post('/api/openings/explain', { eco, opening_name: openingName })
  return data
}

export async function startTraining(
  eco: string,
  openingName: string,
  trainAs: string,
  scenarioId?: string,
  adaptive?: boolean
): Promise<TrainingSession> {
  const { data } = await apiClient.post('/api/openings/train/start', {
    eco,
    opening_name: openingName,
    train_as: trainAs,
    scenario_id: scenarioId,
    adaptive: adaptive ?? false,
  })
  return data
}

export async function switchTrainingScenario(
  sessionId: string,
  scenarioId: string
): Promise<TrainingSession> {
  const { data } = await apiClient.post('/api/openings/train/switch-scenario', {
    session_id: sessionId,
    scenario_id: scenarioId,
  })
  return data
}

export async function submitTrainingMove(
  sessionId: string,
  uci: string
): Promise<TrainingMoveResponse> {
  const { data } = await apiClient.post('/api/openings/train/move', {
    session_id: sessionId,
    uci,
  })
  return data
}

export async function getTrainingHint(sessionId: string): Promise<HintResponse> {
  const { data } = await apiClient.post('/api/openings/train/hint', { session_id: sessionId })
  return data
}

export async function completeTraining(sessionId: string): Promise<any> {
  const { data } = await apiClient.post('/api/openings/train/complete', { session_id: sessionId })
  return data
}

export async function fetchProgress(): Promise<{ progress: OpeningProgress[] }> {
  const { data } = await apiClient.get('/api/openings/progress')
  return data
}

export async function fetchDueReviews(): Promise<{ due: any[] }> {
  const { data } = await apiClient.get('/api/openings/due-reviews')
  return data
}
