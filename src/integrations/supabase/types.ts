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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          created_at: string
          id: number
          kind: string
          message: string
          team_name: string
        }
        Insert: {
          created_at?: string
          id?: never
          kind: string
          message: string
          team_name: string
        }
        Update: {
          created_at?: string
          id?: never
          kind?: string
          message?: string
          team_name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      pi_workers: {
        Row: { pi_id: string; last_seen: string }
        Insert: { pi_id: string; last_seen?: string }
        Update: { pi_id?: string; last_seen?: string }
        Relationships: []
      }
      settings: {
        Row: {
          frozen_at: string | null
          id: number
          leaderboard_frozen: boolean
          leaderboard_visible: boolean
          latency_ref_ms: number
          ram_ref_mb: number
          submission_deadline: string | null
          updated_at: string
          weight_accuracy: number
          weight_latency: number
          weight_ram: number
        }
        Insert: {
          frozen_at?: string | null
          id?: number
          leaderboard_frozen?: boolean
          leaderboard_visible?: boolean
          latency_ref_ms?: number
          ram_ref_mb?: number
          submission_deadline?: string | null
          updated_at?: string
          weight_accuracy?: number
          weight_latency?: number
          weight_ram?: number
        }
        Update: {
          frozen_at?: string | null
          id?: number
          leaderboard_frozen?: boolean
          leaderboard_visible?: boolean
          latency_ref_ms?: number
          ram_ref_mb?: number
          submission_deadline?: string | null
          updated_at?: string
          weight_accuracy?: number
          weight_latency?: number
          weight_ram?: number
        }
        Relationships: []
      }
      submissions: {
        Row: {
          accuracy: number | null
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          error_log: string | null
          file_deleted: boolean
          file_path: string | null
          id: string
          last_heartbeat: string | null
          latency_ms: number | null
          model_size_mb: number | null
          original_filename: string | null
          peak_ram_mb: number | null
          pi_id: string | null
          status: string
          submitted_by: string | null
          team_id: string
        }
        Insert: {
          accuracy?: number | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          file_deleted?: boolean
          file_path?: string | null
          id?: string
          last_heartbeat?: string | null
          latency_ms?: number | null
          model_size_mb?: number | null
          original_filename?: string | null
          peak_ram_mb?: number | null
          pi_id?: string | null
          status?: string
          submitted_by?: string | null
          team_id: string
        }
        Update: {
          accuracy?: number | null
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          error_log?: string | null
          file_deleted?: boolean
          file_path?: string | null
          id?: string
          last_heartbeat?: string | null
          latency_ms?: number | null
          model_size_mb?: number | null
          original_filename?: string | null
          peak_ram_mb?: number | null
          pi_id?: string | null
          status?: string
          submitted_by?: string | null
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          joined_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          joined_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          joined_at?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          join_code: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          join_code?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          join_code?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_submission_action: {
        Args: { _action: string; _id: string; _note?: string }
        Returns: undefined
      }
      create_team: { Args: { _name: string }; Returns: string }
      get_leaderboard: {
        Args: never
        Returns: {
          accuracy: number
          completed_at: string
          latency_ms: number
          model_size_mb: number
          peak_ram_mb: number
          score: number
          team_id: string
          team_name: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      join_team: { Args: { _code: string }; Returns: string }
      my_team_id: { Args: never; Returns: string }
      team_slots: { Args: never; Returns: Json }
      worker_seen: { Args: { _pi_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    },
  },
} as const
