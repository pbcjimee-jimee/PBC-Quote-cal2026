import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import { AI_QUOTE_MODEL } from '@/lib/ai-quote/config'
import type { AiUsage } from '@/lib/ai-quote/types'

export type AiErrorCode = 'refusal' | 'max_tokens' | 'invalid_output' | 'rate_limited' | 'timeout' | 'api_error'

export type StructuredResult<T> =
  | { ok: true; data: T; usage: AiUsage; model: string }
  | { ok: false; errorCode: AiErrorCode; usage: AiUsage | null; model: string | null }

export interface StructuredRequest<T> {
  schema: z.ZodType<T>
  system: Anthropic.TextBlockParam[]
  messages: Anthropic.MessageParam[]
  maxTokens: number
  signal?: AbortSignal
}

export function createAnthropicClient(): Anthropic {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 2,
    logLevel: 'off',
  })
}

export async function runStructuredClaudeRequest<T>(
  client: Anthropic,
  request: StructuredRequest<T>,
): Promise<StructuredResult<T>> {
  let usage: AiUsage | null = null
  let model: string | null = null
  const failure = (errorCode: AiErrorCode): StructuredResult<T> => ({ ok: false, errorCode, usage, model })

  if (request.signal?.aborted) return failure('timeout')
  if (request.messages.at(-1)?.role === 'assistant') return failure('invalid_output')

  try {
    const system = request.system.map((block, index) => index === request.system.length - 1
      ? { ...block, cache_control: { type: 'ephemeral' as const } }
      : { ...block })
    const format = zodOutputFormat(request.schema)
    const stream = client.beta.messages.stream({
      model: AI_QUOTE_MODEL,
      max_tokens: request.maxTokens,
      system,
      messages: request.messages,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'high',
        // The SDK's parse helper throws before stop reasons and usage can be inspected.
        format: { type: format.type, schema: format.schema },
      },
    }, { signal: request.signal })
    const message = await stream.finalMessage()
    usage = {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    }
    model = message.model

    if (request.signal?.aborted) return failure('timeout')
    if (message.stop_reason === 'refusal') return failure('refusal')
    if (message.stop_reason === 'max_tokens') return failure('max_tokens')
    if (message.stop_reason !== 'end_turn') return failure('invalid_output')

    const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('')
    let output: unknown
    try {
      output = JSON.parse(text)
    } catch {
      return failure('invalid_output')
    }
    const parsed = request.schema.safeParse(output)
    if (!parsed.success) return failure('invalid_output')
    return { ok: true, data: parsed.data, usage, model }
  } catch (error) {
    if (request.signal?.aborted) return failure('timeout')
    if (error instanceof Anthropic.RateLimitError) return failure('rate_limited')
    if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.APIUserAbortError
      || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
      return failure('timeout')
    }
    return failure('api_error')
  }
}
