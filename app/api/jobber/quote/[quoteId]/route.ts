import { NextRequest, NextResponse } from 'next/server'
import { fetchJobberQuote } from '@/lib/jobber/client'
import { getJobberConfig, getMissingGraphqlConfigKeys } from '@/lib/jobber/config'
import { mapJobberQuoteToDraft } from '@/lib/jobber/mapper'

interface RouteContext {
  params: Promise<{
    quoteId: string
  }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
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
    const quote = await fetchJobberQuote(decodeURIComponent(quoteId), {
      accessToken: config.accessToken,
      graphqlVersion: config.graphqlVersion,
    })

    return NextResponse.json({
      ok: true,
      data: mapJobberQuoteToDraft(quote),
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to fetch Jobber quote',
    }, { status: 502 })
  }
}
