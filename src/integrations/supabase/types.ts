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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_agent_audits: {
        Row: {
          action_taken: string | null
          action_type: string
          ai_analysis: Json | null
          auto_fixed: boolean | null
          created_at: string
          created_by: string
          file_path: string | null
          id: string
          issue_description: string
          session_id: string | null
          severity: string
          success: boolean | null
          terminal_id: string | null
          verification_status: string | null
        }
        Insert: {
          action_taken?: string | null
          action_type: string
          ai_analysis?: Json | null
          auto_fixed?: boolean | null
          created_at?: string
          created_by?: string
          file_path?: string | null
          id?: string
          issue_description: string
          session_id?: string | null
          severity: string
          success?: boolean | null
          terminal_id?: string | null
          verification_status?: string | null
        }
        Update: {
          action_taken?: string | null
          action_type?: string
          ai_analysis?: Json | null
          auto_fixed?: boolean | null
          created_at?: string
          created_by?: string
          file_path?: string | null
          id?: string
          issue_description?: string
          session_id?: string | null
          severity?: string
          success?: boolean | null
          terminal_id?: string | null
          verification_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_audits_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_audits_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_insights: {
        Row: {
          assigned_to: string | null
          auto_fixable: boolean | null
          created_at: string
          estimated_effort: string | null
          file_path: string | null
          function_name: string | null
          github_issue_url: string | null
          id: string
          impact: Json | null
          insight_type: string
          issue_description: string
          line_number: number | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          suggested_solution: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          auto_fixable?: boolean | null
          created_at?: string
          estimated_effort?: string | null
          file_path?: string | null
          function_name?: string | null
          github_issue_url?: string | null
          id?: string
          impact?: Json | null
          insight_type: string
          issue_description: string
          line_number?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string
          suggested_solution: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          auto_fixable?: boolean | null
          created_at?: string
          estimated_effort?: string | null
          file_path?: string | null
          function_name?: string | null
          github_issue_url?: string | null
          id?: string
          impact?: Json | null
          insight_type?: string
          issue_description?: string
          line_number?: number | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          suggested_solution?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_name: string
          event_properties: Json | null
          id: string
          occurred_at: string
          session_id: string | null
          terminal_id: string
        }
        Insert: {
          created_at?: string
          event_name: string
          event_properties?: Json | null
          id?: string
          occurred_at?: string
          session_id?: string | null
          terminal_id: string
        }
        Update: {
          created_at?: string
          event_name?: string
          event_properties?: Json | null
          id?: string
          occurred_at?: string
          session_id?: string | null
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          api_key: string
          app_version: string | null
          client_id: string
          created_at: string | null
          hostname: string | null
          id: string
          last_heartbeat: string | null
          last_seen: string | null
          metadata: Json | null
          platform: string | null
          status: string | null
        }
        Insert: {
          api_key: string
          app_version?: string | null
          client_id: string
          created_at?: string | null
          hostname?: string | null
          id?: string
          last_heartbeat?: string | null
          last_seen?: string | null
          metadata?: Json | null
          platform?: string | null
          status?: string | null
        }
        Update: {
          api_key?: string
          app_version?: string | null
          client_id?: string
          created_at?: string | null
          hostname?: string | null
          id?: string
          last_heartbeat?: string | null
          last_seen?: string | null
          metadata?: Json | null
          platform?: string | null
          status?: string | null
        }
        Relationships: []
      }
      device_logs: {
        Row: {
          created_at: string
          device_type: Database["public"]["Enums"]["device_type"]
          event_data: Json | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          logged_at: string
          session_id: string | null
          severity: Database["public"]["Enums"]["severity_level"]
          terminal_id: string
        }
        Insert: {
          created_at?: string
          device_type: Database["public"]["Enums"]["device_type"]
          event_data?: Json | null
          event_type: Database["public"]["Enums"]["event_type"]
          id?: string
          logged_at?: string
          session_id?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          terminal_id: string
        }
        Update: {
          created_at?: string
          device_type?: Database["public"]["Enums"]["device_type"]
          event_data?: Json | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          logged_at?: string
          session_id?: string | null
          severity?: Database["public"]["Enums"]["severity_level"]
          terminal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_logs_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      diagnostics_results: {
        Row: {
          created_at: string
          dtc_cleared: boolean
          dtc_cleared_at: string | null
          dtc_codes: string[] | null
          dtc_descriptions: Json | null
          freeze_frame: Json | null
          id: string
          mil_status: boolean
          readiness_monitors: Json | null
          scanned_at: string
          session_id: string
          updated_at: string
          vehicle_info: Json | null
        }
        Insert: {
          created_at?: string
          dtc_cleared?: boolean
          dtc_cleared_at?: string | null
          dtc_codes?: string[] | null
          dtc_descriptions?: Json | null
          freeze_frame?: Json | null
          id?: string
          mil_status?: boolean
          readiness_monitors?: Json | null
          scanned_at?: string
          session_id: string
          updated_at?: string
          vehicle_info?: Json | null
        }
        Update: {
          created_at?: string
          dtc_cleared?: boolean
          dtc_cleared_at?: string | null
          dtc_codes?: string[] | null
          dtc_descriptions?: Json | null
          freeze_frame?: Json | null
          id?: string
          mil_status?: boolean
          readiness_monitors?: Json | null
          scanned_at?: string
          session_id?: string
          updated_at?: string
          vehicle_info?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "diagnostics_results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      health_check: {
        Row: {
          created_at: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          payment_intent_id: string | null
          qr_text: string | null
          qr_url: string | null
          session_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          payment_intent_id?: string | null
          qr_text?: string | null
          qr_url?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          payment_intent_id?: string | null
          qr_text?: string | null
          qr_url?: string | null
          session_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          delivery_attempts: number | null
          delivery_channel:
            | Database["public"]["Enums"]["delivery_channel"]
            | null
          delivery_status: Database["public"]["Enums"]["delivery_status"] | null
          file_url: string | null
          format: Database["public"]["Enums"]["report_format"] | null
          generated_at: string | null
          id: string
          last_delivery_attempt: string | null
          last_retry_at: string | null
          report_type: Database["public"]["Enums"]["service_type"] | null
          retry_count: number | null
          session_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          delivery_attempts?: number | null
          delivery_channel?:
            | Database["public"]["Enums"]["delivery_channel"]
            | null
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          file_url?: string | null
          format?: Database["public"]["Enums"]["report_format"] | null
          generated_at?: string | null
          id?: string
          last_delivery_attempt?: string | null
          last_retry_at?: string | null
          report_type?: Database["public"]["Enums"]["service_type"] | null
          retry_count?: number | null
          session_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          delivery_attempts?: number | null
          delivery_channel?:
            | Database["public"]["Enums"]["delivery_channel"]
            | null
          delivery_status?:
            | Database["public"]["Enums"]["delivery_status"]
            | null
          file_url?: string | null
          format?: Database["public"]["Enums"]["report_format"] | null
          generated_at?: string | null
          id?: string
          last_delivery_attempt?: string | null
          last_retry_at?: string | null
          report_type?: Database["public"]["Enums"]["service_type"] | null
          retry_count?: number | null
          session_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          client_contact_type: string | null
          client_contact_value: string | null
          completed_at: string | null
          created_at: string
          diagnostics_mode: string | null
          finished_at: string | null
          id: string
          metadata: Json | null
          payment_intent_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          price_rub: number | null
          service_type: Database["public"]["Enums"]["service_type"] | null
          session_code: string | null
          started_at: string
          status: Database["public"]["Enums"]["session_status"]
          terminal_id: string | null
          updated_at: string
          vehicle_brand: string | null
          vehicle_type: string | null
        }
        Insert: {
          client_contact_type?: string | null
          client_contact_value?: string | null
          completed_at?: string | null
          created_at?: string
          diagnostics_mode?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          price_rub?: number | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          session_code?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          terminal_id?: string | null
          updated_at?: string
          vehicle_brand?: string | null
          vehicle_type?: string | null
        }
        Update: {
          client_contact_type?: string | null
          client_contact_value?: string | null
          completed_at?: string | null
          created_at?: string
          diagnostics_mode?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          payment_intent_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          price_rub?: number | null
          service_type?: Database["public"]["Enums"]["service_type"] | null
          session_code?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          terminal_id?: string | null
          updated_at?: string
          vehicle_brand?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      system_health_snapshots: {
        Row: {
          ai_recommendations: Json | null
          cpu_usage_percent: number | null
          created_at: string
          disk_free_gb: number | null
          health_score: number | null
          id: string
          lock_mechanism_status: string | null
          memory_usage_percent: number | null
          network_latency_ms: number | null
          network_stable: boolean | null
          obd_adapter_status: string | null
          predicted_issues: Json | null
          snapshot_at: string
          supabase_available: boolean | null
          supabase_latency_ms: number | null
          terminal_id: string
          thickness_gauge_status: string | null
        }
        Insert: {
          ai_recommendations?: Json | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          health_score?: number | null
          id?: string
          lock_mechanism_status?: string | null
          memory_usage_percent?: number | null
          network_latency_ms?: number | null
          network_stable?: boolean | null
          obd_adapter_status?: string | null
          predicted_issues?: Json | null
          snapshot_at?: string
          supabase_available?: boolean | null
          supabase_latency_ms?: number | null
          terminal_id: string
          thickness_gauge_status?: string | null
        }
        Update: {
          ai_recommendations?: Json | null
          cpu_usage_percent?: number | null
          created_at?: string
          disk_free_gb?: number | null
          health_score?: number | null
          id?: string
          lock_mechanism_status?: string | null
          memory_usage_percent?: number | null
          network_latency_ms?: number | null
          network_stable?: boolean | null
          obd_adapter_status?: string | null
          predicted_issues?: Json | null
          snapshot_at?: string
          supabase_available?: boolean | null
          supabase_latency_ms?: number | null
          terminal_id?: string
          thickness_gauge_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_health_snapshots_terminal_id_fkey"
            columns: ["terminal_id"]
            isOneToOne: false
            referencedRelation: "terminals"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_logs: {
        Row: {
          client_id: string | null
          context: Json | null
          created_at: string | null
          id: string
          log_level: string
          message: string
        }
        Insert: {
          client_id?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          log_level: string
          message: string
        }
        Update: {
          client_id?: string | null
          context?: Json | null
          created_at?: string | null
          id?: string
          log_level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      terminals: {
        Row: {
          config: Json | null
          created_at: string
          id: string
          location: string
          status: Database["public"]["Enums"]["terminal_status"]
          terminal_code: string
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          id?: string
          location: string
          status?: Database["public"]["Enums"]["terminal_status"]
          terminal_code: string
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          id?: string
          location?: string
          status?: Database["public"]["Enums"]["terminal_status"]
          terminal_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      thickness_measurements: {
        Row: {
          created_at: string
          id: string
          measured_at: string
          session_id: string
          status: Database["public"]["Enums"]["measurement_status"]
          thickness_microns: number
          zone_index: number
          zone_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          measured_at?: string
          session_id: string
          status?: Database["public"]["Enums"]["measurement_status"]
          thickness_microns: number
          zone_index: number
          zone_name: string
        }
        Update: {
          created_at?: string
          id?: string
          measured_at?: string
          session_id?: string
          status?: Database["public"]["Enums"]["measurement_status"]
          thickness_microns?: number
          zone_index?: number
          zone_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "thickness_measurements_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      update_deployments: {
        Row: {
          client_id: string | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          started_at: string | null
          status: string | null
          update_id: string | null
        }
        Insert: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          update_id?: string | null
        }
        Update: {
          client_id?: string | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          update_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "update_deployments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "update_deployments_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "updates"
            referencedColumns: ["id"]
          },
        ]
      }
      updates: {
        Row: {
          changelog: string | null
          checksum: string
          created_at: string | null
          description: string | null
          file_path: string
          file_size: number
          id: string
          is_mandatory: boolean | null
          published_at: string | null
          target_clients: Json | null
          version: string
        }
        Insert: {
          changelog?: string | null
          checksum: string
          created_at?: string | null
          description?: string | null
          file_path: string
          file_size: number
          id?: string
          is_mandatory?: boolean | null
          published_at?: string | null
          target_clients?: Json | null
          version: string
        }
        Update: {
          changelog?: string | null
          checksum?: string
          created_at?: string | null
          description?: string | null
          file_path?: string
          file_size?: number
          id?: string
          is_mandatory?: boolean | null
          published_at?: string | null
          target_clients?: Json | null
          version?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_ai_agent_stats: {
        Args: { p_time_range_hours?: number }
        Returns: Json
      }
      get_open_insights: {
        Args: { p_insight_type?: string; p_severity?: string }
        Returns: {
          auto_fixable: boolean
          created_at: string
          id: string
          insight_type: string
          issue_description: string
          severity: string
          suggested_solution: string
        }[]
      }
      get_public_session_data: {
        Args: { p_session_code: string }
        Returns: Json
      }
      get_session_summary: {
        Args: { p_session_code: string }
        Returns: Json
      }
      get_terminal_health: {
        Args: { p_terminal_id: string }
        Returns: Json
      }
      get_terminal_statistics: {
        Args: { p_date_from: string; p_date_to: string; p_terminal_id: string }
        Returns: Json
      }
    }
    Enums: {
      delivery_channel: "email" | "sms" | "whatsapp"
      delivery_status: "pending" | "sent" | "failed"
      device_type:
        | "thickness_gauge"
        | "obd_adapter"
        | "lock_mechanism"
        | "payment_terminal"
      event_type:
        | "connected"
        | "disconnected"
        | "error"
        | "measurement"
        | "command_sent"
        | "response_received"
      measurement_status: "normal" | "warning" | "critical"
      payment_status: "pending" | "confirmed" | "failed" | "refunded"
      report_format: "pdf" | "html" | "json"
      service_type: "thickness" | "diagnostics"
      session_status:
        | "started"
        | "measuring"
        | "payment_pending"
        | "payment_confirmed"
        | "completed"
        | "cancelled"
        | "error"
      severity_level: "info" | "warning" | "error" | "critical"
      terminal_status: "active" | "maintenance" | "offline"
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
      delivery_channel: ["email", "sms", "whatsapp"],
      delivery_status: ["pending", "sent", "failed"],
      device_type: [
        "thickness_gauge",
        "obd_adapter",
        "lock_mechanism",
        "payment_terminal",
      ],
      event_type: [
        "connected",
        "disconnected",
        "error",
        "measurement",
        "command_sent",
        "response_received",
      ],
      measurement_status: ["normal", "warning", "critical"],
      payment_status: ["pending", "confirmed", "failed", "refunded"],
      report_format: ["pdf", "html", "json"],
      service_type: ["thickness", "diagnostics"],
      session_status: [
        "started",
        "measuring",
        "payment_pending",
        "payment_confirmed",
        "completed",
        "cancelled",
        "error",
      ],
      severity_level: ["info", "warning", "error", "critical"],
      terminal_status: ["active", "maintenance", "offline"],
    },
  },
} as const
