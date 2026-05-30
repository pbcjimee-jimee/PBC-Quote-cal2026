// supabase gen types --project-id ojcrfgguhbxhtlgdflzp 로 재생성 가능
// 지금은 수동 타입 정의 (Codex가 gen types 명령으로 교체 예정)

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string
          name: string
          manufacturer: string | null
          type: string | null
          unit: string
          market_price: string
          actual_price: string
          color_code: string | null
          active: boolean
          category: string | null
          product_line: string | null
          base: string | null
          sheen: string | null
          volume_litres: string | null
          price: string | null
          rrp_price: string | null
          product_code: string | null
          source_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
        Relationships: []
      }
      product_services: {
        Row: {
          id: string
          name: string
          description: string | null
          category: string | null
          unit_price: string
          unit_cost: string | null
          bookable: boolean
          duration_minutes: number | null
          quantity_enabled: boolean
          minimum_quantity: string | null
          maximum_quantity: string | null
          taxable: boolean
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['product_services']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['product_services']['Insert']>
        Relationships: []
      }
      quote_line_templates: {
        Row: {
          id: string
          name: string
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['quote_line_templates']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['quote_line_templates']['Insert']>
        Relationships: []
      }
      quote_line_template_items: {
        Row: {
          id: string
          template_id: string
          kind: 'line_item' | 'text'
          name: string
          description: string | null
          quantity: string | null
          unit_price: string | null
          taxable: boolean
          client_visible: boolean
          linked_product_or_service_id: string | null
          position: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['quote_line_template_items']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['quote_line_template_items']['Insert']>
        Relationships: []
      }
      pricing_settings: {
        Row: {
          id: number
          f1_labour_rate: string
          f2_labour_rate: string
          f3_labour_rate: string
          f4_labour_rate: string
          f5_labour_rate: string
          f2_margin: string
          f3_margin: string
          f4_margin: string
          f5_margin: string
          updated_at: string
          updated_by: string | null
        }
        Insert: Partial<Database['public']['Tables']['pricing_settings']['Row']>
        Update: Partial<Database['public']['Tables']['pricing_settings']['Row']>
        Relationships: []
      }
      quote_areas: {
        Row: {
          id: string
          scope: 'interior' | 'exterior'
          name: string
          active: boolean
          position: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['quote_areas']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['quote_areas']['Insert']>
        Relationships: []
      }
      quotes: {
        Row: {
          id: string
          customer_name: string | null
          customer_address: string | null
          jobber_quote_id: string | null
          jobber_snapshot: Json | null
          jobber_save_mode: 'priced_line_items' | 'description_total' | null
          jobber_sync_status: 'not_synced' | 'synced' | 'failed'
          jobber_last_synced_at: string | null
          jobber_sync_error: string | null
          area_sqft: number | null
          work_type: string | null
          working_days: string
          labour_per_day: string
          formula1_total: string
          formula2_total: string
          formula3_total: string
          formula4_total: string
          formula5_total: string
          selected_min: number
          selected_max: number
          interior_selected_min: number
          interior_selected_max: number
          exterior_selected_min: number
          exterior_selected_max: number
          subtotal: string
          final_total: string
          pricing_settings_snapshot: Json
          created_by: string
          created_at: string
          updated_by: string | null
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['quotes']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['quotes']['Insert']>
        Relationships: []
      }
      quote_items: {
        Row: {
          id: string
          quote_id: string
          product_id: string | null
          product_name_snapshot: string
          market_price_snapshot: string
          actual_price_snapshot: string
          quantity: string
          working_days: string | null
          labour_per_day: string | null
          area_id: string | null
          area_name_snapshot: string | null
          area_scope_snapshot: 'interior' | 'exterior' | null
          is_custom: boolean
          position: number
        }
        Insert: Omit<Database['public']['Tables']['quote_items']['Row'], 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['quote_items']['Insert']>
        Relationships: []
      }
      quote_options: {
        Row: {
          id: string
          quote_id: string
          title: string
          working_days: string
          labour_per_day: string
          material_market: string
          material_actual: string
          formula1_total: string
          formula2_total: string
          formula3_total: string
          formula4_total: string
          formula5_total: string
          selected_min: number
          selected_max: number
          subtotal: string
          final_total: string
          position: number
        }
        Insert: Omit<Database['public']['Tables']['quote_options']['Row'], 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['quote_options']['Insert']>
        Relationships: []
      }
      quote_option_items: {
        Row: {
          id: string
          option_id: string
          product_id: string | null
          product_name_snapshot: string
          market_price_snapshot: string
          actual_price_snapshot: string
          quantity: string
          working_days: string | null
          labour_per_day: string | null
          area_id: string | null
          area_name_snapshot: string | null
          area_scope_snapshot: 'interior' | 'exterior' | null
          is_custom: boolean
          position: number
        }
        Insert: Omit<Database['public']['Tables']['quote_option_items']['Row'], 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['quote_option_items']['Insert']>
        Relationships: []
      }
      quote_memos: {
        Row: {
          id: string
          quote_id: string
          body: string
          position: number
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['quote_memos']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['quote_memos']['Insert']>
        Relationships: []
      }
      jobber_quote_lines: {
        Row: {
          id: string
          quote_id: string
          kind: 'line_item' | 'text'
          name: string
          description: string | null
          quantity: string | null
          unit_price: string | null
          total_price: string | null
          taxable: boolean
          client_visible: boolean
          jobber_line_item_id: string | null
          linked_product_or_service_id: string | null
          position: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['jobber_quote_lines']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['jobber_quote_lines']['Insert']>
        Relationships: []
      }
      jobber_tokens: {
        Row: {
          user_id: string
          access_token: string
          refresh_token: string
          token_type: string | null
          scope: string | null
          expires_at: string | null
          connected_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['jobber_tokens']['Row'], 'connected_at' | 'updated_at'> & {
          connected_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['jobber_tokens']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
