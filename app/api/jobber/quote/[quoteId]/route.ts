import { NextRequest, NextResponse } from 'next/server'
import {
  fetchJobberJob,
  fetchJobberQuote,
  fetchJobberQuoteJobs,
  JobberApiError,
  JobberPermissionError,
  searchJobberJob,
  searchJobberQuote,
} from '@/lib/jobber/client'
import { getJobberConfig, getMissingGraphqlConfigKeys } from '@/lib/jobber/config'
import { getUsableDevJobberToken, refreshDevJobberToken } from '@/lib/jobber/dev-tokens'
import { mapJobberJobToDraft, mapJobberQuoteToDraft } from '@/lib/jobber/mapper'
import { getUsableJobberToken, refreshStoredJobberToken, type StoredJobberToken } from '@/lib/jobber/tokens'
import { createClient } from '@/lib/supabase/server'
import { isDevNoAuthMode } from '@/lib/actions/types'

interface RouteContext {
  params: Promise<{
    quoteId: string
  }>
}

class JobberAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobberAuthError'
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  const config = getJobberConfig()
  const missing = getMissingGraphqlConfigKeys(config)
  if (missing.length > 0) {
    return NextResponse.json({
      ok: false,
      error: `Jobber quote fetch is not configured: ${missing.join(', ')}`,
    }, { status: 503 })
  }

  const { quoteId } = await context.params
  try {
    const userId = await getJobberTokenUserId()
    const token = userId
      ? await getUsableJobberToken(userId, config)
      : await getUsableDevJobberToken(config)
    if (!token && !config.accessToken) {
      return NextResponse.json({ ok: false, error: 'Jobber is not connected. Connect Jobber first.' }, { status: 409 })
    }

    const sourceType = request.nextUrl.searchParams.get('type') === 'job' ? 'job' : 'quote'
    const accessToken = token?.accessToken ?? config.accessToken
    const lookup = normalizeJobberLookup(decodeURIComponent(quoteId), sourceType)
    if (sourceType === 'job') {
      const job = await fetchJobWithRetry(lookup, {
        accessToken,
        graphqlVersion: config.graphqlVersion,
      }, async () => {
        if (!token) return null
        const refreshedToken = await refreshToken(userId, token, config)
        return refreshedToken.accessToken
      })
      return NextResponse.json({
        ok: true,
        data: mapJobberJobToDraft(job),
      })
    }

    const quote = await fetchQuoteWithRetry(lookup, {
      accessToken,
      graphqlVersion: config.graphqlVersion,
    }, async () => {
      if (!token) return null
      const refreshedToken = await refreshToken(userId, token, config)
      return refreshedToken.accessToken
    })
    const { jobs, error: jobExpensesError } = await fetchQuoteJobsWithoutBlockingQuote(quote.id, {
      accessToken,
      graphqlVersion: config.graphqlVersion,
    }, async () => {
      if (!token) return null
      const refreshedToken = await refreshToken(userId, token, config)
      return refreshedToken.accessToken
    })
    const draft = mapJobberQuoteToDraft({
      ...quote,
      jobs: { nodes: jobs },
    })

    return NextResponse.json({
      ok: true,
      data: {
        ...draft,
        jobExpensesError,
      },
    })
  } catch (error) {
    if (error instanceof JobberAuthError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 401 })
    }

    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to fetch Jobber quote',
    }, { status: 502 })
  }
}

async function fetchQuoteJobsWithoutBlockingQuote(
  quoteId: string,
  options: FetchOptions,
  refreshAccessToken: () => Promise<string | null>
): Promise<{ jobs: Awaited<ReturnType<typeof fetchJobberQuoteJobs>>; error: string | null }> {
  try {
    const jobs = await fetchJobberQuoteJobs(quoteId, options)
    return { jobs, error: null }
  } catch (error) {
    if (error instanceof JobberApiError && error.status === 401) {
      const refreshedAccessToken = await refreshAccessToken()
      if (refreshedAccessToken) {
        try {
          const jobs = await fetchJobberQuoteJobs(quoteId, {
            ...options,
            accessToken: refreshedAccessToken,
          })
          return { jobs, error: null }
        } catch (retryError) {
          return { jobs: [], error: getJobExpensesErrorMessage(retryError) }
        }
      }
    }

    return { jobs: [], error: getJobExpensesErrorMessage(error) }
  }
}

