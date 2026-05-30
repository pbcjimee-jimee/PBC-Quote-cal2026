export const QUOTES_LIST_SELECT = '*, quote_items(*)'
export const QUOTE_DETAIL_SELECT = '*, quote_items(*), quote_options(*, quote_option_items(*)), jobber_quote_lines(*), quote_memos(*)'
export const QUOTE_DETAIL_WITHOUT_MEMOS_SELECT = '*, quote_items(*), quote_options(*, quote_option_items(*)), jobber_quote_lines(*)'
