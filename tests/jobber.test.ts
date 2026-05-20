import { describe, expect, it, vi } from 'vitest'
import {
  assertJobberReadOnlyScopes,
  buildJobberAuthorizationUrl,
  getJobberConfig,
  getMissingGraphqlConfigKeys,
  getMissingOAuthConfigKeys,
} from '@/lib/jobber/config'
import { exchangeAuthorizationCode, getTokenExpiresAt, refreshAccessToken } from '@/lib/jobber/oauth'
import {
  assertJobberReadOnlyGraphqlDocument,
  fetchJobberQuote,
  fetchJobberQuoteJobs,
  fetchJobberJob,
  JobberApiError,
  JobberPermissionError,
  searchJobberJob,
  searchJobberQuote,
} from '@/lib/jobber/client'
import { mapJobberJobToDraft, mapJobberQuoteToDraft } from '@/lib/jobber/mapper'
import { getVisibleJobberQuoteLookupAfterFetch } from '@/lib/jobber/quote-lookup'

describe('jobber config', () => {
  it('reports missing OAuth env keys when credentials are not configured', () => {
    const config = getJobberConfig({})

    expect(getMissingOAuthConfigKeys(config)).toEqual([
      'JOBBER_CLIENT_ID',
      'JOBBER_CLIENT_SECRET',
      'JOBBER_REDIRECT_URI',
    ])
  })

  it('builds the Jobber authorization URL with encoded redirect and state', () => {
    const url = buildJobberAuthorizationUrl({
      clientId: 'client-123',
      clientSecret: 'secret-456',
      redirectUri: 'http://127.0.0.1:3000/api/jobber/callback',
      graphqlVersion: '2025-01-20',
      accessToken: '',
    }, 'state-abc')

    expect(url.origin + url.pathname).toBe('https://api.getjobber.com/api/oauth/authorize')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('client-123')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3000/api/jobber/callback')
    expect(url.searchParams.get('state')).toBe('state-abc')
  })

  it('accepts JOBBER_CALLBACK_URL as the redirect URI env fallback', () => {
    const config = getJobberConfig({
      JOBBER_CLIENT_ID: 'client-123',
      JOBBER_CLIENT_SECRET: 'secret-456',
      JOBBER_CALLBACK_URL: 'https://example.com/api/jobber/callback',
    })

    expect(config.redirectUri).toBe('https://example.com/api/jobber/callback')
    expect(getMissingOAuthConfigKeys(config)).toEqual([])
  })

  it('does not require a static Jobber access token for GraphQL fetch config', () => {
    const config = getJobberConfig({
      JOBBER_GRAPHQL_VERSION: '2025-04-16',
    })

    expect(getMissingGraphqlConfigKeys(config)).toEqual([])
  })

  it('ignores static Jobber access tokens in production', () => {
    const config = getJobberConfig({
      NODE_ENV: 'production',
      JOBBER_GRAPHQL_VERSION: '2025-04-16',
      JOBBER_ACCESS_TOKEN: 'static-production-token',
    })

    expect(config.accessToken).toBe('')
  })

  it('uses the default Jobber GraphQL version when the env key is not configured', () => {
    const config = getJobberConfig({})

    expect(config.graphqlVersion).toBe('2025-04-16')
    expect(getMissingGraphqlConfigKeys(config)).toEqual([])
  })

  it('accepts read scopes and narrow quote write scopes when scope data is present', () => {
    expect(() => assertJobberReadOnlyScopes('clients:read quotes:read jobs:read expenses:read')).not.toThrow()
    expect(() => assertJobberReadOnlyScopes('clients:read,quotes:read')).not.toThrow()
    expect(() => assertJobberReadOnlyScopes('clients.read products_read jobs-read read')).not.toThrow()
    expect(() => assertJobberReadOnlyScopes('clients:read quotes:write')).not.toThrow()
    expect(() => assertJobberReadOnlyScopes('clients:read quotes.update')).not.toThrow()
    expect(() => assertJobberReadOnlyScopes(null)).not.toThrow()
    expect(() => assertJobberReadOnlyScopes('quotes:read jobs:write')).toThrow('Jobber OAuth scopes must be read-only')
    expect(() => assertJobberReadOnlyScopes('quotes:delete')).toThrow('Jobber OAuth scopes must be read-only')
    expect(() => assertJobberReadOnlyScopes('clients:read quoteCreate')).toThrow('Jobber OAuth scopes must be read-only')
    expect(() => assertJobberReadOnlyScopes('clients:read jobs:manage')).toThrow('Jobber OAuth scopes must be read-only')
    expect(() => assertJobberReadOnlyScopes('clients:read jobs:write:read')).toThrow('Jobber OAuth scopes must be read-only')
    expect(() => assertJobberReadOnlyScopes('clients quotes:read')).toThrow('Jobber OAuth scopes must be read-only')
    expect(() => assertJobberReadOnlyScopes('spreadsheet quotes:read')).toThrow('Jobber OAuth scopes must be read-only')
  })
})

