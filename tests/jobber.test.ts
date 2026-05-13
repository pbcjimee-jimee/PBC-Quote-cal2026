import { describe, expect, it, vi } from 'vitest'
import {
  buildJobberAuthorizationUrl,
  getJobberConfig,
  getMissingOAuthConfigKeys,
} from '@/lib/jobber/config'
import { exchangeAuthorizationCode } from '@/lib/jobber/oauth'
import { fetchJobberQuote } from '@/lib/jobber/client'
import { mapJobberQuoteToDraft } from '@/lib/jobber/mapper'

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
})

describe('jobber client', () => {
  it('posts GraphQL requests with bearer auth and Jobber version headers', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      data: {
        quote: {
          id: 'encoded-quote-id',
          quoteNumber: 'Q-1001',
          title: 'Interior repaint',
          message: null,
          jobberWebUri: 'https://secure.getjobber.com/quotes/1001',
          client: { id: 'client-1', name: 'Jane Customer', companyName: null, firstName: 'Jane', lastName: 'Customer' },
          property: null,
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
  })
})

describe('jobber mapper', () => {
  it('maps a Jobber quote into fields used by the new quote form', () => {
    const draft = mapJobberQuoteToDraft({
      id: 'encoded-quote-id',
      quoteNumber: 'Q-1001',
      title: 'Exterior repaint',
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
    })

    expect(draft).toEqual({
      jobberQuoteId: 'encoded-quote-id',
      customerName: 'Jane Customer',
      customerAddress: '10 Main St, Unit 2, Sydney, NSW, 2000',
      workType: 'Exterior repaint',
      sourceUrl: 'https://secure.getjobber.com/quotes/1001',
    })
  })
})