function getJobExpensesErrorMessage(error: unknown): string {
  if (error instanceof JobberPermissionError) {
    return error.message
  }

  if (!(error instanceof Error)) {
    return 'Job expenses could not be loaded from Jobber.'
  }

  return error.message.startsWith('Jobber returned a GraphQL error')
    ? error.message.replace('Jobber returned a GraphQL error', 'Job expenses could not be loaded')
    : `Job expenses could not be loaded: ${error.message}`
}

async function getJobberTokenUserId(): Promise<string | null> {
  if (isDevNoAuthMode()) return null

  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new JobberAuthError('Login is required to fetch Jobber quotes')
  }

  return user.id
}

interface JobberLookup {
  value: string
  mode: 'id' | 'search'
}

interface FetchOptions {
  accessToken: string
  graphqlVersion: string
}

function normalizeJobberLookup(input: string, sourceType: 'quote' | 'job'): JobberLookup {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed)
    const query = url.searchParams.get('q')?.replace(/^"|"$/g, '').trim()
    if (query) return { value: query, mode: 'search' }

    const pathPattern = sourceType === 'job' ? /\/jobs\/([^/?#]+)/ : /\/quotes\/([^/?#]+)/
    const pathId = url.pathname.match(pathPattern)?.[1]
    if (pathId) return normalizeJobberLookup(pathId, sourceType)
  } catch {}

  if (/^Z2lkOi8v/.test(trimmed)) {
    return { value: trimmed, mode: 'id' }
  }

  return { value: trimmed, mode: 'search' }
}

async function fetchQuote(
  lookup: JobberLookup,
  options: FetchOptions
) {
  if (lookup.mode === 'id') {
    return fetchJobberQuote(lookup.value, options)
  }

  return searchJobberQuote(lookup.value, options)
}

async function fetchQuoteWithRetry(
  lookup: JobberLookup,
  options: FetchOptions,
  refreshAccessToken: () => Promise<string | null>
) {
  try {
    return await fetchQuote(lookup, options)
  } catch (error) {
    if (!(error instanceof JobberApiError) || error.status !== 401) {
      throw error
    }

    const refreshedAccessToken = await refreshAccessToken()
    if (!refreshedAccessToken) throw error

    return fetchQuote(lookup, {
      ...options,
      accessToken: refreshedAccessToken,
    })
  }
}

async function fetchJob(
  lookup: JobberLookup,
  options: FetchOptions
) {
  if (lookup.mode === 'id') {
    return fetchJobberJob(lookup.value, options)
  }

  return searchJobberJob(lookup.value, options)
}

async function fetchJobWithRetry(
  lookup: JobberLookup,
  options: FetchOptions,
  refreshAccessToken: () => Promise<string | null>
) {
  try {
    return await fetchJob(lookup, options)
  } catch (error) {
    if (!(error instanceof JobberApiError) || error.status !== 401) {
      throw error
    }

    const refreshedAccessToken = await refreshAccessToken()
    if (!refreshedAccessToken) throw error

    return fetchJob(lookup, {
      ...options,
      accessToken: refreshedAccessToken,
    })
  }
}

async function refreshToken(
  userId: string | null,
  token: StoredJobberToken,
  config: ReturnType<typeof getJobberConfig>
): Promise<StoredJobberToken> {
  if (userId) {
    return refreshStoredJobberToken(userId, token.refreshToken, config)
  }

  return refreshDevJobberToken(token.refreshToken, config)
}
