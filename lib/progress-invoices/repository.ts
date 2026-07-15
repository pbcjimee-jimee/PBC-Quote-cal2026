import type { ActionErrorCode, ActionResult } from '@/lib/actions/types'

export interface SaveBusinessInvoiceProfilePayload {
  legal_name: string
  trading_name?: string | null
  abn: string
  contractor_licence?: string | null
  business_address: string
  phone: string
  email: string
  bank_name: string
  bsb: string
  bank_account_name: string
  bank_account_number: string
  gst_rate: '0.10'
  business_timezone: 'Australia/Sydney'
  default_payment_term_days: number
  expected_version?: number
}

export interface BusinessInvoiceProfileRpcResult {
  id: string
  legal_name: string
  trading_name: string
  abn: string
  contractor_licence: string
  business_address: string
  phone: string
  email: string
  bank_name: string
  bsb: string
  bank_account_name: string
  bank_account_number: string
  gst_rate: string
  business_timezone: 'Australia/Sydney'
  default_payment_term_days: number
  version: number
  created_by: string
  updated_by: string
  created_at: string
  updated_at: string
}

export interface ProgressInvoiceCommandMap {
  save_business_invoice_profile: {
    payload: SaveBusinessInvoiceProfilePayload
    result: BusinessInvoiceProfileRpcResult
  }
}

export interface ProgressInvoiceRpcError {
  message?: unknown
  code?: unknown
  details?: unknown
  hint?: unknown
}

export interface ProgressInvoiceRpcClient {
  rpc(
    command: string,
    args: { payload: unknown }
  ): Promise<{ data: unknown; error: ProgressInvoiceRpcError | null }>
}

type ProgressInvoiceCommand = keyof ProgressInvoiceCommandMap
type CommandPayload<TCommand extends ProgressInvoiceCommand> =
  ProgressInvoiceCommandMap[TCommand]['payload']
type CommandResult<TCommand extends ProgressInvoiceCommand> =
  ProgressInvoiceCommandMap[TCommand]['result']

interface ParsedRpcError {
  message: string
  code: string
}

const DOMAIN_ERROR_CODES: Readonly<
  Record<string, { code: ActionErrorCode; error: string }>
