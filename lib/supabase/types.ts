export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      jobber_job_snapshots: {
        Row: {
          jobber_job_id: string
          payload: Json
          refreshed_at: string
          refreshed_by: string
        }
        Insert: {
          jobber_job_id: string
          payload: Json
          refreshed_at?: string
          refreshed_by: string
        }
        Update: {
          jobber_job_id?: string
          payload?: Json
          refreshed_at?: string
          refreshed_by?: string
        }
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
        Relationships: [
          {
            foreignKeyName: "jobber_quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      jobber_sync_operations: {
        Row: {
          id: string
          quote_id: string
          quote_version: number
          jobber_quote_id: string
          desired_payload: Json
          status: 'queued' | 'running' | 'retryable' | 'reconciliation_required' | 'succeeded' | 'superseded'
          claim_token: string | null
          lease_expires_at: string | null
          attempt_count: number
          failure_code: string | null
          result: Json | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "jobber_sync_operations_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      jobber_sync_steps: {
        Row: {
          id: string
          operation_id: string
          step_key: string
          sequence: number
          kind: 'edit' | 'create' | 'delete' | 'reorder'
          request_payload: Json
          status: 'sending' | 'applied'
          result_payload: Json | null
          created_at: string
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: [
          {
            foreignKeyName: "jobber_sync_steps_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "jobber_sync_operations"
            referencedColumns: ["id"]
          },
        ]
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
      pricing_settings: {
        Row: {
          id: number
          f1_labour_rate: string
          f2_labour_rate: string
          f3_labour_rate: string
          f4_labour_rate: string
          f5_labour_rate: string
          roof_labour_rate: string
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
      quote_areas: {
        Row: {
          id: string
          scope: 'interior' | 'exterior' | 'roof'
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
      quote_items: {
        Row: {
          id: string
          quote_id: string
          product_id: string | null
          product_name_snapshot: string
          memo: string
          market_price_snapshot: string
          actual_price_snapshot: string
          quantity: string
          working_days: string | null
          labour_per_day: string | null
          area_id: string | null
          area_name_snapshot: string | null
          area_scope_snapshot: 'interior' | 'exterior' | 'roof' | null
          is_custom: boolean
          position: number
        }
        Insert: Omit<Database['public']['Tables']['quote_items']['Row'], 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['quote_items']['Insert']>
        Relationships: [
          {
            foreignKeyName: "quote_items_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "quote_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "quote_line_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_line_templates"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "quote_memos_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_option_items: {
        Row: {
          id: string
          option_id: string
          product_id: string | null
          product_name_snapshot: string
          memo: string
          market_price_snapshot: string
          actual_price_snapshot: string
          quantity: string
          working_days: string | null
          labour_per_day: string | null
          area_id: string | null
          area_name_snapshot: string | null
          area_scope_snapshot: 'interior' | 'exterior' | 'roof' | null
          is_custom: boolean
          position: number
        }
        Insert: Omit<Database['public']['Tables']['quote_option_items']['Row'], 'id'> & {
          id?: string
        }
        Update: Partial<Database['public']['Tables']['quote_option_items']['Insert']>
        Relationships: [
          {
            foreignKeyName: "quote_option_items_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "quote_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_option_items_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "quote_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_option_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "quote_options_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_price_revisions: {
        Row: {
          id: string
          quote_id: string
          revision_number: number
          event_type: 'created' | 'updated'
          previous_subtotal: string | null
          previous_final_total: string | null
          new_subtotal: string
          new_final_total: string
          previous_jobber_lines_total: string | null
          new_jobber_lines_total: string | null
          previous_options_subtotal: string | null
          new_options_subtotal: string | null
          previous_options_final_total: string | null
          new_options_final_total: string | null
          changed_by: string | null
          changed_at: string
        }
        Insert: Omit<Database['public']['Tables']['quote_price_revisions']['Row'], 'id' | 'changed_at'> & {
          id?: string
          changed_at?: string
        }
        Update: Partial<Database['public']['Tables']['quote_price_revisions']['Insert']>
        Relationships: [
          {
            foreignKeyName: "quote_price_revisions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_lifecycle_events: {
        Row: { id: string; quote_id: string; event_type: 'deleted' | 'restored'; actor_id: string | null; occurred_at: string; quote_version: number }
        Insert: never
        Update: never
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
          jobber_pending_deleted_line_item_ids: Json
          jobber_snapshot_refreshed_at: string | null
          jobber_snapshot_change_status: 'unknown' | 'unchanged' | 'changed'
          jobber_snapshot_change_summary: Json
          jobber_snapshot_refresh_error: string | null
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
          roof_selected_min: number
          roof_selected_max: number
          subtotal: string
          final_total: string
          pricing_settings_snapshot: Json
          created_by: string
          created_at: string
          updated_by: string | null
          updated_at: string
          version: number
          deleted_at: string | null
          deleted_by: string | null
        }
        Insert: Omit<
          Database['public']['Tables']['quotes']['Row'],
          | 'id'
          | 'created_at'
          | 'updated_at'
          | 'jobber_snapshot_refreshed_at'
          | 'jobber_snapshot_change_status'
          | 'jobber_snapshot_change_summary'
          | 'jobber_snapshot_refresh_error'
          | 'jobber_pending_deleted_line_item_ids'
          | 'version'
          | 'deleted_at'
          | 'deleted_by'
        > & {
          id?: string
          jobber_snapshot_refreshed_at?: string | null
          jobber_snapshot_change_status?: 'unknown' | 'unchanged' | 'changed'
          jobber_snapshot_change_summary?: Json
          jobber_snapshot_refresh_error?: string | null
          jobber_pending_deleted_line_item_ids?: Json
          created_at?: string
          updated_at?: string
          version?: number
          deleted_at?: string | null
          deleted_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['quotes']['Insert']>
        Relationships: []
      }
      user_profiles: {
        Row: {
          id: string
          email: string
          display_name: string | null
          role: 'admin' | 'supervisor'
          jobber_user_id: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          display_name?: string | null
          role?: 'admin' | 'supervisor'
          jobber_user_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          display_name?: string | null
          role?: 'admin' | 'supervisor'
          jobber_user_id?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      warehouse_inventory: {
        Row: {
          id: string
          name: string
          category: string | null
          brand: string | null
          model_specification: string | null
          colour: string | null
          size_or_serial: string | null
          quantity: string
          purchase_date: string | null
          used_date: string | null
          used_location_text: string | null
          status: 'in_stock' | 'out' | 'unknown'
          notes: string | null
          active: boolean
          source_year: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['warehouse_inventory']['Row'], 'id' | 'created_at' | 'updated_at'> & {
          id?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['warehouse_inventory']['Insert']>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      soft_delete_quote: {
        Args: { target_quote_id: string; expected_version: number }
        Returns: { id: string; version: number; deleted_at: string | null }[]
      }
      find_quote_by_jobber_identity: {
        Args: { jobber_id: string | null; snapshot: Json | null }
        Returns: { id: string; version: number; deleted_at: string | null }[]
      }
      apply_quote_jobber_result: {
        Args: { target_quote_id: string; expected_version: number; changes: Json; synced_lines?: Json }
        Returns: undefined
      }
      begin_jobber_sync_step: {
        Args: { operation_id: string; claim_token: string; step_key: string; step_kind: string; request_payload: Json }
        Returns: undefined
      }
      claim_jobber_sync_operation: { Args: { operation_id: string }; Returns: Json }
      complete_jobber_sync_step: {
        Args: { operation_id: string; claim_token: string; step_key: string; result_payload: Json }
        Returns: undefined
      }
      create_quote_with_jobber_sync: { Args: { payload: Json }; Returns: string }
      finish_jobber_sync_operation: {
        Args: { operation_id: string; claim_token: string; outcome: string; failure_code?: string | null }
        Returns: undefined
      }
      get_jobber_sync_operation: { Args: { target_quote_id: string }; Returns: Json }
      record_jobber_sync_completion: {
        Args: { operation_id: string; claim_token: string; result_payload: Json }
        Returns: undefined
      }
      request_jobber_sync: {
        Args: { target_quote_id: string; expected_version: number }
        Returns: Json
      }
      resolve_jobber_sync_operation: { Args: { operation_id: string }; Returns: undefined }
      restore_quote: {
        Args: { target_quote_id: string; expected_version: number }
        Returns: { id: string; version: number; deleted_at: string | null }[]
      }
      create_quote_with_children: { Args: { payload: Json }; Returns: string }
      synchronize_jobber_job_snapshot_scope: {
        Args: { p_assigned_job_ids: string[]; p_jobber_user_id: string }
        Returns: {
          payload: Json
          refreshed_at: string
          refreshed_by: string
        }[]
      }
      update_quote_with_children: {
        Args: { payload: Json }
        Returns: {
          id: string
          version: number
        }[]
      }
      update_quote_with_jobber_sync: {
        Args: { payload: Json }
        Returns: {
          id: string
          version: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
