export interface SseStreamOptions {
  onEvent?: (eventType: string, data: any) => void
  onDone?: () => void
  onError?: (error: Error) => void
}

export async function readSseStream(
  url: string,
  body: any,
  options: SseStreamOptions = {}
): Promise<() => void> {
  const controller = new AbortController()
  const { onEvent, onDone, onError } = options

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text()
      let detail = `Server returned ${res.status}`
      try {
        const parsed = JSON.parse(errText)
        if (parsed.detail) detail = parsed.detail
      } catch {
        if (errText) detail = errText
      }
      throw new Error(detail)
    }

    if (!res.body) {
      throw new Error('ReadableStream not supported on this response')
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    ;(async () => {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          let currentEvent = 'message'
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim()
            } else if (trimmed.startsWith('data:')) {
              const rawData = trimmed.slice(5).trim()
              if (rawData === '[DONE]') {
                onDone?.()
                return
              }
              try {
                const parsedData = JSON.parse(rawData)
                const eventType =
                  currentEvent !== 'message'
                    ? currentEvent
                    : parsedData?.type || 'message'
                onEvent?.(eventType, parsedData)
              } catch {
                onEvent?.(currentEvent, rawData)
              }
              currentEvent = 'message'
            }
          }
        }
        onDone?.()
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          onError?.(err)
        }
      }
    })()
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      onError?.(err)
    }
  }

  return () => controller.abort()
}
