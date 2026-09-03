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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      appointment_types: {
        Row: {
          active: boolean
          bookable_online: boolean
          color: string
          created_at: string
          duration_minutes: number
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          bookable_online?: boolean
          color?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          bookable_online?: boolean
          color?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      appointments: {
        Row: {
          admin_notes: string
          created_at: string
          duration_minutes: number
          email: string
          enquiry_id: string | null
          enquiry_status: string
          full_name: string
          gender: string
          heard_about: string
          heard_about_other: string
          id: string
          intake: string
          mode: string
          nationality: string
          notes: string
          phone: string
          residence_id: string | null
          residence_name: string
          residence_slug: string
          source: string
          starts_at: string
          status: string
          type_slug: string
          university: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string
          created_at?: string
          duration_minutes?: number
          email?: string
          enquiry_id?: string | null
          enquiry_status?: string
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          intake?: string
          mode?: string
          nationality?: string
          notes?: string
          phone?: string
          residence_id?: string | null
          residence_name?: string
          residence_slug?: string
          source?: string
          starts_at: string
          status?: string
          type_slug?: string
          university?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string
          created_at?: string
          duration_minutes?: number
          email?: string
          enquiry_id?: string | null
          enquiry_status?: string
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          intake?: string
          mode?: string
          nationality?: string
          notes?: string
          phone?: string
          residence_id?: string | null
          residence_name?: string
          residence_slug?: string
          source?: string
          starts_at?: string
          status?: string
          type_slug?: string
          university?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_residence_id_fkey"
            columns: ["residence_id"]
            isOneToOne: false
            referencedRelation: "residences"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_rules: {
        Row: {
          active: boolean
          buffer_minutes: number
          capacity: number
          created_at: string
          end_time: string
          id: string
          mode: string
          residence_id: string | null
          slot_minutes: number
          start_time: string
          type_slug: string
          weekday: number
        }
        Insert: {
          active?: boolean
          buffer_minutes?: number
          capacity?: number
          created_at?: string
          end_time?: string
          id?: string
          mode?: string
          residence_id?: string | null
          slot_minutes?: number
          start_time?: string
          type_slug?: string
          weekday: number
        }
        Update: {
          active?: boolean
          buffer_minutes?: number
          capacity?: number
          created_at?: string
          end_time?: string
          id?: string
          mode?: string
          residence_id?: string | null
          slot_minutes?: number
          start_time?: string
          type_slug?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_residence_id_fkey"
            columns: ["residence_id"]
            isOneToOne: false
            referencedRelation: "residences"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_dates: {
        Row: {
          blocked_on: string
          created_at: string
          id: string
          reason: string
          residence_id: string | null
        }
        Insert: {
          blocked_on: string
          created_at?: string
          id?: string
          reason?: string
          residence_id?: string | null
        }
        Update: {
          blocked_on?: string
          created_at?: string
          id?: string
          reason?: string
          residence_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_dates_residence_id_fkey"
            columns: ["residence_id"]
            isOneToOne: false
            referencedRelation: "residences"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          addons: Json
          admin_notes: string
          created_at: string
          email: string
          first_payment: number
          full_name: string
          gender: string
          heard_about: string
          heard_about_other: string
          id: string
          intake: string
          message: string
          monthly_rent: number
          move_in: string | null
          move_out: string | null
          nationality: string
          occupancy: string
          payment_term: string
          phone: string
          quote_snapshot: Json
          reference: string
          residence_name: string
          residence_slug: string
          room_code: string
          room_name: string
          status: string
          term: string
          university: string
          updated_at: string
        }
        Insert: {
          addons?: Json
          admin_notes?: string
          created_at?: string
          email?: string
          first_payment?: number
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          intake?: string
          message?: string
          monthly_rent?: number
          move_in?: string | null
          move_out?: string | null
          nationality?: string
          occupancy?: string
          payment_term?: string
          phone?: string
          quote_snapshot?: Json
          reference?: string
          residence_name?: string
          residence_slug?: string
          room_code?: string
          room_name?: string
          status?: string
          term?: string
          university?: string
          updated_at?: string
        }
        Update: {
          addons?: Json
          admin_notes?: string
          created_at?: string
          email?: string
          first_payment?: number
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          intake?: string
          message?: string
          monthly_rent?: number
          move_in?: string | null
          move_out?: string | null
          nationality?: string
          occupancy?: string
          payment_term?: string
          phone?: string
          quote_snapshot?: Json
          reference?: string
          residence_name?: string
          residence_slug?: string
          room_code?: string
          room_name?: string
          status?: string
          term?: string
          university?: string
          updated_at?: string
        }
        Relationships: []
      }
      residences: {
        Row: {
          addons: Json
          apartment_footnote: string | null
          building_facilities: Json
          contract_terms: Json
          coords: Json
          created_at: string
          description: Json
          fee_config: Json
          gallery: Json
          hero_image: string
          icon_overrides: Json
          id: string
          included_in_stay: Json
          inside_apartment: Json
          location: string
          name: string
          nearby_universities: Json
          payment_cycle: string
          payment_terms: string[]
          points_of_interest: Json
          pricing: Json
          published: boolean
          single_bed_options: Json
          slug: string
          sort_order: number
          summary: string
          tagline: string
          terms: Json
          updated_at: string
          utilities_note: string
          waze_url: string
        }
        Insert: {
          addons?: Json
          apartment_footnote?: string | null
          building_facilities?: Json
          contract_terms?: Json
          coords?: Json
          created_at?: string
          description?: Json
          fee_config?: Json
          gallery?: Json
          hero_image?: string
          icon_overrides?: Json
          id?: string
          included_in_stay?: Json
          inside_apartment?: Json
          location?: string
          name: string
          nearby_universities?: Json
          payment_cycle?: string
          payment_terms?: string[]
          points_of_interest?: Json
          pricing?: Json
          published?: boolean
          single_bed_options?: Json
          slug: string
          sort_order?: number
          summary?: string
          tagline?: string
          terms?: Json
          updated_at?: string
          utilities_note?: string
          waze_url?: string
        }
        Update: {
          addons?: Json
          apartment_footnote?: string | null
          building_facilities?: Json
          contract_terms?: Json
          coords?: Json
          created_at?: string
          description?: Json
          fee_config?: Json
          gallery?: Json
          hero_image?: string
          icon_overrides?: Json
          id?: string
          included_in_stay?: Json
          inside_apartment?: Json
          location?: string
          name?: string
          nearby_universities?: Json
          payment_cycle?: string
          payment_terms?: string[]
          points_of_interest?: Json
          pricing?: Json
          published?: boolean
          single_bed_options?: Json
          slug?: string
          sort_order?: number
          summary?: string
          tagline?: string
          terms?: Json
          updated_at?: string
          utilities_note?: string
          waze_url?: string
        }
        Relationships: []
      }
      room_types: {
        Row: {
          available_from: string | null
          bathroom: string
          beds: Json
          code: string
          created_at: string
          description: string
          features: Json
          furnishing: Json
          gallery: Json
          has_view: boolean
          id: string
          image: string
          name: string
          occupancies: Json
          public_visible: boolean
          rent: Json
          residence_id: string
          room_code: string
          size_label: string | null
          size_sqft: number | null
          sort_order: number
          spots_left: number | null
          status: string
          tag: string
          unit_type: string
          updated_at: string
          view_type: string | null
        }
        Insert: {
          available_from?: string | null
          bathroom?: string
          beds?: Json
          code: string
          created_at?: string
          description?: string
          features?: Json
          furnishing?: Json
          gallery?: Json
          has_view?: boolean
          id?: string
          image?: string
          name: string
          occupancies?: Json
          public_visible?: boolean
          rent?: Json
          residence_id: string
          room_code?: string
          size_label?: string | null
          size_sqft?: number | null
          sort_order?: number
          spots_left?: number | null
          status?: string
          tag?: string
          unit_type?: string
          updated_at?: string
          view_type?: string | null
        }
        Update: {
          available_from?: string | null
          bathroom?: string
          beds?: Json
          code?: string
          created_at?: string
          description?: string
          features?: Json
          furnishing?: Json
          gallery?: Json
          has_view?: boolean
          id?: string
          image?: string
          name?: string
          occupancies?: Json
          public_visible?: boolean
          rent?: Json
          residence_id?: string
          room_code?: string
          size_label?: string | null
          size_sqft?: number | null
          sort_order?: number
          spots_left?: number | null
          status?: string
          tag?: string
          unit_type?: string
          updated_at?: string
          view_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "room_types_residence_id_fkey"
            columns: ["residence_id"]
            isOneToOne: false
            referencedRelation: "residences"
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
          role: Database["public"]["Enums"]["app_role"]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_enquiry_reference: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