describe('jobber oauth', () => {
  it('exchanges an authorization code for tokens without exposing credentials in the URL', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'clients:read',
    }), { status: 200 }))

    const token = await exchangeAuthorizationCode('auth-code', {
      clientId: 'client-123',
      clientSecret: 'secret-456',
      redirectUri: 'https://example.com/api/jobber/callback',
      graphqlVersion: '2025-01-20',
      accessToken: '',
    }, fetcher)

    expect(token).toEqual({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
      scope: 'clients:read',
    })
    expect(fetcher).toHaveBeenCalledWith('https://api.getjobber.com/api/oauth/token', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }))
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    const request = calls[0][1]
    expect(request.body).toBeInstanceOf(URLSearchParams)
    expect((request.body as URLSearchParams).get('client_secret')).toBe('secret-456')
  })

  it('refreshes access tokens with the stored refresh token', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 7200,
      token_type: 'Bearer',
      scope: 'quotes:read',
    }), { status: 200 }))

    const token = await refreshAccessToken('old-refresh-token', {
      clientId: 'client-123',
      clientSecret: 'secret-456',
      redirectUri: 'https://example.com/api/jobber/callback',
      graphqlVersion: '2025-04-16',
      accessToken: '',
    }, fetcher)

    expect(token.accessToken).toBe('new-access-token')
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    const request = calls[0][1]
    expect(request.body).toBeInstanceOf(URLSearchParams)
    expect((request.body as URLSearchParams).get('grant_type')).toBe('refresh_token')
    expect((request.body as URLSearchParams).get('refresh_token')).toBe('old-refresh-token')
  })

  it('rejects refreshed Jobber tokens that gain write scopes', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 7200,
      token_type: 'Bearer',
      scope: 'quotes:read jobs:write',
    }), { status: 200 }))

    await expect(refreshAccessToken('old-refresh-token', {
      clientId: 'client-123',
      clientSecret: 'secret-456',
      redirectUri: 'https://example.com/api/jobber/callback',
      graphqlVersion: '2025-04-16',
      accessToken: '',
    }, fetcher)).rejects.toThrow('Jobber OAuth scopes must be read-only')
  })

  it('computes token expiration timestamps from expires_in', () => {
    expect(getTokenExpiresAt({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: 60,
      tokenType: 'Bearer',
      scope: 'quotes:read',
    }, new Date('2026-05-13T00:00:00.000Z'))).toBe('2026-05-13T00:01:00.000Z')
  })
})

