export const QUOTES_LIST_SELECT = [
  'id',
  'version',
  'customer_name',
  'customer_address',
  'jobber_quote_id',
  'work_type',
  'working_days',
  'labour_per_day',
  'subtotal',
  'final_total',
  'created_by',
  'created_at',
].join(', ')
export const QUOTE_DETAIL_SELECT = '*, quote_items(*), quote_options(*, quote_option_items(*)), jobber_quote_lines(*), quote_memos(*), quote_price_revisions(*)'
export const QUOTE_DETAIL_WITHOUT_MEMOS_SELECT = '*, quote_items(*), quote_options(*, quote_option_items(*)), jobber_quote_lines(*), quote_price_revisions(*)'
