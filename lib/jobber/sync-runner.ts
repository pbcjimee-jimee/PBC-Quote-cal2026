import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { getJobberConfig, getMissingGraphqlConfigKeys } from './config'
import { assertJobberEnabled } from './environment'
import {
  fetchDurableJobberQuoteLineItems,
  JobberApiError,
  syncJobberQuoteLineItems,
} from './client'
import { checkDurableJobberSync } from './sync-reconciliation'
import { runDurableJobberSync } from './sync-execution'
import {
  createJobberSyncStore,
  parseNullableJobberSyncOperation,
  parseJobberSyncOperation,
} from './sync-store'
import type { Database } from '@/lib/supabase/types'
import type { DurableJobberTransport, SyncOperation, SyncRunResult } from './sync-types'
import {
  getUsableSharedJobberConnectionToken,
  refreshSharedJobberConnectionToken,
  requireSharedJobberConnectionOwnerId,
  type StoredJobberToken,
} from './tokens'

type AppSupabaseClient = SupabaseClient<Database>
type TransportOptions = { accessToken: string; graphqlVersion: string }
type LoadedCredentials = {
  config: ReturnType<typeof getJobberConfig>
  options: TransportOptions
  token: StoredJobberToken | null
}

export function createDurableJobberTransport(): DurableJobberTransport {
  let credentialsPromise: Promise<LoadedCredentials> | null = null

  async function loadCredentials(): Promise<LoadedCredentials> {
    credentialsPromise ??= (async () => {
      const config = getJobberConfig()
      if (getMissingGraphqlConfigKeys(config).length > 0) {
        throw new Error('Jobber sync is not configured')
      }
      const token = await getUsableSharedJobberConnectionToken(config)
      const accessToken = token?.accessToken ?? config.accessToken
      if (!accessToken) throw new Error('Jobber is not connected')
      return {
        config,
        token,
        options: { accessToken, graphqlVersion: config.graphqlVersion },
      }
    })()
    return credentialsPromise
  }

  return {
    async sync(quoteId, input, journal) {
      assertJobberEnabled()
      const { options } = await loadCredentials()
      return syncJobberQuoteLineItems(quoteId, input, { ...options, journal })
    },

    async read(quoteId) {
      assertJobberEnabled()
      const credentials = await loadCredentials()
      try {
        return await fetchDurableJobberQuoteLineItems(quoteId, credentials.options)
      } catch (error) {
        if (!(error instanceof JobberApiError) || error.status !== 401 || !credentials.token) throw error
      }

      const refreshed = await refreshSharedJobberConnectionToken(
        credentials.token.refreshToken,
        credentials.config,
        requireSharedJobberConnectionOwnerId(credentials.token),
      )
      credentialsPromise = Promise.resolve({
        config: credentials.config,
        token: refreshed,
        options: {
          accessToken: refreshed.accessToken,
          graphqlVersion: credentials.config.graphqlVersion,
        },
      })
      const current = await credentialsPromise
      return fetchDurableJobberQuoteLineItems(quoteId, current.options)
    },
  }
}

export async function getJobberSyncOperationForQuote(
  supabase: AppSupabaseClient,
  quoteId: string,
): Promise<SyncOperation | null> {
  assertJobberEnabled()
  const { data, error } = await supabase.rpc('get_jobber_sync_operation', { target_quote_id: quoteId })
  if (error) throw new Error('Unable to read Jobber sync operation')
  return parseNullableJobberSyncOperation(data)
}

export async function requestJobberSyncOperation(
  supabase: AppSupabaseClient,
  quoteId: string,
  expectedVersion: number,
): Promise<SyncOperation> {
  assertJobberEnabled()
  const { data, error } = await supabase.rpc('request_jobber_sync', {
    target_quote_id: quoteId,
    expected_version: expectedVersion,
  })
  if (error) throw new Error('Unable to request Jobber sync operation')
  return parseJobberSyncOperation(data)
}

export function runJobberSyncOperation(
  operationId: string,
  supabase: AppSupabaseClient,
): Promise<SyncRunResult> {
  assertJobberEnabled()
  return runDurableJobberSync(
    createJobberSyncStore(supabase),
    operationId,
    createDurableJobberTransport(),
  )
}

export function checkJobberSyncOperation(
  operation: SyncOperation,
  supabase: AppSupabaseClient,
): Promise<SyncRunResult> {
  assertJobberEnabled()
  return checkDurableJobberSync(
    createJobberSyncStore(supabase),
    operation,
    createDurableJobberTransport(),
  )
}