describe('jobber client', () => {
  it('rejects GraphQL mutation documents before sending requests', () => {
    expect(() => assertJobberReadOnlyGraphqlDocument(`
      mutation PbcWrite($id: EncodedId!) {
        quoteDelete(input: { quoteId: $id }) {
          quote {
            id
          }
        }
      }
    `)).toThrow('Jobber integration is read-only')
  })

  it('posts GraphQL requests with bearer auth and Jobber version headers', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        quote: {
          id: 'encoded-quote-id',
          quoteNumber: 'Q-1001',
          title: 'Interior repaint',
          createdAt: '2026-05-13T01:23:45Z',
          message: null,
          jobberWebUri: 'https://secure.getjobber.com/quotes/1001',
          client: { id: 'client-1', name: 'Jane Customer', companyName: null, firstName: 'Jane', lastName: 'Customer' },
          property: null,
          lineItems: {
            nodes: [
              {
                id: 'line-item-1',
                name: 'Interior walls',
                category: 'SERVICE',
                description: 'Two coats',
                quantity: 1,
                unitPrice: 1200,
                totalPrice: 1200,
                linkedProductOrService: {
                  id: 'service-1',
                  name: 'Interior walls',
                  category: 'SERVICE',
                  description: 'Standard wall repaint',
                },
              },
            ],
          },
        },
      },
    }), { status: 200 }))

    const quote = await fetchJobberQuote('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-01-20',
      fetcher,
    })

    expect(quote.quoteNumber).toBe('Q-1001')
    expect(fetcher).toHaveBeenCalledWith('https://api.getjobber.com/api/graphql', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer access-token',
        'Content-Type': 'application/json',
        'X-JOBBER-GRAPHQL-VERSION': '2025-01-20',
      },
      body: expect.stringContaining('"id":"encoded-quote-id"'),
    })
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('query PbcQuoteLite'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('lineItems(first: 100)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('customFields'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('tags(first: 20)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('jobs(first: 5)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('expenses(first: 25)'))
  })

  it('exposes Jobber HTTP status codes for retry handling', async () => {
    const fetcher = vi.fn(async () => new Response('{}', { status: 401 }))

    await expect(fetchJobberQuote('encoded-quote-id', {
      accessToken: 'expired-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })).rejects.toMatchObject({
      name: 'JobberApiError',
      status: 401,
    } satisfies Partial<JobberApiError>)
  })

  it('searches quotes by quote number with a lightweight lookup before fetching exact quote detail', async () => {
    const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
      const body = typeof init.body === 'string' ? init.body : ''
      if (body.includes('PbcQuoteSearchLookup')) {
        return new Response(JSON.stringify({
          data: {
            quotes: {
              nodes: [
                { id: 'quote-id-1', quoteNumber: '12345', title: 'Wrong quote' },
                { id: 'quote-id-2', quoteNumber: '2345', title: 'Carolyn project' },
              ],
            },
          },
        }), { status: 200 })
      }

      return new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id-2',
            quoteNumber: '2345',
            title: 'Carolyn project',
            createdAt: '2026-05-13T01:23:45Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/2345',
            client: null,
            property: null,
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 })
    })

    const quote = await searchJobberQuote('2345', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(quote.id).toBe('quote-id-2')
    expect(quote.title).toBe('Carolyn project')
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('"term":"2345"'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('query PbcQuoteSearchLookup'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('quotes(searchTerm: $term, first: 10)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('lineItems(first: 100)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('customFields'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('tags(first: 20)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('jobs(first: 5)'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('query PbcQuoteLite'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('"id":"quote-id-2"'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('lineItems(first: 100)'))
  })

  it('searches jobs by number with a lightweight query before fetching one job detail', async () => {
    const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
      const body = typeof init.body === 'string' ? init.body : ''
      if (body.includes('PbcJobSearch')) {
        return new Response(JSON.stringify({
          data: {
            jobs: {
              nodes: [
                { id: 'job-id-1', jobNumber: 12345, title: 'Wrong job' },
                { id: 'job-id-2', jobNumber: 2345, title: 'Carolyn job' },
              ],
            },
          },
        }), { status: 200 })
      }

      return new Response(JSON.stringify({
        data: {
          job: {
            id: 'job-id-2',
            jobNumber: 2345,
            title: 'Carolyn job',
            createdAt: '2026-05-14T01:23:45Z',
            instructions: null,
            customFields: [],
            jobStatus: 'ACTIVE',
            jobType: 'ONE_OFF',
            total: 1200,
            jobberWebUri: 'https://secure.getjobber.com/jobs/2345',
            client: null,
            property: null,
            quote: null,
            lineItems: { nodes: [] },
            visits: { nodes: [] },
            expenses: { nodes: [] },
          },
        },
      }), { status: 200 })
    })

    const job = await searchJobberJob('2345', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(job.id).toBe('job-id-2')
    expect(job.title).toBe('Carolyn job')
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('"term":"2345"'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('jobs(searchTerm: $term, first: 10)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('lineItems(first: 25)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('visits(first: 25)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('expenses(first: 25)'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('job(id: $id)'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('"id":"job-id-2"'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('lineItems(first: 100)'))
  })

  it('retries a temporarily throttled GraphQL response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: [
          {
            message: 'Throttled',
            extensions: { code: 'THROTTLED' },
          },
        ],
        extensions: {
          cost: {
            requestedQueryCost: 120,
            actualQueryCost: 0,
            throttleStatus: {
              maximumAvailable: 10000,
              currentlyAvailable: 119,
              restoreRate: 500,
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'encoded-quote-id',
            quoteNumber: 'Q-1001',
            title: 'Interior repaint',
            createdAt: '2026-05-13T01:23:45Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/1001',
            client: null,
            property: null,
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 }))

    const quote = await fetchJobberQuote('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
      throttleRetryDelayMs: 0,
    })

    expect(quote.quoteNumber).toBe('Q-1001')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('falls back to a lightweight quote fetch when the full quote query is too expensive to retry', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: [
          {
            message: 'Throttled',
            extensions: { code: 'THROTTLED' },
          },
        ],
        extensions: {
          cost: {
            requestedQueryCost: 12000,
            actualQueryCost: 0,
            throttleStatus: {
              maximumAvailable: 10000,
              currentlyAvailable: 10000,
              restoreRate: 500,
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'encoded-quote-id',
            quoteNumber: 'Q-1001',
            title: 'Interior repaint',
            createdAt: '2026-05-13T01:23:45Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/1001',
            client: { id: 'client-1', name: 'Jane Customer', companyName: null, firstName: 'Jane', lastName: 'Customer' },
            property: null,
            lineItems: {
              nodes: [
                {
                  id: 'line-item-1',
                  name: 'Interior walls',
                  category: 'SERVICE',
                  description: 'Two coats',
                  quantity: 1,
                  unitPrice: 1200,
                  totalPrice: 1200,
                  textOnly: false,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        },
      }), { status: 200 }))

    const quote = await fetchJobberQuote('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
      throttleRetryDelayMs: 0,
      preferFullQuoteQuery: true,
    })

    expect(quote.quoteNumber).toBe('Q-1001')
    expect(quote.lineItems.nodes).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('query PbcQuote'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('customFields'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('tags(first: 20)'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('query PbcQuoteLite'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('lineItems(first: 100)'))
    expect(calls[1][1].body).not.toEqual(expect.stringContaining('customFields'))
    expect(calls[1][1].body).not.toEqual(expect.stringContaining('tags(first: 20)'))
  })

  it('falls back to a lightweight quote fetch after exhausting temporary full quote throttles', async () => {
    const throttledPayload = {
      errors: [
        {
          message: 'Throttled',
          extensions: { code: 'THROTTLED' },
        },
      ],
      extensions: {
        cost: {
          requestedQueryCost: 120,
          actualQueryCost: 0,
          throttleStatus: {
            maximumAvailable: 10000,
            currentlyAvailable: 1,
            restoreRate: 1,
          },
        },
      },
    }
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(throttledPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(throttledPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(throttledPayload), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'encoded-quote-id',
            quoteNumber: 'Q-1001',
            title: 'Interior repaint',
            createdAt: '2026-05-13T01:23:45Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/1001',
            client: null,
            property: null,
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 }))

    const quote = await fetchJobberQuote('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
      throttleRetryDelayMs: 0,
      maxThrottleRetries: 2,
      preferFullQuoteQuery: true,
    })

    expect(quote.quoteNumber).toBe('Q-1001')
    expect(fetcher).toHaveBeenCalledTimes(4)
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('query PbcQuote'))
    expect(calls[2][1].body).toEqual(expect.stringContaining('query PbcQuote'))
    expect(calls[3][1].body).toEqual(expect.stringContaining('query PbcQuoteLite'))
    expect(calls[3][1].body).not.toEqual(expect.stringContaining('customFields'))
  })

  it('continues retrying repeated temporary GraphQL throttles before returning quote detail', async () => {
    const throttledResponse = new Response(JSON.stringify({
      errors: [
        {
          message: 'Throttled',
          extensions: { code: 'THROTTLED' },
        },
      ],
      extensions: {
        cost: {
          requestedQueryCost: 120,
          actualQueryCost: 0,
          throttleStatus: {
            maximumAvailable: 10000,
            currentlyAvailable: 119,
            restoreRate: 500,
          },
        },
      },
    }), { status: 200 })
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(throttledResponse.clone())
      .mockResolvedValueOnce(throttledResponse.clone())
      .mockResolvedValueOnce(throttledResponse.clone())
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'encoded-quote-id',
            quoteNumber: 'Q-1001',
            title: 'Interior repaint',
            createdAt: '2026-05-13T01:23:45Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/1001',
            client: null,
            property: null,
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 }))

    const quote = await fetchJobberQuote('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
      throttleRetryDelayMs: 0,
    })

    expect(quote.quoteNumber).toBe('Q-1001')
    expect(fetcher).toHaveBeenCalledTimes(4)
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('query PbcQuoteLite'))
    expect(calls[3][1].body).toEqual(expect.stringContaining('query PbcQuoteLite'))
    expect(calls[3][1].body).not.toEqual(expect.stringContaining('customFields'))
  })

  it('uses quote lookup before falling back from a full exact quote fetch to a lightweight quote fetch', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quotes: {
            nodes: [
              { id: 'quote-id-2', quoteNumber: '2345', title: 'Carolyn project' },
            ],
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        errors: [
          {
            message: 'Throttled',
            extensions: { code: 'THROTTLED' },
          },
        ],
        extensions: {
          cost: {
            requestedQueryCost: 12500,
            actualQueryCost: 0,
            throttleStatus: {
              maximumAvailable: 10000,
              currentlyAvailable: 10000,
              restoreRate: 500,
            },
          },
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          quote: {
            id: 'quote-id-2',
            quoteNumber: '2345',
            title: 'Carolyn project',
            createdAt: '2026-05-13T01:23:45Z',
            message: null,
            jobberWebUri: 'https://secure.getjobber.com/quotes/2345',
            client: null,
            property: null,
            lineItems: { nodes: [] },
          },
        },
      }), { status: 200 }))

    const quote = await searchJobberQuote('2345', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
      throttleRetryDelayMs: 0,
      preferFullQuoteQuery: true,
    })

    expect(quote.id).toBe('quote-id-2')
    expect(quote.title).toBe('Carolyn project')
    expect(fetcher).toHaveBeenCalledTimes(3)
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('query PbcQuoteSearchLookup'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('lineItems(first: 100)'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('query PbcQuote'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('customFields'))
    expect(calls[2][1].body).toEqual(expect.stringContaining('query PbcQuoteLite'))
    expect(calls[2][1].body).toEqual(expect.stringContaining('lineItems(first: 100)'))
    expect(calls[2][1].body).not.toEqual(expect.stringContaining('customFields'))
    expect(calls[2][1].body).not.toEqual(expect.stringContaining('tags(first: 20)'))
  })

  it('fetches a Jobber job by encoded id with line items and expenses', async () => {
    const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
      const body = String(init.body)
      if (body.includes('query PbcJobVisits')) {
        return new Response(JSON.stringify({
          data: {
            job: {
              visits: { nodes: [] },
            },
          },
        }), { status: 200 })
      }

      return new Response(JSON.stringify({
        data: {
          job: {
            id: 'job-id-1',
            jobNumber: 6789,
            title: 'Exterior repaint job',
            createdAt: '2026-05-14T01:23:45Z',
            instructions: 'Paint exterior walls',
            customFields: [],
            jobStatus: 'ACTIVE',
            jobType: 'ONE_OFF',
            total: 1200,
            jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
            client: null,
            property: null,
            quote: null,
            lineItems: {
              nodes: [
                {
                  id: 'job-line-item-1',
                  name: 'Exterior walls',
                  category: 'SERVICE',
                  description: 'Two coats',
                  quantity: 1,
                  unitPrice: 1200,
                  totalPrice: 1200,
                  linkedProductOrService: null,
                },
              ],
            },
            expenses: {
              nodes: [
                {
                  id: 'expense-id-1',
                  title: 'Paint supplies',
                  description: '',
                  date: '2026-05-14T00:00:00Z',
                  total: 245.5,
                  enteredBy: null,
                  paidBy: null,
                  reimbursableTo: null,
                },
              ],
            },
          },
        },
      }), { status: 200 })
    })

    const job = await fetchJobberJob('encoded-job-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(job.jobNumber).toBe(6789)
    expect(job.lineItems.nodes[0].name).toBe('Exterior walls')
    expect(job.expenses.nodes[0].title).toBe('Paint supplies')
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('job(id: $id)'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('lineItems(first: 100)'))
    expect(calls[0][1].body).not.toEqual(expect.stringContaining('visits(first: 25)'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('query PbcJobVisits'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('visits(first: 10)'))
    expect(calls[1][1].body).toEqual(expect.stringContaining('lineItems(first: 25)'))
  })

  it('keeps job number fetch usable when custom visit line items are throttled', async () => {
    const fetcher = vi.fn(async (_input: string, init: RequestInit) => {
      const body = String(init.body)
      if (body.includes('query PbcJobVisits')) {
        return new Response(JSON.stringify({
          errors: [
            {
              message: 'Throttled',
              extensions: { code: 'THROTTLED' },
            },
          ],
          extensions: {
            cost: {
              requestedQueryCost: 12000,
              actualQueryCost: 0,
              throttleStatus: {
                maximumAvailable: 10000,
                currentlyAvailable: 4000,
                restoreRate: 500,
              },
            },
          },
        }), { status: 200 })
      }

      return new Response(JSON.stringify({
        data: {
          job: {
            id: 'job-id-1',
            jobNumber: 6789,
            title: 'Exterior repaint job',
            createdAt: '2026-05-14T01:23:45Z',
            instructions: 'Paint exterior walls',
            customFields: [],
            jobStatus: 'ACTIVE',
            jobType: 'ONE_OFF',
            total: 1500,
            jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
            client: null,
            property: null,
            quote: null,
            lineItems: {
              nodes: [
                {
                  id: 'job-line-item-100',
                  name: 'Added Product / Service',
                  category: 'SERVICE',
                  description: 'Added after conversion',
                  quantity: 1,
                  unitPrice: 300,
                  totalPrice: 300,
                  linkedProductOrService: null,
                },
              ],
            },
            expenses: { nodes: [] },
          },
        },
      }), { status: 200 })
    })

    const job = await fetchJobberJob('encoded-job-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(job.lineItems.nodes[0].name).toBe('Added Product / Service')
    expect(job.visits?.nodes).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('requests the full Jobber job product and service list so added items can render', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        job: {
          id: 'job-id-1',
          jobNumber: 6789,
          title: 'Exterior repaint job',
          createdAt: '2026-05-14T01:23:45Z',
          instructions: 'Paint exterior walls',
          customFields: [],
          jobStatus: 'ACTIVE',
          jobType: 'ONE_OFF',
          total: 1500,
          jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
          client: null,
          property: null,
          quote: null,
          lineItems: {
            nodes: [
              {
                id: 'job-line-item-100',
                name: 'Added extra trim touch-up',
                category: 'SERVICE',
                description: 'Added after the job was created',
                quantity: 1,
                unitPrice: 300,
                totalPrice: 300,
                linkedProductOrService: null,
              },
            ],
          },
          visits: { nodes: [] },
          expenses: { nodes: [] },
        },
      },
    }), { status: 200 }))

    const job = await fetchJobberJob('encoded-job-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(job.lineItems.nodes).toHaveLength(1)
    expect(job.lineItems.nodes[0].name).toBe('Added extra trim touch-up')
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('lineItems(first: 100)'))
  })

  it('fetches converted jobs and expenses in a separate GraphQL request', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        quote: {
          jobs: {
            nodes: [
              {
                id: 'job-id-1',
                jobNumber: 6789,
                title: 'Exterior repaint job',
                jobStatus: 'ACTIVE',
                jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
                expenses: {
                  nodes: [
                    {
                      id: 'expense-id-1',
                      title: 'Paint supplies',
                      description: 'Primer and rollers',
                      date: '2026-05-14T00:00:00Z',
                      total: 245.5,
                      enteredBy: { name: { full: 'Admin User' } },
                      paidBy: { name: { full: 'Painter One' } },
                      reimbursableTo: null,
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    }), { status: 200 }))

    const jobs = await fetchJobberQuoteJobs('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].expenses.nodes[0].title).toBe('Paint supplies')
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>
    expect(calls[0][1].body).toEqual(expect.stringContaining('quote(id: $id)'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('jobs(first: 5)'))
    expect(calls[0][1].body).toEqual(expect.stringContaining('expenses(first: 25)'))
  })

  it('returns visible converted jobs when Jobber hides another Job object', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        quote: {
          jobs: {
            nodes: [
              null,
              {
                id: 'job-id-1',
                jobNumber: 6789,
                title: 'Visible job',
                jobStatus: 'ACTIVE',
                jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
                expenses: { nodes: [] },
              },
            ],
          },
        },
      },
      errors: [
        { message: 'An object of type Job was hidden due to permissions' },
      ],
    }), { status: 200 }))

    const jobs = await fetchJobberQuoteJobs('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })

    expect(jobs).toHaveLength(1)
    expect(jobs[0].title).toBe('Visible job')
  })

  it('reports a reconnectable permission error when Jobber hides every converted Job object', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        quote: {
          jobs: {
            nodes: [null],
          },
        },
      },
      errors: [
        { message: 'An object of type Job was hidden due to permissions' },
      ],
    }), { status: 200 }))

    await expect(fetchJobberQuoteJobs('encoded-quote-id', {
      accessToken: 'access-token',
      graphqlVersion: '2025-04-16',
      fetcher,
    })).rejects.toMatchObject({
      name: 'JobberPermissionError',
      message: expect.stringContaining('Reconnect Jobber'),
    } satisfies Partial<JobberPermissionError>)
  })
})