> = {
  PROGRESS_AUTH_REQUIRED: {
    code: 'AUTH_REQUIRED',
    error: 'PROGRESS_AUTH_REQUIRED',
  },
  PROGRESS_FORBIDDEN: {
    code: 'FORBIDDEN',
    error: 'PROGRESS_FORBIDDEN',
  },
  PROGRESS_VERSION_CONFLICT: {
    code: 'VERSION_CONFLICT',
    error: 'PROGRESS_VERSION_CONFLICT',
  },
  PROGRESS_NOT_FOUND: {
    code: 'NOT_FOUND',
    error: 'PROGRESS_NOT_FOUND',
  },
  PROGRESS_RECONCILIATION_REQUIRED: {
    code: 'RECONCILIATION_REQUIRED',
    error: 'PROGRESS_RECONCILIATION_REQUIRED',
  },
  PROGRESS_JOBBER_ERROR: {
    code: 'JOBBER_ERROR',
    error: 'PROGRESS_JOBBER_ERROR',
  },
  PROGRESS_DOCUMENT_ERROR: {
    code: 'DOCUMENT_ERROR',
    error: 'PROGRESS_DOCUMENT_ERROR',
  },
  PROGRESS_STORAGE_ERROR: {
    code: 'STORAGE_ERROR',
    error: 'PROGRESS_STORAGE_ERROR',
  },
  IDEMPOTENCY_KEY_REUSED: {
    code: 'VALIDATION',
    error: 'IDEMPOTENCY_KEY_REUSED',
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function readPositiveInteger(
  record: Record<string, unknown>,
  key: string
): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null
}

function parseBusinessInvoiceProfile(
  value: unknown
): BusinessInvoiceProfileRpcResult | null {
  const candidate = Array.isArray(value)
    ? value.length === 1
      ? value[0]
      : null
    : value
  if (!isRecord(candidate)) return null

  const id = readString(candidate, 'id')
  const legalName = readString(candidate, 'legal_name')
  const tradingName = readString(candidate, 'trading_name')
  const abn = readString(candidate, 'abn')
  const contractorLicence = readString(candidate, 'contractor_licence')
  const businessAddress = readString(candidate, 'business_address')
  const phone = readString(candidate, 'phone')
  const email = readString(candidate, 'email')
  const bankName = readString(candidate, 'bank_name')
  const bsb = readString(candidate, 'bsb')
  const bankAccountName = readString(candidate, 'bank_account_name')
  const bankAccountNumber = readString(candidate, 'bank_account_number')
  const gstRate = readString(candidate, 'gst_rate')
  const businessTimezone = readString(candidate, 'business_timezone')
  const defaultPaymentTermDays = candidate.default_payment_term_days
  const version = readPositiveInteger(candidate, 'version')
  const createdBy = readString(candidate, 'created_by')
  const updatedBy = readString(candidate, 'updated_by')
  const createdAt = readString(candidate, 'created_at')
  const updatedAt = readString(candidate, 'updated_at')

  if (
    id === null ||
    legalName === null ||
    tradingName === null ||
    abn === null ||
    contractorLicence === null ||
    businessAddress === null ||
    phone === null ||
    email === null ||
    bankName === null ||
    bsb === null ||
    bankAccountName === null ||
    bankAccountNumber === null ||
    gstRate === null ||
    businessTimezone !== 'Australia/Sydney' ||
    typeof defaultPaymentTermDays !== 'number' ||
    !Number.isSafeInteger(defaultPaymentTermDays) ||
    defaultPaymentTermDays < 0 ||
    defaultPaymentTermDays > 365 ||
    version === null ||
    createdBy === null ||
    updatedBy === null ||
    createdAt === null ||
    updatedAt === null
  ) {
    return null
  }

  return {
    id,
    legal_name: legalName,
    trading_name: tradingName,
    abn,
    contractor_licence: contractorLicence,
    business_address: businessAddress,
    phone,
    email,
    bank_name: bankName,
    bsb,
    bank_account_name: bankAccountName,
    bank_account_number: bankAccountNumber,
    gst_rate: gstRate,
    business_timezone: businessTimezone,
    default_payment_term_days: defaultPaymentTermDays,
    version,
    created_by: createdBy,
    updated_by: updatedBy,
    created_at: createdAt,
    updated_at: updatedAt,
  }
}

function parseRpcError(value: ProgressInvoiceRpcError): ParsedRpcError {
  return {
    message: typeof value.message === 'string' ? value.message : '',
    code: typeof value.code === 'string' ? value.code : '',
  }
}

function mapRpcError(error: ProgressInvoiceRpcError): ActionResult<never> {
  const parsed = parseRpcError(error)
  const domainError = DOMAIN_ERROR_CODES[parsed.message]
  if (domainError) {
    return { ok: false, ...domainError }
  }

  if (['28000', '28P01', 'PGRST301', 'PGRST302'].includes(parsed.code)) {
    return {
      ok: false,
      error: 'PROGRESS_AUTH_REQUIRED',
      code: 'AUTH_REQUIRED',
    }
  }

  if (parsed.code === '42501') {
    return {
      ok: false,
      error: 'PROGRESS_FORBIDDEN',
      code: 'FORBIDDEN',
    }
  }

  if (parsed.code === 'PGRST116') {
    return {
      ok: false,
      error: 'PROGRESS_NOT_FOUND',
      code: 'NOT_FOUND',
    }
  }

  if (parsed.code.startsWith('22') || parsed.code.startsWith('23')) {
    return {
      ok: false,
      error:
        parsed.code === '23505'
          ? 'PROGRESS_UNIQUE_CONFLICT'
          : 'PROGRESS_VALIDATION_FAILED',
      code: 'VALIDATION',
    }
  }

  return { ok: false, error: 'PROGRESS_REQUEST_FAILED' }
}

function parseCommandResult<TCommand extends ProgressInvoiceCommand>(
  command: TCommand,
  value: unknown
): CommandResult<TCommand> | null {
  if (command === 'save_business_invoice_profile') {
    return parseBusinessInvoiceProfile(value) as CommandResult<TCommand> | null
  }
  return null
}

export class ProgressInvoiceRepository {
  constructor(private readonly client: ProgressInvoiceRpcClient) {}

  async call<TCommand extends ProgressInvoiceCommand>(
    command: TCommand,
    payload: CommandPayload<TCommand>
  ): Promise<ActionResult<CommandResult<TCommand>>> {
    const { data, error } = await this.client.rpc(command, { payload })

    if (error) return mapRpcError(error)

    const result = parseCommandResult(command, data)
    if (result === null) {
      return { ok: false, error: 'PROGRESS_RESPONSE_INVALID' }
    }

    return { ok: true, data: result }
  }
}
