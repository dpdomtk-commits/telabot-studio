export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      bots: {
        Row: {
          created_at: string
          id: string
          name: string
          status: Database["public"]["Enums"]["bot_status"]
          telegram_bot_id: number | null
          telegram_username: string | null
          token: string
          updated_at: string
          user_id: string
          webhook_secret: string
          webhook_set_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["bot_status"]
          telegram_bot_id?: number | null
          telegram_username?: string | null
          token: string
          updated_at?: string
          user_id: string
          webhook_secret?: string
          webhook_set_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["bot_status"]
          telegram_bot_id?: number | null
          telegram_username?: string | null
          token?: string
          updated_at?: string
          user_id?: string
          webhook_secret?: string
          webhook_set_at?: string | null
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          error: string | null
          flow_step_id: string | null
          id: string
          payment_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          flow_step_id?: string | null
          id?: string
          payment_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          flow_step_id?: string | null
          id?: string
          payment_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_flow_step_id_fkey"
            columns: ["flow_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_settings: {
        Row: {
          charge_fixed_fee_cents: number
          charge_percent_fee: number
          created_at: string
          id: boolean
          min_withdrawal_cents: number
          pix_receiver_city: string
          pix_receiver_key: string | null
          pix_receiver_name: string
          provider: string
          updated_at: string
          withdrawal_fee_cents: number
        }
        Insert: {
          charge_fixed_fee_cents?: number
          charge_percent_fee?: number
          created_at?: string
          id?: boolean
          min_withdrawal_cents?: number
          pix_receiver_city?: string
          pix_receiver_key?: string | null
          pix_receiver_name?: string
          provider?: string
          updated_at?: string
          withdrawal_fee_cents?: number
        }
        Update: {
          charge_fixed_fee_cents?: number
          charge_percent_fee?: number
          created_at?: string
          id?: boolean
          min_withdrawal_cents?: number
          pix_receiver_city?: string
          pix_receiver_key?: string | null
          pix_receiver_name?: string
          provider?: string
          updated_at?: string
          withdrawal_fee_cents?: number
        }
        Relationships: []
      }
      flow_steps: {
        Row: {
          config: Json
          created_at: string
          flow_id: string
          id: string
          position: number
          type: Database["public"]["Enums"]["step_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          flow_id: string
          id?: string
          position?: number
          type: Database["public"]["Enums"]["step_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          flow_id?: string
          id?: string
          position?: number
          type?: Database["public"]["Enums"]["step_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_steps_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
        ]
      }
      flows: {
        Row: {
          bot_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flows_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          bot_id: string | null
          created_at: string
          id: string
          name: string | null
          status: Database["public"]["Enums"]["lead_status"]
          telegram_id: number | null
          telegram_username: string | null
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telegram_id?: number | null
          telegram_username?: string | null
          user_id: string
        }
        Update: {
          bot_id?: string | null
          created_at?: string
          id?: string
          name?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          telegram_id?: number | null
          telegram_username?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          amount_cents: number
          created_at: string
          description: string | null
          fee_cents: number
          id: string
          ip_address: string | null
          metadata: Json
          net_cents: number
          payment_id: string | null
          status: Database["public"]["Enums"]["ledger_status"]
          type: Database["public"]["Enums"]["ledger_type"]
          user_id: string
          withdrawal_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          description?: string | null
          fee_cents?: number
          id?: string
          ip_address?: string | null
          metadata?: Json
          net_cents: number
          payment_id?: string | null
          status?: Database["public"]["Enums"]["ledger_status"]
          type: Database["public"]["Enums"]["ledger_type"]
          user_id: string
          withdrawal_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          description?: string | null
          fee_cents?: number
          id?: string
          ip_address?: string | null
          metadata?: Json
          net_cents?: number
          payment_id?: string | null
          status?: Database["public"]["Enums"]["ledger_status"]
          type?: Database["public"]["Enums"]["ledger_type"]
          user_id?: string
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          read_at?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_cents: number
          bot_id: string | null
          created_at: string
          credited_at: string | null
          currency: string
          description: string | null
          expires_at: string | null
          external_id: string | null
          fee_cents: number
          id: string
          idempotency_key: string | null
          lead_id: string | null
          method: string
          net_cents: number
          paid_at: string | null
          pix_code: string | null
          product_name: string | null
          provider: string
          status: Database["public"]["Enums"]["payment_status"]
          success_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          bot_id?: string | null
          created_at?: string
          credited_at?: string | null
          currency?: string
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          fee_cents?: number
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          method?: string
          net_cents?: number
          paid_at?: string | null
          pix_code?: string | null
          product_name?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["payment_status"]
          success_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          bot_id?: string | null
          created_at?: string
          credited_at?: string | null
          currency?: string
          description?: string | null
          expires_at?: string | null
          external_id?: string | null
          fee_cents?: number
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          method?: string
          net_cents?: number
          paid_at?: string | null
          pix_code?: string | null
          product_name?: string | null
          provider?: string
          status?: Database["public"]["Enums"]["payment_status"]
          success_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_blocked: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_blocked?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_blocked?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          available_cents: number
          blocked_cents: number
          created_at: string
          id: string
          pending_cents: number
          total_fees_cents: number
          total_received_cents: number
          total_withdrawn_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_cents?: number
          blocked_cents?: number
          created_at?: string
          id?: string
          pending_cents?: number
          total_fees_cents?: number
          total_received_cents?: number
          total_withdrawn_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          available_cents?: number
          blocked_cents?: number
          created_at?: string
          id?: string
          pending_cents?: number
          total_fees_cents?: number
          total_received_cents?: number
          total_withdrawn_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          amount_cents: number
          created_at: string
          fee_cents: number
          id: string
          ip_address: string | null
          net_cents: number
          pix_key: string
          pix_key_type: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          fee_cents?: number
          id?: string
          ip_address?: string | null
          net_cents: number
          pix_key: string
          pix_key_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          fee_cents?: number
          id?: string
          ip_address?: string | null
          net_cents?: number
          pix_key?: string
          pix_key_type?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      adjust_wallet: {
        Args: {
          _amount_cents: number
          _description: string
          _reviewer: string
          _user_id: string
        }
        Returns: Json
      }
      credit_payment: {
        Args: { _ip?: string; _payment_id: string }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      request_withdrawal: {
        Args: {
          _amount_cents: number
          _ip?: string
          _pix_key: string
          _pix_key_type: string
          _user_id: string
        }
        Returns: Json
      }
      resolve_withdrawal: {
        Args: {
          _reason?: string
          _reviewer: string
          _status: Database["public"]["Enums"]["withdrawal_status"]
          _withdrawal_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "user"
      bot_status: "active" | "inactive"
      delivery_status: "pending" | "delivered" | "failed"
      lead_status: "new" | "engaged" | "converted"
      ledger_status: "pending" | "completed" | "reversed"
      ledger_type:
        | "payment_in"
        | "fee"
        | "withdrawal"
        | "withdrawal_fee"
        | "adjustment"
        | "refund"
      payment_status:
        | "pending"
        | "approved"
        | "failed"
        | "refunded"
        | "expired"
        | "cancelled"
      step_type:
        | "message"
        | "image"
        | "button"
        | "delay"
        | "payment"
        | "delivery"
      withdrawal_status: "review" | "approved" | "paid" | "rejected"
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
  public: {
    Enums: {
      app_role: ["admin", "user"],
      bot_status: ["active", "inactive"],
      delivery_status: ["pending", "delivered", "failed"],
      lead_status: ["new", "engaged", "converted"],
      ledger_status: ["pending", "completed", "reversed"],
      ledger_type: [
        "payment_in",
        "fee",
        "withdrawal",
        "withdrawal_fee",
        "adjustment",
        "refund",
      ],
      payment_status: [
        "pending",
        "approved",
        "failed",
        "refunded",
        "expired",
        "cancelled",
      ],
      step_type: ["message", "image", "button", "delay", "payment", "delivery"],
      withdrawal_status: ["review", "approved", "paid", "rejected"],
    },
  },
} as const
