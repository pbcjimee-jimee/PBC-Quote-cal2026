import Anthropic from '@anthropic-ai/sdk'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  createAnthropicClient,
  runStructuredClaudeRequest,
  type StructuredRequest,
} from '@/lib/ai-quote/anthropic'

const schema = z.object({ answer: z.number().min(1).max(10) })
const usage = { inputTokens: 100, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 }

function request(): StructuredRequest<z.infer<typeof schema>> {
  return {
    schema,
    system: [{ type: 'text', text: 'private instructions' }, { type: 'text', text: 'private catalog' }],
    messages: [{ role: 'user', content: 'private memo' }],
    maxTokens: 32000,
  }
}

function message(overrides: Record<string, unknown> = {}) {
  return {
    model: 'returned-model',
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: '{"answer":3}' }],
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      cache_read_input_tokens: 30,
      cache_creation_input_tokens: 40,
    },
    ...overrides,
  }
}

function fakeClient(response = message()) {
  const finalMessage = vi.fn().mockResolvedValue(response)
  const stream = vi.fn().mockReturnValue({ finalMessage })
  const regularStream = vi.fn()
  const client = {
    beta: { messages: { stream } },
    messages: { stream: regularStream },
  } as unknown as Anthropic
  return { client, stream, finalMessage, regularStream }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('structured Claude requests', () => {
  it('sends the pinned model, high effort, fallback, cache and generated JSON schema', async () => {
    const { client, stream, regularStream, finalMessage } = fakeClient()
    const input = request()
    const original = structuredClone({ system: input.system, messages: input.messages })
    input.system.forEach(Object.freeze)
    Object.freeze(input.system)
    const signal = new AbortController().signal
    input.signal = signal

    await runStructuredClaudeRequest(client, input)

    expect(stream).toHaveBeenCalledExactlyOnceWith({
      model: 'claude-opus-5-5',
      max_tokens: 32000,
      system: [
        { type: 'text', text: 'private instructions' },
        { type: 'text', text: 'private catalog', cache_control: { type: 'ephemeral' } },
      ],
      messages: input.messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'high', format: { type: 'json_schema', schema: expect.any(Object) } },
    }, { signal })
    const format = stream.mock.calls[0][0].output_config.format
    expect(format.schema.properties.answer.type).toBe('number')
    expect(format).not.toHaveProperty('parse')
    expect(input.system).toEqual(original.system)
    expect(input.messages).toEqual(original.messages)
    expect(regularStream).not.toHaveBeenCalled()
    expect(finalMessage).toHaveBeenCalledOnce()
  })

  it('returns parsed data and usage on end_turn, using the actual returned model', async () => {
    const { client } = fakeClient()
    expect(await runStructuredClaudeRequest(client, request())).toEqual({
      ok: true, data: { answer: 3 }, usage, model: 'returned-model',
    })
  })

  it('joins text blocks and ignores non-text blocks and SDK parsed_output', async () => {
    const { client } = fakeClient(message({
      content: [
        { type: 'text', text: '{"answer":' },
        { type: 'thinking', thinking: 'ignored', signature: 'sig' },
        { type: 'text', text: '4}' },
      ],
      parsed_output: { answer: 99 },
    }))
    expect(await runStructuredClaudeRequest(client, request())).toMatchObject({ ok: true, data: { answer: 4 } })
  })

  it('normalizes null cache token counts to zero', async () => {
    const { client } = fakeClient(message({
      usage: { input_tokens: 7, output_tokens: 2, cache_read_input_tokens: null, cache_creation_input_tokens: null },
    }))
    expect(await runStructuredClaudeRequest(client, request())).toMatchObject({
      ok: true, usage: { inputTokens: 7, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
    })
  })

  it.each(['refusal', 'max_tokens'] as const)('maps %s before parsing incomplete output', async stopReason => {
    const { client } = fakeClient(message({ stop_reason: stopReason, content: [{ type: 'text', text: 'incomplete' }] }))
    expect(await runStructuredClaudeRequest(client, request())).toEqual({
      ok: false, errorCode: stopReason, usage, model: 'returned-model',
    })
  })

  it.each(['{"answer":11}', '{"answer":"3"}', '{broken', '', '```json\n{"answer":3}\n```']) (
    'rejects invalid output %s while preserving usage', async text => {
      const { client } = fakeClient(message({ content: [{ type: 'text', text }] }))
      expect(await runStructuredClaudeRequest(client, request())).toEqual({
        ok: false, errorCode: 'invalid_output', usage, model: 'returned-model',
      })
    },
  )

  it('rejects an empty response', async () => {
    const { client } = fakeClient(message({ content: [] }))
    expect(await runStructuredClaudeRequest(client, request())).toMatchObject({ ok: false, errorCode: 'invalid_output' })
  })

  it.each(['pause_turn', 'tool_use', 'stop_sequence', 'compaction', 'model_context_window_exceeded', null])(
    'does not accept a partial turn with stop reason %s', async stopReason => {
      const { client } = fakeClient(message({ stop_reason: stopReason }))
      expect(await runStructuredClaudeRequest(client, request())).toMatchObject({ ok: false, errorCode: 'invalid_output' })
    },
  )

  it.each([
    [new Anthropic.RateLimitError(429, {}, 'limited', new Headers()), 'rate_limited'],
    [new Anthropic.APIConnectionTimeoutError(), 'timeout'],
    [new Anthropic.APIConnectionError({ message: 'connection failed' }), 'timeout'],
    [new Anthropic.APIUserAbortError(), 'timeout'],
    [new DOMException('cancelled', 'AbortError'), 'timeout'],
    [new DOMException('timed out', 'TimeoutError'), 'timeout'],
    [new Anthropic.APIError(500, {}, 'server error', new Headers()), 'api_error'],
    [new Error('unexpected failure'), 'api_error'],
  ])('classifies %s as %s', async (error, errorCode) => {
    const { client, finalMessage } = fakeClient()
    finalMessage.mockRejectedValue(error)
    expect(await runStructuredClaudeRequest(client, request())).toEqual({
      ok: false, errorCode, usage: null, model: null,
    })
  })

  it('classifies synchronous stream errors', async () => {
    const { client, stream } = fakeClient()
    stream.mockImplementation(() => { throw new Anthropic.RateLimitError(429, {}, 'limited', new Headers()) })
    expect(await runStructuredClaudeRequest(client, request())).toEqual({
      ok: false, errorCode: 'rate_limited', usage: null, model: null,
    })
  })

  it('does not start a request when its signal is already aborted', async () => {
    const { client, stream } = fakeClient()
    expect(await runStructuredClaudeRequest(client, { ...request(), signal: AbortSignal.abort() })).toEqual({
      ok: false, errorCode: 'timeout', usage: null, model: null,
    })
    expect(stream).not.toHaveBeenCalled()
  })

  it('never sends an assistant prefill', async () => {
    const { client, stream } = fakeClient()
    const input = request()
    input.messages.push({ role: 'assistant', content: '{' })
    expect(await runStructuredClaudeRequest(client, input)).toMatchObject({ ok: false, errorCode: 'invalid_output' })
    expect(stream).not.toHaveBeenCalled()
  })

  it('never logs prompt content on success or failure', async () => {
    const spies = ['error', 'log', 'warn', 'info', 'debug'].map(method =>
      vi.spyOn(console, method as 'error').mockImplementation(() => {}))
    const { client, finalMessage } = fakeClient()
    await runStructuredClaudeRequest(client, request())
    finalMessage.mockRejectedValue(new Error('private instructions private memo'))
    await runStructuredClaudeRequest(client, request())
    spies.forEach(spy => expect(spy).not.toHaveBeenCalled())
  })
})

describe('Anthropic client factory', () => {
  it('uses the server key, two retries and disables SDK content logging', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key-never-sent')
    vi.stubEnv('ANTHROPIC_LOG', 'debug')
    const client = createAnthropicClient()
    expect(client).toBeInstanceOf(Anthropic)
    expect(client.apiKey).toBe('test-key-never-sent')
    expect(client.maxRetries).toBe(2)
    expect(client.logLevel).toBe('off')
  })
})