describe('jobber mapper', () => {
  it('maps a Jobber quote into fields used by the new quote form and display summary', () => {
    const draft = mapJobberQuoteToDraft({
      id: 'encoded-quote-id',
      quoteNumber: 'Q-1001',
      title: 'Exterior repaint',
      createdAt: '2026-05-13T01:23:45Z',
      message: 'Paint fascia and eaves',
      jobberWebUri: 'https://secure.getjobber.com/quotes/1001',
      client: {
        id: 'client-1',
        name: 'Jane Customer',
        companyName: null,
        firstName: 'Jane',
        lastName: 'Customer',
      },
      property: {
        id: 'property-1',
        jobberWebUri: 'https://secure.getjobber.com/properties/1',
        address: {
          street1: '10 Main St',
          street2: 'Unit 2',
          city: 'Sydney',
          province: 'NSW',
          postalCode: '2000',
        },
      },
      lineItems: {
        nodes: [
          {
            id: 'line-item-1',
            name: 'Exterior fascia',
            category: 'SERVICE',
            description: 'Sand and paint fascia',
            quantity: 2,
            unitPrice: 150,
            totalPrice: 300,
            linkedProductOrService: {
              id: 'service-1',
              name: 'Fascia painting',
              category: 'SERVICE',
              description: 'Standard fascia service',
            },
          },
          {
            id: 'line-item-2',
            name: 'Dulux paint',
            category: 'PRODUCT',
            description: '',
            quantity: 4,
            unitPrice: 80,
            totalPrice: 320,
            linkedProductOrService: null,
          },
        ],
      },
    })

    expect(draft).toEqual({
      jobberQuoteId: 'encoded-quote-id',
      sourceType: 'quote',
      quoteNumber: 'Q-1001',
      createdAt: '2026-05-13T01:23:45Z',
      customerName: 'Jane Customer',
      customerAddress: '10 Main St, Unit 2, Sydney, NSW, 2000',
      workType: 'Exterior',
      areaSqft: null,
      customerType: '',
      sourceUrl: 'https://secure.getjobber.com/quotes/1001',
      productsAndServices: [
        {
          id: 'line-item-1',
          name: 'Exterior fascia',
          category: 'SERVICE',
          description: 'Sand and paint fascia',
          quantity: 2,
          unitPrice: 150,
          totalPrice: 300,
          linkedName: 'Fascia painting',
        },
        {
          id: 'line-item-2',
          name: 'Dulux paint',
          category: 'PRODUCT',
          description: '',
          quantity: 4,
          unitPrice: 80,
          totalPrice: 320,
          linkedName: null,
        },
      ],
      jobExpenses: [],
      jobExpensesError: null,
      financialSummary: {
        quoteTotal: 620,
        expensesTotal: 0,
        profit: 620,
        profitMarginPercent: 100,
      },
    })
  })

  it('uses Jobber Job Type custom field for the displayed customer type', () => {
    const draft = mapJobberQuoteToDraft({
      id: 'encoded-quote-id',
      quoteNumber: '2345',
      title: 'Exterior house repaint',
      createdAt: '2026-05-13T01:23:45Z',
      message: 'Customer type: realestate\nArea Sqft: 1,250\nPaint exterior walls',
      customFields: [
        { label: 'Work Type', valueDropdown: 'Interior' },
        { label: 'Area Sqft', unit: 'sq ft', valueNumeric: 980 },
        { label: 'Property Type', valueDropdown: 'Residential' },
        { label: 'Job Type', valueDropdown: 'Real Estate' },
      ],
      jobberWebUri: 'https://secure.getjobber.com/quotes/2345',
      client: {
        id: 'client-1',
        name: null,
        companyName: null,
        firstName: null,
        lastName: null,
        leadSource: 'Referral',
        sourceAttribution: null,
        tags: { nodes: [{ id: 'tag-1', label: 'Real Estate' }] },
        customFields: [],
      },
      property: {
        id: 'property-1',
        jobberWebUri: 'https://secure.getjobber.com/properties/1',
        customFields: [],
        address: null,
      },
      lineItems: {
        nodes: [
          {
            id: 'line-item-1',
            name: 'Exterior wall service',
            category: 'SERVICE',
            description: 'Residential prep and paint',
            quantity: 1,
            unitPrice: 1200,
            totalPrice: 1200,
            linkedProductOrService: null,
          },
        ],
      },
    })

    expect(draft.workType).toBe('Interior')
    expect(draft.areaSqft).toBe(980)
    expect(draft.customerType).toBe('Real Estate')
  })

  it('calculates quote total, job expenses total, profit, and profit margin', () => {
    const draft = mapJobberQuoteToDraft({
      id: 'encoded-quote-id',
      quoteNumber: '2345',
      title: 'Converted repaint',
      createdAt: '2026-05-13T01:23:45Z',
      message: null,
      jobberWebUri: 'https://secure.getjobber.com/quotes/2345',
      client: null,
      property: null,
      lineItems: {
        nodes: [
          {
            id: 'line-item-1',
            name: 'Exterior wall service',
            category: 'SERVICE',
            description: '',
            quantity: 1,
            unitPrice: 1200,
            totalPrice: 1200,
            linkedProductOrService: null,
          },
          {
            id: 'line-item-2',
            name: 'Paint materials',
            category: 'PRODUCT',
            description: '',
            quantity: 1,
            unitPrice: 300,
            totalPrice: 300,
            linkedProductOrService: null,
          },
        ],
      },
      jobs: {
        nodes: [
          {
            id: 'job-id-1',
            jobNumber: 6789,
            title: 'Exterior repaint job',
            jobStatus: 'ACTIVE',
            jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
            expenses: {
              nodes: [
                {
                  id: 'expense-id-1',
                  title: 'Paint supplies',
                  description: '',
                  date: '2026-05-14T00:00:00Z',
                  total: 245.5,
                  enteredBy: null,
                  paidBy: null,
                  reimbursableTo: null,
                },
                {
                  id: 'expense-id-2',
                  title: 'Fuel',
                  description: '',
                  date: '2026-05-14T00:00:00Z',
                  total: 54.5,
                  enteredBy: null,
                  paidBy: null,
                  reimbursableTo: null,
                },
                {
                  id: 'expense-id-3',
                  title: 'Pending receipt',
                  description: '',
                  date: '2026-05-14T00:00:00Z',
                  total: null,
                  enteredBy: null,
                  paidBy: null,
                  reimbursableTo: null,
                },
              ],
            },
          },
        ],
      },
    })

    expect(draft.financialSummary).toEqual({
      quoteTotal: 1500,
      expensesTotal: 300,
      profit: 1200,
      profitMarginPercent: 80,
    })
  })

  it('maps converted Jobber jobs and their expenses onto the quote draft', () => {
    const draft = mapJobberQuoteToDraft({
      id: 'encoded-quote-id',
      quoteNumber: '2345',
      title: 'Converted repaint',
      createdAt: '2026-05-13T01:23:45Z',
      message: null,
      jobberWebUri: 'https://secure.getjobber.com/quotes/2345',
      client: null,
      property: null,
      lineItems: { nodes: [] },
      jobs: {
        nodes: [
          {
            id: 'job-id-1',
            jobNumber: 6789,
            title: 'Exterior repaint job',
            jobStatus: 'ACTIVE',
            jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
            expenses: {
              nodes: [
                {
                  id: 'expense-id-1',
                  title: 'Paint supplies',
                  description: 'Primer and rollers',
                  date: '2026-05-14T00:00:00Z',
                  total: 245.5,
                  enteredBy: { name: { full: 'Admin User' } },
                  paidBy: { name: { full: 'Painter One' } },
                  reimbursableTo: null,
                },
              ],
            },
          },
        ],
      },
    })

    expect(draft.jobExpenses).toEqual([
      {
        jobId: 'job-id-1',
        jobNumber: 6789,
        jobTitle: 'Exterior repaint job',
        jobStatus: 'ACTIVE',
        jobUrl: 'https://secure.getjobber.com/jobs/6789',
        expenses: [
          {
            id: 'expense-id-1',
            title: 'Paint supplies',
            description: 'Primer and rollers',
            date: '2026-05-14T00:00:00Z',
            total: 245.5,
            enteredBy: 'Admin User',
            paidBy: 'Painter One',
            reimbursableTo: null,
          },
        ],
      },
    ])
    expect(draft.jobExpensesError).toBeNull()
    expect(draft.financialSummary).toEqual({
      quoteTotal: 0,
      expensesTotal: 245.5,
      profit: -245.5,
      profitMarginPercent: null,
    })
  })

  it('maps a Jobber job into the same draft shape used by the new quote form', () => {
    const draft = mapJobberJobToDraft({
      id: 'job-id-1',
      jobNumber: 6789,
      title: 'Exterior repaint job',
      createdAt: '2026-05-14T01:23:45Z',
      instructions: 'Paint exterior walls',
      customFields: [
        { label: 'Job Type', valueDropdown: 'Residential' },
      ],
      jobStatus: 'ACTIVE',
      jobType: 'ONE_OFF',
      total: 1200,
      jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
      client: {
        id: 'client-1',
        name: 'Jane Customer',
        companyName: null,
        firstName: 'Jane',
        lastName: 'Customer',
      },
      property: {
        id: 'property-1',
        jobberWebUri: 'https://secure.getjobber.com/properties/1',
        address: {
          street1: '10 Main St',
          street2: null,
          city: 'Sydney',
          province: 'NSW',
          postalCode: '2000',
        },
      },
      quote: {
        id: 'quote-id-1',
        quoteNumber: '2345',
        jobberWebUri: 'https://secure.getjobber.com/quotes/2345',
      },
      lineItems: {
        nodes: [
          {
            id: 'job-line-item-1',
            name: 'Exterior walls',
            category: 'SERVICE',
            description: 'Two coats',
            quantity: 1,
            unitPrice: 1200,
            totalPrice: 1200,
            linkedProductOrService: null,
          },
        ],
      },
      expenses: {
        nodes: [
          {
            id: 'expense-id-1',
            title: 'Paint supplies',
            description: '',
            date: '2026-05-14T00:00:00Z',
            total: 245.5,
            enteredBy: null,
            paidBy: null,
            reimbursableTo: null,
          },
        ],
      },
    })

    expect(draft.sourceType).toBe('job')
    expect(draft.quoteNumber).toBe('Job #6789')
    expect(draft.customerName).toBe('Jane Customer')
    expect(draft.customerAddress).toBe('10 Main St, Sydney, NSW, 2000')
    expect(draft.productsAndServices).toHaveLength(1)
    expect(draft.jobExpenses[0].jobNumber).toBe(6789)
    expect(draft.financialSummary).toEqual({
      quoteTotal: 1200,
      expensesTotal: 245.5,
      profit: 954.5,
      profitMarginPercent: 79.5,
    })
  })

  it('includes extra visit line items and uses the Jobber job total for changed job pricing', () => {
    const jobWithVisitExtras = {
      id: 'job-id-1',
      jobNumber: 6789,
      title: 'Exterior repaint job',
      createdAt: '2026-05-14T01:23:45Z',
      instructions: 'Paint exterior walls',
      customFields: [],
      jobStatus: 'ACTIVE',
      jobType: 'ONE_OFF',
      total: 1500,
      jobberWebUri: 'https://secure.getjobber.com/jobs/6789',
      client: null,
      property: null,
      quote: null,
      lineItems: {
        nodes: [
          {
            id: 'job-line-item-1',
            name: 'Exterior walls',
            category: 'SERVICE',
            description: 'Two coats',
            quantity: 1,
            unitPrice: 1200,
            totalPrice: 1200,
            linkedProductOrService: null,
          },
        ],
      },
      visits: {
        nodes: [
          {
            id: 'visit-id-1',
            title: 'Extra touch-up visit',
            visitStatus: 'COMPLETED',
            startAt: '2026-05-15T09:00:00Z',
            lineItems: {
              nodes: [
                {
                  id: 'job-line-item-1',
                  name: 'Exterior walls',
                  category: 'SERVICE',
                  description: 'Two coats',
                  quantity: 1,
                  unitPrice: 1200,
                  totalPrice: 1200,
                  linkedProductOrService: null,
                },
                {
                  id: 'visit-extra-line-item-1',
                  name: 'Extra trim touch-up',
                  category: 'SERVICE',
                  description: 'Added on site',
                  quantity: 1,
                  unitPrice: 300,
                  totalPrice: 300,
                  linkedProductOrService: null,
                },
              ],
            },
          },
        ],
      },
      expenses: {
        nodes: [
          {
            id: 'expense-id-1',
            title: 'Paint supplies',
            description: '',
            date: '2026-05-14T00:00:00Z',
            total: 245.5,
            enteredBy: null,
            paidBy: null,
            reimbursableTo: null,
          },
        ],
      },
    }

    const draft = mapJobberJobToDraft(jobWithVisitExtras)

    expect(draft.productsAndServices).toEqual([
      expect.objectContaining({
        id: 'job-line-item-1',
        name: 'Exterior walls',
        totalPrice: 1200,
      }),
      expect.objectContaining({
        id: 'visit-extra-line-item-1',
        name: 'Extra trim touch-up',
        totalPrice: 300,
      }),
    ])
    expect(draft.financialSummary).toEqual({
      quoteTotal: 1500,
      expensesTotal: 245.5,
      profit: 1254.5,
      profitMarginPercent: 83.6,
    })
  })
})

describe('jobber quote lookup UI', () => {
  it('keeps the visible lookup as the Jobber quote number after fetch', () => {
    expect(getVisibleJobberQuoteLookupAfterFetch('2345', '2345')).toBe('2345')
    expect(getVisibleJobberQuoteLookupAfterFetch('Z2lkOi8vSm9iYmVyL1F1b3RlLzE=', 'Q-2345')).toBe('Q-2345')
  })
})
