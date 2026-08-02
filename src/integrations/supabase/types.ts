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
      flow_connections: {
        Row: {
          created_at: string
          flow_id: string
          id: string
          label: string | null
          source_handle: string | null
          source_step_id: string
          target_step_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_step_id: string
          target_step_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          id?: string
          label?: string | null
          source_handle?: string | null
          source_step_id?: string
          target_step_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_connections_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_connections_source_step_id_fkey"
            columns: ["source_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_connections_target_step_id_fkey"
            columns: ["target_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_executions: {
        Row: {
          context: Json
          created_at: string
          current_step_id: string | null
          finished_at: string | null
          flow_id: string
          id: string
          lead_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["execution_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          current_step_id?: string | null
          finished_at?: string | null
          flow_id: string
          id?: string
          lead_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["execution_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          current_step_id?: string | null
          finished_at?: string | null
          flow_id?: string
          id?: string
          lead_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["execution_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_executions_current_step_id_fkey"
            columns: ["current_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_executions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_logs: {
        Row: {
          created_at: string
          execution_id: string | null
          flow_id: string | null
          id: string
          level: string
          message: string
          metadata: Json
          step_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          execution_id?: string | null
          flow_id?: string | null
          id?: string
          level?: string
          message: string
          metadata?: Json
          step_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          execution_id?: string | null
          flow_id?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json
          step_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_logs_execution_id_fkey"
            columns: ["execution_id"]
            isOneToOne: false
            referencedRelation: "flow_executions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_logs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_logs_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_steps: {
        Row: {
          config: Json
          created_at: string
          flow_id: string
          id: string
          position: number
          position_x: number
          position_y: number
          title: string | null
          type: Database["public"]["Enums"]["flow_node_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          flow_id: string
          id?: string
          position?: number
          position_x?: number
          position_y?: number
          title?: string | null
          type: Database["public"]["Enums"]["flow_node_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          flow_id?: string
          id?: string
          position?: number
          position_x?: number
          position_y?: number
          title?: string | null
          type?: Database["public"]["Enums"]["flow_node_type"]
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
          description: string | null
          gateway_id: string | null
          id: string
          is_active: boolean
          name: string
          status: Database["public"]["Enums"]["flow_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          description?: string | null
          gateway_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          status?: Database["public"]["Enums"]["flow_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          description?: string | null
          gateway_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          status?: Database["public"]["Enums"]["flow_status"]
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
          {
            foreignKeyName: "flows_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_attempts: {
        Row: {
          amount_cents: number
          created_at: string
          error: string | null
          gateway_id: string | null
          id: string
          latency_ms: number | null
          payment_id: string | null
          provider: Database["public"]["Enums"]["gateway_provider"]
          success: boolean
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          error?: string | null
          gateway_id?: string | null
          id?: string
          latency_ms?: number | null
          payment_id?: string | null
          provider?: Database["public"]["Enums"]["gateway_provider"]
          success?: boolean
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          error?: string | null
          gateway_id?: string | null
          id?: string
          latency_ms?: number | null
          payment_id?: string | null
          provider?: Database["public"]["Enums"]["gateway_provider"]
          success?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_attempts_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_splits: {
        Row: {
          created_at: string
          gateway_id: string
          id: string
          percent: number
          recipient_label: string
          recipient_user_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          gateway_id: string
          id?: string
          percent?: number
          recipient_label: string
          recipient_user_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          gateway_id?: string
          id?: string
          percent?: number
          recipient_label?: string
          recipient_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_splits_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
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
      media_assets: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: Database["public"]["Enums"]["media_kind"]
          id: string
          message_id: number | null
          mime_type: string | null
          telegram_file_id: string
          telegram_file_unique_id: string | null
          thumbnail: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number
          file_type: Database["public"]["Enums"]["media_kind"]
          id?: string
          message_id?: number | null
          mime_type?: string | null
          telegram_file_id: string
          telegram_file_unique_id?: string | null
          thumbnail?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: Database["public"]["Enums"]["media_kind"]
          id?: string
          message_id?: number | null
          mime_type?: string | null
          telegram_file_id?: string
          telegram_file_unique_id?: string | null
          thumbnail?: string | null
          user_id?: string
        }
        Relationships: []
      }
      media_cache_settings: {
        Row: {
          bot_id: string | null
          chat_id: string | null
          chat_title: string | null
          chat_type: Database["public"]["Enums"]["media_chat_type"]
          created_at: string
          last_checked_at: string | null
          last_error: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bot_id?: string | null
          chat_id?: string | null
          chat_title?: string | null
          chat_type?: Database["public"]["Enums"]["media_chat_type"]
          created_at?: string
          last_checked_at?: string | null
          last_error?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bot_id?: string | null
          chat_id?: string | null
          chat_title?: string | null
          chat_type?: Database["public"]["Enums"]["media_chat_type"]
          created_at?: string
          last_checked_at?: string | null
          last_error?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_cache_settings_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
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
      payment_gateways: {
        Row: {
          allow_fallback: boolean
          created_at: string
          credentials: Json
          id: string
          is_active: boolean
          max_amount_cents: number | null
          min_amount_cents: number
          name: string
          pix_key: string | null
          priority: number
          provider: Database["public"]["Enums"]["gateway_provider"]
          receiver_city: string
          receiver_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_fallback?: boolean
          created_at?: string
          credentials?: Json
          id?: string
          is_active?: boolean
          max_amount_cents?: number | null
          min_amount_cents?: number
          name: string
          pix_key?: string | null
          priority?: number
          provider?: Database["public"]["Enums"]["gateway_provider"]
          receiver_city?: string
          receiver_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_fallback?: boolean
          created_at?: string
          credentials?: Json
          id?: string
          is_active?: boolean
          max_amount_cents?: number | null
          min_amount_cents?: number
          name?: string
          pix_key?: string | null
          priority?: number
          provider?: Database["public"]["Enums"]["gateway_provider"]
          receiver_city?: string
          receiver_name?: string
          updated_at?: string
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
          flow_id: string | null
          flow_step_id: string | null
          gateway_id: string | null
          id: string
          idempotency_key: string | null
          lead_id: string | null
          method: string
          net_cents: number
          paid_at: string | null
          pix_code: string | null
          product_name: string | null
          provider: string
          qr_code: string | null
          status: Database["public"]["Enums"]["payment_status"]
          subscription_id: string | null
          success_message: string | null
          transaction_reference: string
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
          flow_id?: string | null
          flow_step_id?: string | null
          gateway_id?: string | null
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          method?: string
          net_cents?: number
          paid_at?: string | null
          pix_code?: string | null
          product_name?: string | null
          provider?: string
          qr_code?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          success_message?: string | null
          transaction_reference?: string
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
          flow_id?: string | null
          flow_step_id?: string | null
          gateway_id?: string | null
          id?: string
          idempotency_key?: string | null
          lead_id?: string | null
          method?: string
          net_cents?: number
          paid_at?: string | null
          pix_code?: string | null
          product_name?: string | null
          provider?: string
          qr_code?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          subscription_id?: string | null
          success_message?: string | null
          transaction_reference?: string
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
            foreignKeyName: "payments_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_flow_step_id_fkey"
            columns: ["flow_step_id"]
            isOneToOne: false
            referencedRelation: "flow_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
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
      subscriptions: {
        Row: {
          amount_cents: number
          bot_id: string | null
          cancelled_at: string | null
          created_at: string
          flow_id: string | null
          id: string
          interval_days: number
          lead_id: string | null
          next_charge_at: string | null
          plan_name: string
          started_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          bot_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          flow_id?: string | null
          id?: string
          interval_days?: number
          lead_id?: string | null
          next_charge_at?: string | null
          plan_name: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          bot_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          flow_id?: string | null
          id?: string
          interval_days?: number
          lead_id?: string | null
          next_charge_at?: string | null
          plan_name?: string
          started_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
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
      generate_transaction_reference: { Args: never; Returns: string }
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
      execution_status:
        | "running"
        | "waiting_payment"
        | "completed"
        | "failed"
        | "cancelled"
      flow_node_type:
        | "start"
        | "message"
        | "image"
        | "video"
        | "audio"
        | "document"
        | "button"
        | "menu"
        | "question"
        | "condition"
        | "delay"
        | "tag"
        | "untag"
        | "webhook"
        | "api"
        | "pix"
        | "payment"
        | "subscription"
        | "upsell"
        | "downsell"
        | "order_bump"
        | "pack"
        | "release_channel"
        | "release_group"
        | "delivery"
        | "end"
      flow_status: "draft" | "active" | "archived"
      gateway_provider:
        | "internal"
        | "mercadopago"
        | "asaas"
        | "efi"
        | "pushinpay"
        | "openpix"
        | "pagarme"
        | "custom"
      lead_status: "new" | "engaged" | "converted"
      ledger_status: "pending" | "completed" | "reversed"
      ledger_type:
        | "payment_in"
        | "fee"
        | "withdrawal"
        | "withdrawal_fee"
        | "adjustment"
        | "refund"
      media_chat_type: "channel" | "group"
      media_kind: "image" | "video" | "audio" | "document"
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
      subscription_status: "active" | "past_due" | "cancelled" | "expired"
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
      execution_status: [
        "running",
        "waiting_payment",
        "completed",
        "failed",
        "cancelled",
      ],
      flow_node_type: [
        "start",
        "message",
        "image",
        "video",
        "audio",
        "document",
        "button",
        "menu",
        "question",
        "condition",
        "delay",
        "tag",
        "untag",
        "webhook",
        "api",
        "pix",
        "payment",
        "subscription",
        "upsell",
        "downsell",
        "order_bump",
        "pack",
        "release_channel",
        "release_group",
        "delivery",
        "end",
      ],
      flow_status: ["draft", "active", "archived"],
      gateway_provider: [
        "internal",
        "mercadopago",
        "asaas",
        "efi",
        "pushinpay",
        "openpix",
        "pagarme",
        "custom",
      ],
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
      media_chat_type: ["channel", "group"],
      media_kind: ["image", "video", "audio", "document"],
      payment_status: [
        "pending",
        "approved",
        "failed",
        "refunded",
        "expired",
        "cancelled",
      ],
      step_type: ["message", "image", "button", "delay", "payment", "delivery"],
      subscription_status: ["active", "past_due", "cancelled", "expired"],
      withdrawal_status: ["review", "approved", "paid", "rejected"],
    },
  },
} as const
