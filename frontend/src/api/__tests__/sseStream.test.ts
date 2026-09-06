import { describe, it, expect, vi } from 'vitest'
import { readSseStream } from '../sseStream'

describe('readSseStream', () => {
  it('parses SSE data chunks and handles [DONE] completion', async () => {
    const sseChunks = [
      'data: {"type":"meta","total_moves":2}\n\n',
      'data: {"type":"move","move_san":"e4","color":"white"}\n\n',
      'data: [DONE]\n\n',
    ]

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(new TextEncoder().encode(chunk))
        }
        controller.close()
      },
    })

    const mockFetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const events: { type: string; data: any }[] = []
    let doneCalled = false

    await readSseStream(
      '/api/analyze/stream',
      { pgn: '1. e4' },
      {
        onEvent: (type, data) => {
          events.push({ type, data })
        },
        onDone: () => {
          doneCalled = true
        },
      }
    )

    // Wait for the async reader in readSseStream to consume the stream
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(doneCalled).toBe(true)
    expect(events.length).toBe(2)
    expect(events[0].type).toBe('meta')
    expect(events[0].data.total_moves).toBe(2)
    expect(events[1].type).toBe('move')
    expect(events[1].data.move_san).toBe('e4')

    vi.unstubAllGlobals()
  })
})
