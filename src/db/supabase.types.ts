// Generated from the Supabase project (fi-dashboard / lanvhaliejwuazqerbvp).
// Regenerate with: supabase gen types typescript --project-id lanvhaliejwuazqerbvp
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5'
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string
          created_at: string
          currency: string
          household_id: string
          id: string
          institution: string
          is_active: boolean
          is_protected: boolean
          lane: string
          last_balance_updated_at: string | null
          manual_balance_override: number | null
          name: string
          owner_member_id: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          created_at?: string
          currency?: string
          household_id: string
          id?: string
          institution: string
          is_active?: boolean
          is_protected?: boolean
          lane: string
          last_balance_updated_at?: string | null
          manual_balance_override?: number | null
          name: string
          owner_member_id?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['accounts']['Insert']>
        Relationships: []
      }
      allowances: {
        Row: {
          household_id: string
          member_id: string
          monthly_amount: number
          updated_at: string
          weekend_allocation: number
        }
        Insert: {
          household_id: string
          member_id: string
          monthly_amount: number
          updated_at?: string
          weekend_allocation?: number
        }
        Update: Partial<Database['public']['Tables']['allowances']['Insert']>
        Relationships: []
      }
      assets: {
        Row: {
          asset_type: string
          created_at: string
          household_id: string
          id: string
          lane: string
          last_valued_at: string
          name: string
          note: string | null
          price_per_gram: number | null
          quantity_grams: number | null
          updated_at: string
          value: number
        }
        Insert: {
          asset_type: string
          created_at?: string
          household_id: string
          id?: string
          lane: string
          last_valued_at: string
          name: string
          note?: string | null
          price_per_gram?: number | null
          quantity_grams?: number | null
          updated_at?: string
          value: number
        }
        Update: Partial<Database['public']['Tables']['assets']['Insert']>
        Relationships: []
      }
      assumptions: {
        Row: {
          equity_switch_month: number
          household_id: string
          inflation_rate: number
          lifestyle_ceiling_monthly: number | null
          return_dplk: number
          return_equity: number
          return_gold: number
          return_rdpu: number
          target_high: number
          target_low: number
          updated_at: string
        }
        Insert: {
          equity_switch_month?: number
          household_id: string
          inflation_rate?: number
          lifestyle_ceiling_monthly?: number | null
          return_dplk?: number
          return_equity?: number
          return_gold?: number
          return_rdpu?: number
          target_high?: number
          target_low?: number
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['assumptions']['Insert']>
        Relationships: []
      }
      categories: {
        Row: {
          envelope_id: string | null
          household_id: string
          id: string
          is_protected: boolean
          lane: string
          name: string
          updated_at: string
        }
        Insert: {
          envelope_id?: string | null
          household_id: string
          id?: string
          is_protected?: boolean
          lane: string
          name: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['categories']['Insert']>
        Relationships: []
      }
      envelopes: {
        Row: {
          created_at: string
          horizon: string
          household_id: string
          id: string
          name: string
          parent_envelope_id: string | null
          period: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          horizon: string
          household_id: string
          id?: string
          name: string
          parent_envelope_id?: string | null
          period: string
          target_amount: number
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['envelopes']['Insert']>
        Relationships: []
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          plan: string
          provider_customer_id: string | null
          subscription_status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          plan?: string
          provider_customer_id?: string | null
          subscription_status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['households']['Insert']>
        Relationships: []
      }
      income_events: {
        Row: {
          created_at: string
          date: string
          delta_vs_prev: number | null
          gross: number
          household_id: string
          id: string
          member_id: string | null
          note: string | null
          routed_to_lifestyle: number
          routed_to_pipe: number
          source: string
          take_home_net: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          delta_vs_prev?: number | null
          gross: number
          household_id: string
          id?: string
          member_id?: string | null
          note?: string | null
          routed_to_lifestyle: number
          routed_to_pipe: number
          source: string
          take_home_net: number
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['income_events']['Insert']>
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string
          email: string | null
          expires_at: string
          household_id: string
          id: string
          invited_by: string
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          email?: string | null
          expires_at: string
          household_id: string
          id?: string
          invited_by: string
          status?: string
        }
        Update: Partial<Database['public']['Tables']['invites']['Insert']>
        Relationships: []
      }
      memberships: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: Partial<Database['public']['Tables']['memberships']['Insert']>
        Relationships: []
      }
      milestones: {
        Row: {
          created_at: string
          description: string | null
          flag_date: string | null
          household_id: string
          id: string
          income_event_id: string | null
          source: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          flag_date?: string | null
          household_id: string
          id?: string
          income_event_id?: string | null
          source?: string | null
          status: string
          title: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['milestones']['Insert']>
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          by_lane: Json
          household_id: string
          id: string
          taken_at: string
          total: number
          updated_at: string
          year_month: string
        }
        Insert: {
          by_lane: Json
          household_id: string
          id?: string
          taken_at?: string
          total: number
          updated_at?: string
          year_month: string
        }
        Update: Partial<Database['public']['Tables']['net_worth_snapshots']['Insert']>
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      recurring_items: {
        Row: {
          amount: number
          cadence: string
          created_at: string
          end_date: string | null
          household_id: string
          id: string
          is_active: boolean
          is_protected: boolean
          kind: string
          lane: string
          name: string
          next_due: string
          note: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          cadence: string
          created_at?: string
          end_date?: string | null
          household_id: string
          id?: string
          is_active?: boolean
          is_protected?: boolean
          kind: string
          lane: string
          name: string
          next_due: string
          note?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['recurring_items']['Insert']>
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          created_at: string
          created_by: string | null
          date: string
          direction: string
          household_id: string
          id: string
          is_transfer: boolean
          lane: string
          note: string | null
          original_amount: number | null
          overridden_amount: number | null
          overridden_at: string | null
          override_note: string | null
          source: string
          transfer_pair_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          direction: string
          household_id: string
          id?: string
          is_transfer?: boolean
          lane: string
          note?: string | null
          original_amount?: number | null
          overridden_amount?: number | null
          overridden_at?: string | null
          override_note?: string | null
          source: string
          transfer_pair_id?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_invite: { Args: { p_code: string }; Returns: string }
      auth_household_ids: { Args: Record<string, never>; Returns: string[] }
      create_household: { Args: { p_name: string }; Returns: string }
      import_batch: {
        Args: {
          p_household_id: string
          p_rows: Json
          p_snapshot_by_lane: Json
          p_snapshot_total: number
          p_year_month: string
        }
        Returns: Json
      }
      is_household_admin: { Args: { hid: string }; Returns: boolean }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
