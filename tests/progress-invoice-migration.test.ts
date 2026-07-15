import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260714230000_add_progress_invoice_core.sql'
)

const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''
const databaseTypesPath = join(process.cwd(), 'lib', 'supabase', 'types.ts')
const databaseTypes = existsSync(databaseTypesPath)
  ? readFileSync(databaseTypesPath, 'utf8')
  : ''

const tables = [
  'business_invoice_profiles',
  'progress_invoice_templates',
  'progress_invoice_series',
  'progress_jobber_invoice_snapshots',
  'progress_adjustments',
  'progress_claims',
  'progress_claim_revisions',
  'progress_invoice_revision_sets',
  'progress_payments',
  'progress_payment_revisions',
  'progress_documents',
  'progress_invoice_events',
] as const

const requiredColumns: Readonly<Record<(typeof tables)[number], readonly string[]>> = {
  business_invoice_profiles: [
    'id',
    'legal_name',
    'trading_name',
    'abn',
    'contractor_licence',
    'business_address',
    'phone',
    'email',
    'bank_name',
    'bsb',
    'bank_account_name',
    'bank_account_number',
    'gst_rate',
    'business_timezone',
    'default_payment_term_days',
    'version',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ],
  progress_invoice_templates: [
    'id',
    'version',
    'status',
    'source_evidence_path',
    'source_byte_length',
    'source_sha256',
    'normalized_master_path',
    'normalized_sha256',
    'logo_sha256',
    'manifest_version',
    'cell_map_version',
    'page_layout_version',
    'font_version',
    'font_regular_sha256',
    'font_bold_sha256',
    'manifest',
    'registered_by',
    'activated_at',
    'failure_code',
    'created_at',
    'updated_at',
  ],
  progress_invoice_series: [
    'id',
    'quote_id',
    'source_type',
    'jobber_account_id',
    'jobber_invoice_id',
    'selected_jobber_job_id',
    'jobber_client_id',
    'selected_jobber_property_id',
    'original_jobber_invoice_number',
    'accepted_numbering_base',
    'jobber_link_locked_at',
    'current_jobber_snapshot_id',
    'current_revision_set_id',
    'base_contract_ex_gst',
    'gst_rate',
    'recipient_name',
    'recipient_company',
    'recipient_address',
    'recipient_email',
    'recipient_phone',
    'recipient_abn',
    'site_name',
    'site_address',
    'default_description',
    'reference',
    'last_jobber_sync_attempt_at',
    'last_successful_jobber_sync_at',
    'last_jobber_sync_error_code',
    'status',
    'version',
    'current_adjusted_contract_ex_gst',
    'current_adjusted_contract_gst',
    'current_adjusted_contract_inc_gst',
    'current_claimed_ex_gst',
    'current_claimed_gst',
    'current_claimed_inc_gst',
    'current_actual_receipts',
    'current_outstanding_receivable',
    'current_credit_balance',
    'current_unclaimed_ex_gst',
    'current_unclaimed_gst',
    'current_unclaimed_inc_gst',
    'current_cumulative_percentage',
    'current_payment_state',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ],
  progress_jobber_invoice_snapshots: [
    'id',
    'series_id',
    'schema_version',
    'jobber_account_id',
    'jobber_invoice_id',
    'selected_jobber_job_id',
    'jobber_client_id',
    'selected_jobber_property_id',
    'original_invoice_number',
    'observed_invoice_number',
    'raw_status',
    'normalized_status',
    'jobber_web_uri',
    'invoice_subtotal',
    'invoice_tax',
    'invoice_total',
    'invoice_balance',
    'issued_date',
    'due_date',
    'received_date',
    'external_updated_at',
    'client_name',
    'client_company_name',
    'client_email',
    'client_phone',
    'billing_address',
    'property_address',
    'jobber_job_ids',
    'jobber_property_ids',
    'site_candidates',
    'effective_graphql_version',
    'fetched_at',
    'response_fingerprint',
    'normalization_warnings',
    'created_by',
    'created_at',
  ],
  progress_adjustments: [
    'id',
    'series_id',
    'type',
    'status',
    'effective_date',
    'display_order',
    'description',
    'amount_ex_gst',
    'gst_rate',
    'superseded_adjustment_id',
    'reason',
    'quote_item_id',
    'version',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ],
  progress_claims: [
    'id',
    'series_id',
    'sequence',
    'kind',
    'suffix',
    'tax_invoice_number',
    'status',
    'current_revision_id',
    'original_issued_at',
    'latest_revised_at',
    'version',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ],
  progress_claim_revisions: [
    'id',
    'claim_id',
    'revision_number',
    'state',
    'input_mode',
    'authoritative_cumulative_percentage',
    'authoritative_current_claim_inc_gst',
    'issue_date',
    'due_date',
    'description',
    'notes',
    'supplier_legal_name',
    'supplier_trading_name',
    'supplier_abn',
    'supplier_contractor_licence',
    'supplier_address',
    'supplier_phone',
    'supplier_email',
    'supplier_bank_name',
    'supplier_bsb',
    'supplier_bank_account_name',
    'supplier_bank_account_number',
    'supplier_gst_rate',
    'supplier_timezone',
    'recipient_name',
    'recipient_company',
    'recipient_address',
    'recipient_email',
    'recipient_phone',
    'recipient_abn',
    'site_name',
    'site_address',
    'jobber_account_id',
    'jobber_invoice_id',
    'original_jobber_invoice_number',
    'observed_jobber_invoice_number',
    'accepted_numbering_base',
    'adjusted_contract_ex_gst',
    'adjusted_contract_gst',
    'adjusted_contract_inc_gst',
    'approved_variations_ex_gst',
    'approved_credits_ex_gst',
    'previous_claims_ex_gst',
    'previous_claims_gst',
    'previous_claims_inc_gst',
    'cumulative_target_ex_gst',
    'cumulative_target_gst',
    'cumulative_target_inc_gst',
    'current_claim_ex_gst',
    'current_claim_gst',
    'current_claim_inc_gst',
    'cumulative_percentage',
    'remaining_ex_gst',
    'remaining_gst',
    'remaining_inc_gst',
    'calculation_policy_version',
    'template_id',
    'template_version',
    'edit_classification',
    'financial_snapshot_hash',
    'predecessor_financial_manifest_hash',
    'tax_review_state',
    'tax_review_external_reference',
    'adjustment_snapshot',
    'revision_reason',
    'created_by',
    'created_at',
  ],
  progress_invoice_revision_sets: [
    'id',
    'series_id',
    'set_number',
    'predecessor_set_id',
    'revision_manifest',
    'state',
    'aggregate_financial_manifest_hash',
    'requires_financial_cascade',
    'created_by',
    'reason',
    'publication_correlation_key',
    'generation_started_at',
    'ready_at',
    'published_at',
    'superseded_at',
    'failed_at',
    'failure_code',
    'created_at',
    'updated_at',
  ],
  progress_payments: [
    'id',
    'series_id',
    'source',
    'jobber_payment_id',
    'current_revision_id',
    'matched_manual_payment_id',
    'version',
    'created_by',
    'updated_by',
    'created_at',
    'updated_at',
  ],
  progress_payment_revisions: [
    'id',
    'payment_id',
    'revision_number',
    'received_date',
    'observed_amount',
    'effective_receipt_amount',
    'payment_method',
    'reference',
    'external_status',
    'external_updated_at',
    'sync_state',
    'status',
    'predecessor_revision_id',
    'source_observed_at',
    'created_by',
    'reason',
    'created_at',
  ],
  progress_documents: [
    'id',
    'series_id',
    'claim_revision_id',
    'revision_set_id',
    'scope',
    'format',
    'state',
    'template_id',
    'template_version',
    'renderer_version',
    'storage_path',
    'sha256',
    'page_or_worksheet_count',
    'revision_manifest_hash',
    'snapshot_hash',
    'generation_correlation_key',
    'failure_code',
    'created_by',
    'generated_at',
    'created_at',
    'updated_at',
  ],
  progress_invoice_events: [
    'id',
    'series_id',
    'claim_id',
    'actor_id',
    'event_type',
    'source',
    'occurred_at',
    'prior_revision_id',
    'next_revision_id',
    'safe_field_changes',
    'command_name',
    'correlation_key',
    'request_fingerprint',
    'result_refs',
  ],
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function tableBody(table: (typeof tables)[number]): string {
  const match = sql.match(
    new RegExp(
      `CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?public\\.${escapeRegExp(table)}\\s*\\(([\\s\\S]*?)\\n\\);`,
      'i'
    )
  )

  return match?.[1] ?? ''
}

function expectSql(pattern: RegExp, message: string): void {
  expect(sql, message).toMatch(pattern)
}

describe('Progress Invoice core migration', () => {
  it('includes generated Row, Insert, Update, and Relationships shapes for every core table', () => {
    expect(databaseTypes, `expected ${databaseTypesPath}`).not.toBe('')

    for (const table of tables) {
      const match = databaseTypes.match(
        new RegExp(
          `^      ${escapeRegExp(table)}: \\{([\\s\\S]*?)(?=^      [a-z_][a-z0-9_]*: \\{|^    \\})`,
          'm'
        )
      )

      expect(match?.[1], `expected generated database types for ${table}`).toMatch(
        /Row:\s*\{[\s\S]*Insert:\s*\{[\s\S]*Update:\s*\{[\s\S]*Relationships:/
      )
    }
  })

  it('creates exactly the twelve approved core tables with UUID primary keys', () => {
    expect(sql, `expected ${migrationPath}`).not.toBe('')

    const createdTables = Array.from(
      sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?public\.([a-z0-9_]+)/gi),
      (match) => match[1]
    )

    expect(createdTables).toEqual(tables)

    for (const table of tables) {
      expect(tableBody(table), `expected CREATE TABLE body for ${table}`).toMatch(
        /^\s*id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)/im
      )
    }
  })

  it('stores every approved typed column in its owning table', () => {
    for (const table of tables) {
      const body = tableBody(table)
      for (const column of requiredColumns[table]) {
        expect(body, `expected ${table}.${column}`).toMatch(
          new RegExp(`^\\s*${escapeRegExp(column)}\\s+`, 'im')
        )
      }
    }
  })

  it('uses UUID relationships and the approved financial precisions', () => {
    const uuidRelationships = [
      ['progress_invoice_series', 'quote_id'],
      ['progress_jobber_invoice_snapshots', 'series_id'],
      ['progress_adjustments', 'series_id'],
      ['progress_adjustments', 'quote_item_id'],
      ['progress_claims', 'series_id'],
      ['progress_claim_revisions', 'claim_id'],
      ['progress_invoice_revision_sets', 'series_id'],
      ['progress_payments', 'series_id'],
      ['progress_payment_revisions', 'payment_id'],
      ['progress_documents', 'series_id'],
      ['progress_invoice_events', 'series_id'],
    ] as const

    for (const [table, column] of uuidRelationships) {
      expect(tableBody(table), `expected UUID relationship ${table}.${column}`).toMatch(
        new RegExp(`^\\s*${column}\\s+UUID\\b`, 'im')
      )
    }

    expectSql(/\bNUMERIC\s*\(\s*14\s*,\s*2\s*\)/i, 'money must use NUMERIC(14,2)')
    expectSql(/\bNUMERIC\s*\(\s*9\s*,\s*6\s*\)/i, 'percentages must use NUMERIC(9,6)')
    expectSql(/\bNUMERIC\s*\(\s*5\s*,\s*4\s*\)/i, 'GST must use NUMERIC(5,4)')
    expectSql(
      /CHECK\s*\(\s*gst_rate\s*=\s*0\.10(?:00)?\s*\)/i,
      'v1 GST must be constrained to exactly 0.10'
    )
    expectSql(
      /CHECK\s*\(\s*supplier_gst_rate\s*=\s*0\.10(?:00)?\s*\)/i,
      'revision supplier GST snapshot must be constrained to exactly 0.10'
    )

    const revisions = tableBody('progress_claim_revisions')
    expect(revisions).toMatch(
      /authoritative_cumulative_percentage\s+NUMERIC\s*\(\s*9\s*,\s*6\s*\)/i
    )
    expect(revisions).toMatch(
      /authoritative_current_claim_inc_gst\s+NUMERIC\s*\(\s*14\s*,\s*2\s*\)/i
    )
    expect(revisions).toMatch(
      /input_mode\s*=\s*'cumulative_percentage'[\s\S]*authoritative_cumulative_percentage\s+IS\s+NOT\s+NULL[\s\S]*authoritative_current_claim_inc_gst\s+IS\s+NULL[\s\S]*OR[\s\S]*input_mode\s*=\s*'current_claim_amount'[\s\S]*authoritative_cumulative_percentage\s+IS\s+NULL[\s\S]*authoritative_current_claim_inc_gst\s+IS\s+NOT\s+NULL/i
    )
  })

  it('uses the approved template lifecycle and preserves rotation evidence', () => {
    const templates = tableBody('progress_invoice_templates')

    expect(templates).toMatch(
      /status\s+TEXT\s+NOT\s+NULL\s+DEFAULT\s+'pending'\s+CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'active'\s*,\s*'failed'\s*,\s*'superseded'\s*\)\s*\)/i
    )
    expectSql(
      /OLD\.status\s*=\s*'active'[\s\S]*NEW\.status\s*=\s*'superseded'/i,
      'template evidence guard must allow only the approved Active-to-Superseded rotation transition'
    )
    expectSql(
      /OLD\.status\s+IN\s*\(\s*'failed'\s*,\s*'superseded'\s*\)[\s\S]*NEW\.status\s*<>\s*OLD\.status/i,
      'Failed and Superseded template states must be terminal'
    )
  })

  it('enforces at-most-one profile, active-template, Jobber identity, Claim, and current-set uniqueness', () => {
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_business_invoice_profiles_singleton[\s\S]*ON\s+public\.business_invoice_profiles\s*\(\s*\(\s*true\s*\)\s*\)/i,
      'the at-most-one business profile invariant must be concurrency-safe'
    )
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_progress_invoice_templates_active[\s\S]*WHERE\s+status\s*=\s*'active'/i,
      'only one template may be active'
    )
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_progress_invoice_series_jobber_identity[\s\S]*\(\s*jobber_account_id\s*,\s*jobber_invoice_id\s*\)[\s\S]*WHERE[\s\S]*status\s*<>\s*'void'/i,
      'one non-void series may own a Jobber account/invoice pair'
    )

    const claims = tableBody('progress_claims')
    expect(claims).toMatch(/UNIQUE\s*\(\s*series_id\s*,\s*sequence\s*\)/i)
    expect(claims).toMatch(/UNIQUE\s*\(\s*series_id\s*,\s*suffix\s*\)/i)
    expect(claims).toMatch(/tax_invoice_number\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i)
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_progress_claims_non_void_final[\s\S]*WHERE[\s\S]*kind\s*=\s*'final'[\s\S]*status\s*<>\s*'void'/i,
      'a series may have only one non-void FINAL'
    )
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_progress_revision_sets_current[\s\S]*WHERE\s+state\s*=\s*'current'/i,
      'a series may have only one current revision set'
    )
  })

  it('enforces stable Jobber payment identity and one-to-one Manual reconciliation', () => {
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_progress_payments_jobber_identity[\s\S]*\(\s*series_id\s*,\s*jobber_payment_id\s*\)[\s\S]*WHERE[\s\S]*source\s*=\s*'jobber'/i,
      'Jobber payment identity must be unique within a series'
    )
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_progress_payments_matched_manual[\s\S]*\(\s*matched_manual_payment_id\s*\)[\s\S]*WHERE\s+matched_manual_payment_id\s+IS\s+NOT\s+NULL/i,
      'a Manual payment may be matched at most once'
    )
    expectSql(
      /CREATE\s+TRIGGER\s+trg_progress_payments_validate_match[\s\S]*EXECUTE\s+FUNCTION\s+public\.validate_progress_payment_match\(\)/i,
      'payment matching must validate source direction and same-series ownership'
    )
    expectSql(
      /matched_manual_payment_id\s+IS\s+NULL\s+OR\s+source\s*=\s*'jobber'/i,
      'only Jobber-source rows may point at a matched Manual payment'
    )
  })

  it('enforces positive versions and same-parent current pointers', () => {
    expectSql(/version\s+INT\s+NOT\s+NULL\s+DEFAULT\s+1\s+CHECK\s*\(\s*version\s*>\s*0\s*\)/i, 'versions must be positive')
    expectSql(/revision_number\s+INT\s+NOT\s+NULL\s+CHECK\s*\(\s*revision_number\s*>\s*0\s*\)/i, 'revision numbers must be positive')
    expectSql(/set_number\s+INT\s+NOT\s+NULL\s+CHECK\s*\(\s*set_number\s*>\s*0\s*\)/i, 'set numbers must be positive')

    for (const trigger of [
      'trg_progress_series_validate_current_pointers',
      'trg_progress_claims_validate_current_revision',
      'trg_progress_payments_validate_current_revision',
      'trg_progress_payment_revisions_validate_predecessor',
    ]) {
      expectSql(new RegExp(`CREATE\\s+TRIGGER\\s+${trigger}\\b`, 'i'), `expected ${trigger}`)
    }
  })

  it('protects immutable observations, revisions, ready documents, adjustments, and audit events', () => {
    const expectedTriggers = [
      'trg_progress_invoice_templates_protect_evidence',
      'trg_progress_jobber_snapshots_immutable',
      'trg_progress_adjustments_protect_approved',
      'trg_progress_claim_revisions_immutable',
      'trg_progress_payment_revisions_immutable',
      'trg_progress_documents_protect_ready',
      'trg_progress_invoice_events_append_only',
    ]

    for (const trigger of expectedTriggers) {
      expectSql(
        new RegExp(`CREATE\\s+TRIGGER\\s+${trigger}[\\s\\S]*BEFORE\\s+UPDATE\\s+OR\\s+DELETE`, 'i'),
        `expected immutable-row trigger ${trigger}`
      )
    }
  })

  it('stores bounded idempotency evidence without the financial request payload', () => {
    const events = tableBody('progress_invoice_events')

    expect(events).toMatch(/request_fingerprint\s+(?:CHAR\s*\(\s*64\s*\)|TEXT)(?:\s|$)/i)
    expect(events).toMatch(/result_refs\s+JSONB\s+NOT\s+NULL/i)
    expect(events).toMatch(/pg_column_size\s*\(\s*result_refs\s*\)\s*<=\s*8192/i)
    expect(events).toMatch(
      /command_name\s+IS\s+NULL[\s\S]*correlation_key\s+IS\s+NULL[\s\S]*request_fingerprint\s+IS\s+NULL[\s\S]*OR[\s\S]*command_name\s+IS\s+NOT\s+NULL[\s\S]*correlation_key\s+IS\s+NOT\s+NULL[\s\S]*request_fingerprint\s+IS\s+NOT\s+NULL/i
    )
    expectSql(
      /CREATE\s+UNIQUE\s+INDEX\s+uq_progress_invoice_events_idempotency[\s\S]*\(\s*series_id\s*,\s*command_name\s*,\s*correlation_key\s*\)[\s\S]*WHERE[\s\S]*command_name\s+IS\s+NOT\s+NULL[\s\S]*correlation_key\s+IS\s+NOT\s+NULL/i,
      'idempotent commands require a partial series/command/key uniqueness constraint'
    )
    expect(events).not.toMatch(/request_payload|financial_payload|raw_payload/i)
  })

  it('declares only authenticated SELECT access on every new table', () => {
    for (const table of tables) {
      const escaped = escapeRegExp(table)
      expectSql(
        new RegExp(
          `REVOKE\\s+ALL\\s+ON\\s+TABLE\\s+public\\.${escaped}\\s+FROM\\s+PUBLIC\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role\\s*;`,
          'i'
        ),
        `expected full privilege reset for ${table}`
      )
      expectSql(
        new RegExp(`GRANT\\s+SELECT\\s+ON\\s+TABLE\\s+public\\.${escaped}\\s+TO\\s+authenticated\\s*;`, 'i'),
        `expected authenticated SELECT grant for ${table}`
      )
      expectSql(
        new RegExp(`ALTER\\s+TABLE\\s+public\\.${escaped}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY\\s*;`, 'i'),
        `expected RLS on ${table}`
      )
      expectSql(
        new RegExp(
          `CREATE\\s+POLICY\\s+"${escaped}_authenticated_select"\\s+ON\\s+public\\.${escaped}\\s+FOR\\s+SELECT\\s+TO\\s+authenticated\\s+USING\\s*\\(true\\)\\s*;`,
          'i'
        ),
        `expected authenticated SELECT policy for ${table}`
      )
    }

    expect(sql).not.toMatch(/GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*\bTO\s+(?:anon|authenticated|service_role)\b/i)
    expect(sql).not.toMatch(/CREATE\s+POLICY[^;]*\bTO\s+(?:anon|PUBLIC)\b/i)
    expect(sql).not.toMatch(/CREATE\s+POLICY[^;]*\bFOR\s+(?:INSERT|UPDATE|DELETE|ALL)\b/i)
  })
})
