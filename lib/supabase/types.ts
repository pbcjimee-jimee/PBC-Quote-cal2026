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
      business_invoice_profiles: {
        Row: {
          abn: string
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          bsb: string
          business_address: string
          business_timezone: string
          contractor_licence: string
          created_at: string
          created_by: string
          default_payment_term_days: number
          email: string
          gst_rate: number
          id: string
          legal_name: string
          phone: string
          trading_name: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          abn: string
          bank_account_name: string
          bank_account_number: string
          bank_name: string
          bsb: string
          business_address: string
          business_timezone?: string
          contractor_licence: string
          created_at?: string
          created_by: string
          default_payment_term_days?: number
          email: string
          gst_rate?: number
          id?: string
          legal_name: string
          phone: string
          trading_name: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          abn?: string
          bank_account_name?: string
          bank_account_number?: string
          bank_name?: string
          bsb?: string
          business_address?: string
          business_timezone?: string
          contractor_licence?: string
          created_at?: string
          created_by?: string
          default_payment_term_days?: number
          email?: string
          gst_rate?: number
          id?: string
          legal_name?: string
          phone?: string
          trading_name?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: []
      }
      progress_invoice_templates: {
        Row: {
          activated_at: string | null
          cell_map_version: string
          created_at: string
          failure_code: string | null
          font_bold_sha256: string
          font_regular_sha256: string
          font_version: string
          id: string
          logo_sha256: string
          manifest: Json
          manifest_version: string
          normalized_master_path: string
          normalized_sha256: string
          page_layout_version: string
          registered_by: string
          source_byte_length: number
          source_evidence_path: string
          source_sha256: string
          status: string
          updated_at: string
          version: number
        }
        Insert: {
          activated_at?: string | null
          cell_map_version: string
          created_at?: string
          failure_code?: string | null
          font_bold_sha256: string
          font_regular_sha256: string
          font_version: string
          id?: string
          logo_sha256: string
          manifest: Json
          manifest_version: string
          normalized_master_path: string
          normalized_sha256: string
          page_layout_version: string
          registered_by: string
          source_byte_length: number
          source_evidence_path: string
          source_sha256: string
          status?: string
          updated_at?: string
          version: number
        }
        Update: {
          activated_at?: string | null
          cell_map_version?: string
          created_at?: string
          failure_code?: string | null
          font_bold_sha256?: string
          font_regular_sha256?: string
          font_version?: string
          id?: string
          logo_sha256?: string
          manifest?: Json
          manifest_version?: string
          normalized_master_path?: string
          normalized_sha256?: string
          page_layout_version?: string
          registered_by?: string
          source_byte_length?: number
          source_evidence_path?: string
          source_sha256?: string
          status?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      progress_invoice_series: {
        Row: {
          accepted_numbering_base: string | null
          base_contract_ex_gst: number
          created_at: string
          created_by: string
          current_actual_receipts: number
          current_adjusted_contract_ex_gst: number
          current_adjusted_contract_gst: number
          current_adjusted_contract_inc_gst: number
          current_claimed_ex_gst: number
          current_claimed_gst: number
          current_claimed_inc_gst: number
          current_credit_balance: number
          current_cumulative_percentage: number
          current_jobber_snapshot_id: string | null
          current_outstanding_receivable: number
          current_payment_state: string
          current_revision_set_id: string | null
          current_unclaimed_ex_gst: number
          current_unclaimed_gst: number
          current_unclaimed_inc_gst: number
          default_description: string
          gst_rate: number
          id: string
          jobber_account_id: string | null
          jobber_client_id: string | null
          jobber_invoice_id: string | null
          jobber_link_locked_at: string | null
          last_jobber_sync_attempt_at: string | null
          last_jobber_sync_error_code: string | null
          last_successful_jobber_sync_at: string | null
          original_jobber_invoice_number: string | null
          quote_id: string | null
          recipient_abn: string | null
          recipient_address: string
          recipient_company: string | null
          recipient_email: string | null
          recipient_name: string
          recipient_phone: string | null
          reference: string | null
          selected_jobber_job_id: string | null
          selected_jobber_property_id: string | null
          site_address: string
          site_name: string
          source_type: string
          status: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          accepted_numbering_base?: string | null
          base_contract_ex_gst: number
          created_at?: string
          created_by: string
          current_actual_receipts?: number
          current_adjusted_contract_ex_gst?: number
          current_adjusted_contract_gst?: number
          current_adjusted_contract_inc_gst?: number
          current_claimed_ex_gst?: number
          current_claimed_gst?: number
          current_claimed_inc_gst?: number
          current_credit_balance?: number
          current_cumulative_percentage?: number
          current_jobber_snapshot_id?: string | null
          current_outstanding_receivable?: number
          current_payment_state?: string
          current_revision_set_id?: string | null
          current_unclaimed_ex_gst?: number
          current_unclaimed_gst?: number
          current_unclaimed_inc_gst?: number
          default_description: string
          gst_rate?: number
          id?: string
          jobber_account_id?: string | null
          jobber_client_id?: string | null
          jobber_invoice_id?: string | null
          jobber_link_locked_at?: string | null
          last_jobber_sync_attempt_at?: string | null
          last_jobber_sync_error_code?: string | null
          last_successful_jobber_sync_at?: string | null
          original_jobber_invoice_number?: string | null
          quote_id?: string | null
          recipient_abn?: string | null
          recipient_address: string
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name: string
          recipient_phone?: string | null
          reference?: string | null
          selected_jobber_job_id?: string | null
          selected_jobber_property_id?: string | null
          site_address: string
          site_name: string
          source_type: string
          status?: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          accepted_numbering_base?: string | null
          base_contract_ex_gst?: number
          created_at?: string
          created_by?: string
          current_actual_receipts?: number
          current_adjusted_contract_ex_gst?: number
          current_adjusted_contract_gst?: number
          current_adjusted_contract_inc_gst?: number
          current_claimed_ex_gst?: number
          current_claimed_gst?: number
          current_claimed_inc_gst?: number
          current_credit_balance?: number
          current_cumulative_percentage?: number
          current_jobber_snapshot_id?: string | null
          current_outstanding_receivable?: number
          current_payment_state?: string
          current_revision_set_id?: string | null
          current_unclaimed_ex_gst?: number
          current_unclaimed_gst?: number
          current_unclaimed_inc_gst?: number
          default_description?: string
          gst_rate?: number
          id?: string
          jobber_account_id?: string | null
          jobber_client_id?: string | null
          jobber_invoice_id?: string | null
          jobber_link_locked_at?: string | null
          last_jobber_sync_attempt_at?: string | null
          last_jobber_sync_error_code?: string | null
          last_successful_jobber_sync_at?: string | null
          original_jobber_invoice_number?: string | null
          quote_id?: string | null
          recipient_abn?: string | null
          recipient_address?: string
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          reference?: string | null
          selected_jobber_job_id?: string | null
          selected_jobber_property_id?: string | null
          site_address?: string
          site_name?: string
          source_type?: string
          status?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_progress_series_current_jobber_snapshot"
            columns: ["current_jobber_snapshot_id", "id"]
            isOneToOne: false
            referencedRelation: "progress_jobber_invoice_snapshots"
            referencedColumns: ["id", "series_id"]
          },
          {
            foreignKeyName: "fk_progress_series_current_revision_set"
            columns: ["current_revision_set_id", "id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_revision_sets"
            referencedColumns: ["id", "series_id"]
          },
          {
            foreignKeyName: "progress_invoice_series_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_jobber_invoice_snapshots: {
        Row: {
          billing_address: string | null
          client_company_name: string | null
          client_email: string | null
          client_name: string
          client_phone: string | null
          created_at: string
          created_by: string
          due_date: string | null
          effective_graphql_version: string
          external_updated_at: string | null
          fetched_at: string
          id: string
          invoice_balance: number | null
          invoice_subtotal: number | null
          invoice_tax: number | null
          invoice_total: number | null
          issued_date: string | null
          jobber_account_id: string
          jobber_client_id: string
          jobber_invoice_id: string
          jobber_job_ids: Json
          jobber_property_ids: Json
          jobber_web_uri: string
          normalization_warnings: Json
          normalized_status: string
          observed_invoice_number: string
          original_invoice_number: string
          property_address: string | null
          raw_status: string
          received_date: string | null
          response_fingerprint: string
          schema_version: number
          selected_jobber_job_id: string | null
          selected_jobber_property_id: string | null
          series_id: string
          site_candidates: Json
        }
        Insert: {
          billing_address?: string | null
          client_company_name?: string | null
          client_email?: string | null
          client_name: string
          client_phone?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          effective_graphql_version: string
          external_updated_at?: string | null
          fetched_at: string
          id?: string
          invoice_balance?: number | null
          invoice_subtotal?: number | null
          invoice_tax?: number | null
          invoice_total?: number | null
          issued_date?: string | null
          jobber_account_id: string
          jobber_client_id: string
          jobber_invoice_id: string
          jobber_job_ids?: Json
          jobber_property_ids?: Json
          jobber_web_uri: string
          normalization_warnings?: Json
          normalized_status: string
          observed_invoice_number: string
          original_invoice_number: string
          property_address?: string | null
          raw_status: string
          received_date?: string | null
          response_fingerprint: string
          schema_version?: number
          selected_jobber_job_id?: string | null
          selected_jobber_property_id?: string | null
          series_id: string
          site_candidates?: Json
        }
        Update: {
          billing_address?: string | null
          client_company_name?: string | null
          client_email?: string | null
          client_name?: string
          client_phone?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          effective_graphql_version?: string
          external_updated_at?: string | null
          fetched_at?: string
          id?: string
          invoice_balance?: number | null
          invoice_subtotal?: number | null
          invoice_tax?: number | null
          invoice_total?: number | null
          issued_date?: string | null
          jobber_account_id?: string
          jobber_client_id?: string
          jobber_invoice_id?: string
          jobber_job_ids?: Json
          jobber_property_ids?: Json
          jobber_web_uri?: string
          normalization_warnings?: Json
          normalized_status?: string
          observed_invoice_number?: string
          original_invoice_number?: string
          property_address?: string | null
          raw_status?: string
          received_date?: string | null
          response_fingerprint?: string
          schema_version?: number
          selected_jobber_job_id?: string | null
          selected_jobber_property_id?: string | null
          series_id?: string
          site_candidates?: Json
        }
        Relationships: [
          {
            foreignKeyName: "progress_jobber_invoice_snapshots_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_series"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_adjustments: {
        Row: {
          amount_ex_gst: number
          created_at: string
          created_by: string
          description: string
          display_order: number
          effective_date: string
          gst_rate: number
          id: string
          quote_item_id: string | null
          reason: string | null
          series_id: string
          status: string
          superseded_adjustment_id: string | null
          type: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          amount_ex_gst: number
          created_at?: string
          created_by: string
          description: string
          display_order?: number
          effective_date: string
          gst_rate?: number
          id?: string
          quote_item_id?: string | null
          reason?: string | null
          series_id: string
          status?: string
          superseded_adjustment_id?: string | null
          type: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          amount_ex_gst?: number
          created_at?: string
          created_by?: string
          description?: string
          display_order?: number
          effective_date?: string
          gst_rate?: number
          id?: string
          quote_item_id?: string | null
          reason?: string | null
          series_id?: string
          status?: string
          superseded_adjustment_id?: string | null
          type?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "progress_adjustments_quote_item_id_fkey"
            columns: ["quote_item_id"]
            isOneToOne: false
            referencedRelation: "quote_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_adjustments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_adjustments_superseded_adjustment_id_fkey"
            columns: ["superseded_adjustment_id"]
            isOneToOne: false
            referencedRelation: "progress_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_claims: {
        Row: {
          created_at: string
          created_by: string
          current_revision_id: string | null
          id: string
          kind: string
          latest_revised_at: string | null
          original_issued_at: string | null
          sequence: number
          series_id: string
          status: string
          suffix: string
          tax_invoice_number: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          current_revision_id?: string | null
          id?: string
          kind: string
          latest_revised_at?: string | null
          original_issued_at?: string | null
          sequence: number
          series_id: string
          status?: string
          suffix: string
          tax_invoice_number: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          current_revision_id?: string | null
          id?: string
          kind?: string
          latest_revised_at?: string | null
          original_issued_at?: string | null
          sequence?: number
          series_id?: string
          status?: string
          suffix?: string
          tax_invoice_number?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_progress_claims_current_revision"
            columns: ["current_revision_id", "id"]
            isOneToOne: false
            referencedRelation: "progress_claim_revisions"
            referencedColumns: ["id", "claim_id"]
          },
          {
            foreignKeyName: "progress_claims_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_series"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_claim_revisions: {
        Row: {
          accepted_numbering_base: string
          adjusted_contract_ex_gst: number
          adjusted_contract_gst: number
          adjusted_contract_inc_gst: number
          adjustment_snapshot: Json
          approved_credits_ex_gst: number
          approved_variations_ex_gst: number
          authoritative_cumulative_percentage: number | null
          authoritative_current_claim_inc_gst: number | null
          calculation_policy_version: string
          claim_id: string
          created_at: string
          created_by: string
          cumulative_percentage: number
          cumulative_target_ex_gst: number
          cumulative_target_gst: number
          cumulative_target_inc_gst: number
          current_claim_ex_gst: number
          current_claim_gst: number
          current_claim_inc_gst: number
          description: string
          due_date: string
          edit_classification: string
          financial_snapshot_hash: string
          id: string
          input_mode: string
          issue_date: string
          jobber_account_id: string
          jobber_invoice_id: string
          notes: string
          observed_jobber_invoice_number: string
          original_jobber_invoice_number: string
          predecessor_financial_manifest_hash: string | null
          previous_claims_ex_gst: number
          previous_claims_gst: number
          previous_claims_inc_gst: number
          recipient_abn: string | null
          recipient_address: string
          recipient_company: string | null
          recipient_email: string | null
          recipient_name: string
          recipient_phone: string | null
          reference: string | null
          remaining_ex_gst: number
          remaining_gst: number
          remaining_inc_gst: number
          revision_number: number
          revision_reason: string | null
          site_address: string
          site_name: string
          state: string
          supplier_abn: string
          supplier_address: string
          supplier_bank_account_name: string
          supplier_bank_account_number: string
          supplier_bank_name: string
          supplier_bsb: string
          supplier_contractor_licence: string
          supplier_default_payment_term_days: number
          supplier_email: string
          supplier_gst_rate: number
          supplier_legal_name: string
          supplier_phone: string
          supplier_profile_version: number
          supplier_timezone: string
          supplier_trading_name: string
          tax_review_external_reference: string | null
          tax_review_state: string
          template_id: string | null
          template_version: number | null
        }
        Insert: {
          accepted_numbering_base: string
          adjusted_contract_ex_gst: number
          adjusted_contract_gst: number
          adjusted_contract_inc_gst: number
          adjustment_snapshot?: Json
          approved_credits_ex_gst?: number
          approved_variations_ex_gst?: number
          authoritative_cumulative_percentage?: number | null
          authoritative_current_claim_inc_gst?: number | null
          calculation_policy_version: string
          claim_id: string
          created_at?: string
          created_by: string
          cumulative_percentage: number
          cumulative_target_ex_gst: number
          cumulative_target_gst: number
          cumulative_target_inc_gst: number
          current_claim_ex_gst: number
          current_claim_gst: number
          current_claim_inc_gst: number
          description: string
          due_date: string
          edit_classification: string
          financial_snapshot_hash: string
          id?: string
          input_mode: string
          issue_date: string
          jobber_account_id: string
          jobber_invoice_id: string
          notes?: string
          observed_jobber_invoice_number: string
          original_jobber_invoice_number: string
          predecessor_financial_manifest_hash?: string | null
          previous_claims_ex_gst?: number
          previous_claims_gst?: number
          previous_claims_inc_gst?: number
          recipient_abn?: string | null
          recipient_address: string
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name: string
          recipient_phone?: string | null
          reference?: string | null
          remaining_ex_gst: number
          remaining_gst: number
          remaining_inc_gst: number
          revision_number: number
          revision_reason?: string | null
          site_address: string
          site_name: string
          state?: string
          supplier_abn: string
          supplier_address: string
          supplier_bank_account_name: string
          supplier_bank_account_number: string
          supplier_bank_name: string
          supplier_bsb: string
          supplier_contractor_licence: string
          supplier_default_payment_term_days: number
          supplier_email: string
          supplier_gst_rate?: number
          supplier_legal_name: string
          supplier_phone: string
          supplier_profile_version: number
          supplier_timezone?: string
          supplier_trading_name: string
          tax_review_external_reference?: string | null
          tax_review_state?: string
          template_id?: string | null
          template_version?: number | null
        }
        Update: {
          accepted_numbering_base?: string
          adjusted_contract_ex_gst?: number
          adjusted_contract_gst?: number
          adjusted_contract_inc_gst?: number
          adjustment_snapshot?: Json
          approved_credits_ex_gst?: number
          approved_variations_ex_gst?: number
          authoritative_cumulative_percentage?: number | null
          authoritative_current_claim_inc_gst?: number | null
          calculation_policy_version?: string
          claim_id?: string
          created_at?: string
          created_by?: string
          cumulative_percentage?: number
          cumulative_target_ex_gst?: number
          cumulative_target_gst?: number
          cumulative_target_inc_gst?: number
          current_claim_ex_gst?: number
          current_claim_gst?: number
          current_claim_inc_gst?: number
          description?: string
          due_date?: string
          edit_classification?: string
          financial_snapshot_hash?: string
          id?: string
          input_mode?: string
          issue_date?: string
          jobber_account_id?: string
          jobber_invoice_id?: string
          notes?: string
          observed_jobber_invoice_number?: string
          original_jobber_invoice_number?: string
          predecessor_financial_manifest_hash?: string | null
          previous_claims_ex_gst?: number
          previous_claims_gst?: number
          previous_claims_inc_gst?: number
          recipient_abn?: string | null
          recipient_address?: string
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          reference?: string | null
          remaining_ex_gst?: number
          remaining_gst?: number
          remaining_inc_gst?: number
          revision_number?: number
          revision_reason?: string | null
          site_address?: string
          site_name?: string
          state?: string
          supplier_abn?: string
          supplier_address?: string
          supplier_bank_account_name?: string
          supplier_bank_account_number?: string
          supplier_bank_name?: string
          supplier_bsb?: string
          supplier_contractor_licence?: string
          supplier_default_payment_term_days?: number
          supplier_email?: string
          supplier_gst_rate?: number
          supplier_legal_name?: string
          supplier_phone?: string
          supplier_profile_version?: number
          supplier_timezone?: string
          supplier_trading_name?: string
          tax_review_external_reference?: string | null
          tax_review_state?: string
          template_id?: string | null
          template_version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_progress_claim_revisions_template"
            columns: ["template_id", "template_version"]
            isOneToOne: false
            referencedRelation: "progress_invoice_templates"
            referencedColumns: ["id", "version"]
          },
          {
            foreignKeyName: "progress_claim_revisions_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "progress_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_invoice_revision_sets: {
        Row: {
          aggregate_financial_manifest_hash: string
          created_at: string
          created_by: string
          failed_at: string | null
          failure_code: string | null
          generation_started_at: string | null
          id: string
          predecessor_set_id: string | null
          publication_correlation_key: string | null
          published_at: string | null
          ready_at: string | null
          reason: string | null
          requires_financial_cascade: boolean
          revision_manifest: Json
          series_id: string
          set_number: number
          state: string
          superseded_at: string | null
          updated_at: string
        }
        Insert: {
          aggregate_financial_manifest_hash: string
          created_at?: string
          created_by: string
          failed_at?: string | null
          failure_code?: string | null
          generation_started_at?: string | null
          id?: string
          predecessor_set_id?: string | null
          publication_correlation_key?: string | null
          published_at?: string | null
          ready_at?: string | null
          reason?: string | null
          requires_financial_cascade?: boolean
          revision_manifest: Json
          series_id: string
          set_number: number
          state?: string
          superseded_at?: string | null
          updated_at?: string
        }
        Update: {
          aggregate_financial_manifest_hash?: string
          created_at?: string
          created_by?: string
          failed_at?: string | null
          failure_code?: string | null
          generation_started_at?: string | null
          id?: string
          predecessor_set_id?: string | null
          publication_correlation_key?: string | null
          published_at?: string | null
          ready_at?: string | null
          reason?: string | null
          requires_financial_cascade?: boolean
          revision_manifest?: Json
          series_id?: string
          set_number?: number
          state?: string
          superseded_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_progress_revision_sets_predecessor_parent"
            columns: ["predecessor_set_id", "series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_revision_sets"
            referencedColumns: ["id", "series_id"]
          },
          {
            foreignKeyName: "progress_invoice_revision_sets_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_series"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_payments: {
        Row: {
          created_at: string
          created_by: string
          current_revision_id: string | null
          id: string
          jobber_payment_id: string | null
          matched_manual_payment_id: string | null
          series_id: string
          source: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          current_revision_id?: string | null
          id?: string
          jobber_payment_id?: string | null
          matched_manual_payment_id?: string | null
          series_id: string
          source: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          current_revision_id?: string | null
          id?: string
          jobber_payment_id?: string | null
          matched_manual_payment_id?: string | null
          series_id?: string
          source?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_progress_payments_current_revision"
            columns: ["current_revision_id", "id"]
            isOneToOne: false
            referencedRelation: "progress_payment_revisions"
            referencedColumns: ["id", "payment_id"]
          },
          {
            foreignKeyName: "fk_progress_payments_matched_manual_parent"
            columns: ["matched_manual_payment_id", "series_id"]
            isOneToOne: false
            referencedRelation: "progress_payments"
            referencedColumns: ["id", "series_id"]
          },
          {
            foreignKeyName: "progress_payments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_series"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_payment_revisions: {
        Row: {
          created_at: string
          created_by: string
          effective_receipt_amount: number
          external_status: string | null
          external_updated_at: string | null
          id: string
          observed_amount: number
          payment_id: string
          payment_method: string | null
          predecessor_revision_id: string | null
          reason: string | null
          received_date: string
          reference: string | null
          revision_number: number
          source_observed_at: string | null
          status: string
          sync_state: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          effective_receipt_amount: number
          external_status?: string | null
          external_updated_at?: string | null
          id?: string
          observed_amount: number
          payment_id: string
          payment_method?: string | null
          predecessor_revision_id?: string | null
          reason?: string | null
          received_date: string
          reference?: string | null
          revision_number: number
          source_observed_at?: string | null
          status?: string
          sync_state?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          effective_receipt_amount?: number
          external_status?: string | null
          external_updated_at?: string | null
          id?: string
          observed_amount?: number
          payment_id?: string
          payment_method?: string | null
          predecessor_revision_id?: string | null
          reason?: string | null
          received_date?: string
          reference?: string | null
          revision_number?: number
          source_observed_at?: string | null
          status?: string
          sync_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_progress_payment_revisions_predecessor_parent"
            columns: ["predecessor_revision_id", "payment_id"]
            isOneToOne: false
            referencedRelation: "progress_payment_revisions"
            referencedColumns: ["id", "payment_id"]
          },
          {
            foreignKeyName: "progress_payment_revisions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "progress_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_documents: {
        Row: {
          claim_revision_id: string | null
          created_at: string
          created_by: string
          failure_code: string | null
          format: string
          generated_at: string | null
          generation_correlation_key: string
          id: string
          page_or_worksheet_count: number | null
          renderer_version: string
          revision_manifest_hash: string | null
          revision_set_id: string | null
          scope: string
          series_id: string
          sha256: string | null
          snapshot_hash: string
          state: string
          storage_path: string | null
          template_id: string
          template_version: number
          updated_at: string
        }
        Insert: {
          claim_revision_id?: string | null
          created_at?: string
          created_by: string
          failure_code?: string | null
          format: string
          generated_at?: string | null
          generation_correlation_key: string
          id?: string
          page_or_worksheet_count?: number | null
          renderer_version: string
          revision_manifest_hash?: string | null
          revision_set_id?: string | null
          scope: string
          series_id: string
          sha256?: string | null
          snapshot_hash: string
          state?: string
          storage_path?: string | null
          template_id: string
          template_version: number
          updated_at?: string
        }
        Update: {
          claim_revision_id?: string | null
          created_at?: string
          created_by?: string
          failure_code?: string | null
          format?: string
          generated_at?: string | null
          generation_correlation_key?: string
          id?: string
          page_or_worksheet_count?: number | null
          renderer_version?: string
          revision_manifest_hash?: string | null
          revision_set_id?: string | null
          scope?: string
          series_id?: string
          sha256?: string | null
          snapshot_hash?: string
          state?: string
          storage_path?: string | null
          template_id?: string
          template_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_documents_claim_revision_id_fkey"
            columns: ["claim_revision_id"]
            isOneToOne: false
            referencedRelation: "progress_claim_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_documents_revision_set_id_fkey"
            columns: ["revision_set_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_revision_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_documents_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_invoice_events: {
        Row: {
          actor_id: string
          claim_id: string | null
          command_name: string | null
          correlation_key: string | null
          event_type: string
          id: string
          next_revision_id: string | null
          occurred_at: string
          prior_revision_id: string | null
          request_fingerprint: string | null
          result_refs: Json
          safe_field_changes: Json
          series_id: string
          source: string
        }
        Insert: {
          actor_id: string
          claim_id?: string | null
          command_name?: string | null
          correlation_key?: string | null
          event_type: string
          id?: string
          next_revision_id?: string | null
          occurred_at?: string
          prior_revision_id?: string | null
          request_fingerprint?: string | null
          result_refs?: Json
          safe_field_changes?: Json
          series_id: string
          source: string
        }
        Update: {
          actor_id?: string
          claim_id?: string | null
          command_name?: string | null
          correlation_key?: string | null
          event_type?: string
          id?: string
          next_revision_id?: string | null
          occurred_at?: string
          prior_revision_id?: string | null
          request_fingerprint?: string | null
          result_refs?: Json
          safe_field_changes?: Json
          series_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_invoice_events_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "progress_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_invoice_events_next_revision_id_fkey"
            columns: ["next_revision_id"]
            isOneToOne: false
            referencedRelation: "progress_claim_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_invoice_events_prior_revision_id_fkey"
            columns: ["prior_revision_id"]
            isOneToOne: false
            referencedRelation: "progress_claim_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_invoice_events_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "progress_invoice_series"
            referencedColumns: ["id"]
          },
        ]
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
          | 'version'
        > & {
          id?: string
          jobber_snapshot_refreshed_at?: string | null
          jobber_snapshot_change_status?: 'unknown' | 'unchanged' | 'changed'
          jobber_snapshot_change_summary?: Json
          jobber_snapshot_refresh_error?: string | null
          created_at?: string
          updated_at?: string
          version?: number
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
          area_scope_snapshot: 'interior' | 'exterior' | 'roof' | null
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
          area_scope_snapshot: 'interior' | 'exterior' | 'roof' | null
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
    Functions: {
      create_quote_with_children: {
        Args: { payload: Json }
        Returns: string
      }
      update_quote_with_children: {
        Args: { payload: Json }
        Returns: Array<{ id: string; version: number }>
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
