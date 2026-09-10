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
          assigned_staff: string
          created_at: string
          duration_minutes: number
          email: string
          enquiry_id: string | null
          enquiry_status: string
          full_name: string
          gender: string
          heard_about: string
          heard_about_other: string
          history: Json
          id: string
          intake: string
          mode: string
          move_in: string | null
          move_out: string | null
          nationality: string
          notes: string
          phone: string
          residence_id: string | null
          residence_name: string
          residence_names: string[]
          residence_slug: string
          residence_slugs: string[]
          resident_id: string
          sharing_preference: string
          source: string
          starts_at: string
          status: string
          type_slug: string
          university: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string
          assigned_staff?: string
          created_at?: string
          duration_minutes?: number
          email?: string
          enquiry_id?: string | null
          enquiry_status?: string
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          history?: Json
          id?: string
          intake?: string
          mode?: string
          move_in?: string | null
          move_out?: string | null
          nationality?: string
          notes?: string
          phone?: string
          residence_id?: string | null
          residence_name?: string
          residence_names?: string[]
          residence_slug?: string
          residence_slugs?: string[]
          resident_id?: string
          sharing_preference?: string
          source?: string
          starts_at: string
          status?: string
          type_slug?: string
          university?: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string
          assigned_staff?: string
          created_at?: string
          duration_minutes?: number
          email?: string
          enquiry_id?: string | null
          enquiry_status?: string
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          history?: Json
          id?: string
          intake?: string
          mode?: string
          move_in?: string | null
          move_out?: string | null
          nationality?: string
          notes?: string
          phone?: string
          residence_id?: string | null
          residence_name?: string
          residence_names?: string[]
          residence_slug?: string
          residence_slugs?: string[]
          resident_id?: string
          sharing_preference?: string
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
          capacity_group: number
          created_at: string
          end_time: string
          id: string
          mode: string
          residence_id: string | null
          slot_minutes: number
          start_time: string
          type_slug: string
          valid_from: string | null
          valid_to: string | null
          weekday: number
        }
        Insert: {
          active?: boolean
          buffer_minutes?: number
          capacity?: number
          capacity_group?: number
          created_at?: string
          end_time?: string
          id?: string
          mode?: string
          residence_id?: string | null
          slot_minutes?: number
          start_time?: string
          type_slug?: string
          valid_from?: string | null
          valid_to?: string | null
          weekday: number
        }
        Update: {
          active?: boolean
          buffer_minutes?: number
          capacity?: number
          capacity_group?: number
          created_at?: string
          end_time?: string
          id?: string
          mode?: string
          residence_id?: string | null
          slot_minutes?: number
          start_time?: string
          type_slug?: string
          valid_from?: string | null
          valid_to?: string | null
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
          end_time: string | null
          id: string
          reason: string
          residence_id: string | null
          start_time: string | null
        }
        Insert: {
          blocked_on: string
          created_at?: string
          end_time?: string | null
          id?: string
          reason?: string
          residence_id?: string | null
          start_time?: string | null
        }
        Update: {
          blocked_on?: string
          created_at?: string
          end_time?: string | null
          id?: string
          reason?: string
          residence_id?: string | null
          start_time?: string | null
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
          assigned_staff: string
          created_at: string
          email: string
          fee_received_at: string | null
          first_payment: number
          full_name: string
          gender: string
          heard_about: string
          heard_about_other: string
          id: string
          intake: string
          invoice_issued_at: string | null
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
          resident_id: string
          room_code: string
          room_name: string
          stage_changed_at: string | null
          status: string
          term: string
          unit_type: string
          university: string
          updated_at: string
          viewing_completed_at: string | null
          viewing_token: string | null
        }
        Insert: {
          addons?: Json
          admin_notes?: string
          assigned_staff?: string
          created_at?: string
          email?: string
          fee_received_at?: string | null
          first_payment?: number
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          intake?: string
          invoice_issued_at?: string | null
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
          resident_id?: string
          room_code?: string
          room_name?: string
          stage_changed_at?: string | null
          status?: string
          term?: string
          unit_type?: string
          university?: string
          updated_at?: string
          viewing_completed_at?: string | null
          viewing_token?: string | null
        }
        Update: {
          addons?: Json
          admin_notes?: string
          assigned_staff?: string
          created_at?: string
          email?: string
          fee_received_at?: string | null
          first_payment?: number
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          intake?: string
          invoice_issued_at?: string | null
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
          resident_id?: string
          room_code?: string
          room_name?: string
          stage_changed_at?: string | null
          status?: string
          term?: string
          unit_type?: string
          university?: string
          updated_at?: string
          viewing_completed_at?: string | null
          viewing_token?: string | null
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          kind: string
          label: string
          sort_order: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          kind?: string
          label?: string
          sort_order?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          kind?: string
          label?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          deposits_total: number
          email: string
          enquiry_id: string | null
          full_name: string
          id: string
          invoice_date: string | null
          issued_at: string
          monthly_rent: number
          nationality: string
          notes: string
          number: string
          occupancy: string
          payment_frequency: string
          payment_terms: string
          phone: string
          residence_name: string
          resident_id: string
          room_name: string
          status: string
          tenancy_end: string | null
          tenancy_start: string | null
          total: number
          university: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deposits_total?: number
          email?: string
          enquiry_id?: string | null
          full_name?: string
          id?: string
          invoice_date?: string | null
          issued_at?: string
          monthly_rent?: number
          nationality?: string
          notes?: string
          number?: string
          occupancy?: string
          payment_frequency?: string
          payment_terms?: string
          phone?: string
          residence_name?: string
          resident_id?: string
          room_name?: string
          status?: string
          tenancy_end?: string | null
          tenancy_start?: string | null
          total?: number
          university?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deposits_total?: number
          email?: string
          enquiry_id?: string | null
          full_name?: string
          id?: string
          invoice_date?: string | null
          issued_at?: string
          monthly_rent?: number
          nationality?: string
          notes?: string
          number?: string
          occupancy?: string
          payment_frequency?: string
          payment_terms?: string
          phone?: string
          residence_name?: string
          resident_id?: string
          room_name?: string
          status?: string
          tenancy_end?: string | null
          tenancy_start?: string | null
          total?: number
          university?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          enquiry_id: string | null
          id: string
          invoice_id: string
          method: string
          paid_on: string
          proof_path: string
          reference: string
          resident_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          enquiry_id?: string | null
          id?: string
          invoice_id: string
          method?: string
          paid_on?: string
          proof_path?: string
          reference?: string
          resident_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          enquiry_id?: string | null
          id?: string
          invoice_id?: string
          method?: string
          paid_on?: string
          proof_path?: string
          reference?: string
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          enquiry_id: string | null
          id: string
          invoice_id: string
          issued_at: string
          number: string
          payment_id: string
          resident_id: string
        }
        Insert: {
          amount?: number
          balance_after?: number
          created_at?: string
          enquiry_id?: string | null
          id?: string
          invoice_id: string
          issued_at?: string
          number?: string
          payment_id: string
          resident_id?: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          enquiry_id?: string | null
          id?: string
          invoice_id?: string
          issued_at?: string
          number?: string
          payment_id?: string
          resident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
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
      next_invoice_reference: { Args: never; Returns: string }
      next_receipt_reference: { Args: never; Returns: string }
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
