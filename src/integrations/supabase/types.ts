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
      access_card_forms: {
        Row: {
          card_no: string
          created_at: string
          form_date: string
          id: string
          reason: string
          resident_id: string
          status: string
        }
        Insert: {
          card_no?: string
          created_at?: string
          form_date?: string
          id?: string
          reason?: string
          resident_id: string
          status?: string
        }
        Update: {
          card_no?: string
          created_at?: string
          form_date?: string
          id?: string
          reason?: string
          resident_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_card_forms_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      agreement_documents: {
        Row: {
          agreement_id: string
          created_at: string
          doc_type: string
          effective_date: string | null
          id: string
          merge_values: Json
          period_end: string | null
          period_start: string | null
          status: string
          supersedes: string | null
          version: number
        }
        Insert: {
          agreement_id: string
          created_at?: string
          doc_type: string
          effective_date?: string | null
          id?: string
          merge_values?: Json
          period_end?: string | null
          period_start?: string | null
          status?: string
          supersedes?: string | null
          version?: number
        }
        Update: {
          agreement_id?: string
          created_at?: string
          doc_type?: string
          effective_date?: string | null
          id?: string
          merge_values?: Json
          period_end?: string | null
          period_start?: string | null
          status?: string
          supersedes?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agreement_documents_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "tenancy_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreement_documents_supersedes_fkey"
            columns: ["supersedes"]
            isOneToOne: false
            referencedRelation: "agreement_documents"
            referencedColumns: ["id"]
          },
        ]
      }
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
          checkin_tasks: Json
          company: string
          created_at: string
          current_status: string
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
          occupation: string
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
          checkin_tasks?: Json
          company?: string
          created_at?: string
          current_status?: string
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
          occupation?: string
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
          checkin_tasks?: Json
          company?: string
          created_at?: string
          current_status?: string
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
          occupation?: string
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
      beds: {
        Row: {
          created_at: string
          enquiry_id: string | null
          gender: string | null
          hold_for: string | null
          hold_until: string | null
          id: string
          import_batch_id: string | null
          label: string
          nationality: string | null
          rent: number | null
          resident_id: string | null
          resident_name: string | null
          room_id: string
          sort_order: number
          status: string
          student_id: string | null
          tenancy_end: string | null
          tenancy_start: string | null
          university: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          enquiry_id?: string | null
          gender?: string | null
          hold_for?: string | null
          hold_until?: string | null
          id?: string
          import_batch_id?: string | null
          label: string
          nationality?: string | null
          rent?: number | null
          resident_id?: string | null
          resident_name?: string | null
          room_id: string
          sort_order?: number
          status?: string
          student_id?: string | null
          tenancy_end?: string | null
          tenancy_start?: string | null
          university?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          enquiry_id?: string | null
          gender?: string | null
          hold_for?: string | null
          hold_until?: string | null
          id?: string
          import_batch_id?: string | null
          label?: string
          nationality?: string | null
          rent?: number | null
          resident_id?: string | null
          resident_name?: string | null
          room_id?: string
          sort_order?: number
          status?: string
          student_id?: string | null
          tenancy_end?: string | null
          tenancy_start?: string | null
          university?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
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
      booking_events: {
        Row: {
          created_at: string
          enquiry_id: string
          id: string
          kind: string
          ref: string
          staff: string
          summary: string
        }
        Insert: {
          created_at?: string
          enquiry_id: string
          id?: string
          kind: string
          ref?: string
          staff: string
          summary?: string
        }
        Update: {
          created_at?: string
          enquiry_id?: string
          id?: string
          kind?: string
          ref?: string
          staff?: string
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_events_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      declaration_versions: {
        Row: {
          body: string
          body_sha256: string
          created_at: string
          effective_from: string
          id: string
          version: string
        }
        Insert: {
          body: string
          body_sha256: string
          created_at?: string
          effective_from?: string
          id?: string
          version: string
        }
        Update: {
          body?: string
          body_sha256?: string
          created_at?: string
          effective_from?: string
          id?: string
          version?: string
        }
        Relationships: []
      }
      enquiries: {
        Row: {
          addons: Json
          admin_notes: string
          assigned_staff: string
          close_reason: string
          company: string
          created_at: string
          current_status: string
          duplicate_of: string | null
          email: string
          fee_received_at: string | null
          first_payment: number
          full_name: string
          gender: string
          heard_about: string
          heard_about_other: string
          id: string
          idempotency_key: string | null
          intake: string
          invoice_issued_at: string | null
          message: string
          monthly_rent: number
          move_in: string | null
          move_out: string | null
          nationality: string
          occupancy: string
          occupation: string
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
          viewing_skipped_at: string | null
          viewing_token: string | null
          welcome_sent_at: string | null
        }
        Insert: {
          addons?: Json
          admin_notes?: string
          assigned_staff?: string
          close_reason?: string
          company?: string
          created_at?: string
          current_status?: string
          duplicate_of?: string | null
          email?: string
          fee_received_at?: string | null
          first_payment?: number
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          idempotency_key?: string | null
          intake?: string
          invoice_issued_at?: string | null
          message?: string
          monthly_rent?: number
          move_in?: string | null
          move_out?: string | null
          nationality?: string
          occupancy?: string
          occupation?: string
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
          viewing_skipped_at?: string | null
          viewing_token?: string | null
          welcome_sent_at?: string | null
        }
        Update: {
          addons?: Json
          admin_notes?: string
          assigned_staff?: string
          close_reason?: string
          company?: string
          created_at?: string
          current_status?: string
          duplicate_of?: string | null
          email?: string
          fee_received_at?: string | null
          first_payment?: number
          full_name?: string
          gender?: string
          heard_about?: string
          heard_about_other?: string
          id?: string
          idempotency_key?: string | null
          intake?: string
          invoice_issued_at?: string | null
          message?: string
          monthly_rent?: number
          move_in?: string | null
          move_out?: string | null
          nationality?: string
          occupancy?: string
          occupation?: string
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
          viewing_skipped_at?: string | null
          viewing_token?: string | null
          welcome_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enquiries_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiry_not_duplicates: {
        Row: {
          a_id: string
          b_id: string
          created_at: string
          staff: string
        }
        Insert: {
          a_id: string
          b_id: string
          created_at?: string
          staff?: string
        }
        Update: {
          a_id?: string
          b_id?: string
          created_at?: string
          staff?: string
        }
        Relationships: [
          {
            foreignKeyName: "enquiry_not_duplicates_a_id_fkey"
            columns: ["a_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enquiry_not_duplicates_b_id_fkey"
            columns: ["b_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          error_count: number
          filename: string
          id: string
          kind: string
          row_count: number
          status: string
        }
        Insert: {
          created_at?: string
          error_count?: number
          filename?: string
          id?: string
          kind: string
          row_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          error_count?: number
          filename?: string
          id?: string
          kind?: string
          row_count?: number
          status?: string
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
          quantity: number
          sort_order: number
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id: string
          kind?: string
          label?: string
          quantity?: number
          sort_order?: number
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          kind?: string
          label?: string
          quantity?: number
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
      invoice_versions: {
        Row: {
          created_at: string
          created_by: string
          document: Json
          id: string
          invoice_id: string
          issued_as: string
          number: string
          root_invoice_id: string | null
          total: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          document?: Json
          id?: string
          invoice_id: string
          issued_as?: string
          number?: string
          root_invoice_id?: string | null
          total?: number
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          document?: Json
          id?: string
          invoice_id?: string
          issued_as?: string
          number?: string
          root_invoice_id?: string | null
          total?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_versions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_versions_root_invoice_id_fkey"
            columns: ["root_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          auto_scheduled: boolean
          bill_on: string | null
          company: string
          created_at: string
          deposits_total: number
          discount_note: string
          discount_type: string | null
          discount_value: number
          email: string
          enquiry_id: string | null
          full_name: string
          id: string
          invoice_date: string | null
          invoice_type: string
          issued_at: string
          list_rent: number | null
          monthly_rent: number
          nationality: string
          next_payment_amount: number | null
          next_payment_date: string | null
          notes: string
          number: string
          occupancy: string
          occupation: string
          payment_frequency: string
          payment_terms: string
          period_end: string | null
          period_start: string | null
          phone: string
          replaces_invoice_id: string | null
          residence_name: string
          resident_id: string
          room_name: string
          show_terms: boolean
          status: string
          tenancy_end: string | null
          tenancy_id: string | null
          tenancy_start: string | null
          total: number
          university: string
          updated_at: string
        }
        Insert: {
          auto_scheduled?: boolean
          bill_on?: string | null
          company?: string
          created_at?: string
          deposits_total?: number
          discount_note?: string
          discount_type?: string | null
          discount_value?: number
          email?: string
          enquiry_id?: string | null
          full_name?: string
          id?: string
          invoice_date?: string | null
          invoice_type?: string
          issued_at?: string
          list_rent?: number | null
          monthly_rent?: number
          nationality?: string
          next_payment_amount?: number | null
          next_payment_date?: string | null
          notes?: string
          number?: string
          occupancy?: string
          occupation?: string
          payment_frequency?: string
          payment_terms?: string
          period_end?: string | null
          period_start?: string | null
          phone?: string
          replaces_invoice_id?: string | null
          residence_name?: string
          resident_id?: string
          room_name?: string
          show_terms?: boolean
          status?: string
          tenancy_end?: string | null
          tenancy_id?: string | null
          tenancy_start?: string | null
          total?: number
          university?: string
          updated_at?: string
        }
        Update: {
          auto_scheduled?: boolean
          bill_on?: string | null
          company?: string
          created_at?: string
          deposits_total?: number
          discount_note?: string
          discount_type?: string | null
          discount_value?: number
          email?: string
          enquiry_id?: string | null
          full_name?: string
          id?: string
          invoice_date?: string | null
          invoice_type?: string
          issued_at?: string
          list_rent?: number | null
          monthly_rent?: number
          nationality?: string
          next_payment_amount?: number | null
          next_payment_date?: string | null
          notes?: string
          number?: string
          occupancy?: string
          occupation?: string
          payment_frequency?: string
          payment_terms?: string
          period_end?: string | null
          period_start?: string | null
          phone?: string
          replaces_invoice_id?: string | null
          residence_name?: string
          resident_id?: string
          room_name?: string
          show_terms?: boolean
          status?: string
          tenancy_end?: string | null
          tenancy_id?: string | null
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
          {
            foreignKeyName: "invoices_replaces_invoice_id_fkey"
            columns: ["replaces_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          description: string
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
          description?: string
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
          description?: string
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
      profile_links: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          opened_at: string | null
          resident_id: string
          revoked_at: string | null
          submitted_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          opened_at?: string | null
          resident_id: string
          revoked_at?: string | null
          submitted_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          opened_at?: string | null
          resident_id?: string
          revoked_at?: string | null
          submitted_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_links_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_versions: {
        Row: {
          created_at: string
          created_by: string
          enquiry_id: string
          id: string
          issued_as: string
          monthly_rent: number
          reference: string
          snapshot: Json
          total_upfront: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          enquiry_id: string
          id?: string
          issued_as?: string
          monthly_rent?: number
          reference?: string
          snapshot?: Json
          total_upfront?: number
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          enquiry_id?: string
          id?: string
          issued_as?: string
          monthly_rent?: number
          reference?: string
          snapshot?: Json
          total_upfront?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
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
          paid_to_date: number | null
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
          paid_to_date?: number | null
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
          paid_to_date?: number | null
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
      rental_schedules: {
        Row: {
          confirmed_at: string
          final_amount: number | null
          first_due_date: string
          first_period_end: string
          first_period_start: string
          frequency: string
          id: string
          monthly_rent: number
          tenancy_end: string
          tenancy_id: string
          updated_at: string
        }
        Insert: {
          confirmed_at?: string
          final_amount?: number | null
          first_due_date: string
          first_period_end: string
          first_period_start: string
          frequency: string
          id?: string
          monthly_rent: number
          tenancy_end: string
          tenancy_id: string
          updated_at?: string
        }
        Update: {
          confirmed_at?: string
          final_amount?: number | null
          first_due_date?: string
          first_period_end?: string
          first_period_start?: string
          frequency?: string
          id?: string
          monthly_rent?: number
          tenancy_end?: string
          tenancy_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rental_schedules_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: true
            referencedRelation: "tenancies"
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
          unit_prefix: string
          unit_rates: Json
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
          unit_prefix?: string
          unit_rates?: Json
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
          unit_prefix?: string
          unit_rates?: Json
          updated_at?: string
          utilities_note?: string
          waze_url?: string
        }
        Relationships: []
      }
      resident_declarations: {
        Row: {
          agreed_terms: Json
          created_at: string
          id: string
          profile_link_id: string | null
          resident_id: string
          scrolled_to_end: boolean
          signed_at: string
          signed_id_number: string
          signed_ip: string
          signed_name: string
          signed_user_agent: string
          version_id: string
        }
        Insert: {
          agreed_terms?: Json
          created_at?: string
          id?: string
          profile_link_id?: string | null
          resident_id: string
          scrolled_to_end?: boolean
          signed_at?: string
          signed_id_number?: string
          signed_ip?: string
          signed_name: string
          signed_user_agent?: string
          version_id: string
        }
        Update: {
          agreed_terms?: Json
          created_at?: string
          id?: string
          profile_link_id?: string | null
          resident_id?: string
          scrolled_to_end?: boolean
          signed_at?: string
          signed_id_number?: string
          signed_ip?: string
          signed_name?: string
          signed_user_agent?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resident_declarations_profile_link_id_fkey"
            columns: ["profile_link_id"]
            isOneToOne: false
            referencedRelation: "profile_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_declarations_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resident_declarations_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "declaration_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      residents: {
        Row: {
          address: string
          checkin_asked_at: string | null
          checkin_on: string | null
          checkin_remind: boolean
          checkin_slot: string
          company: string
          country: string
          course: string
          created_at: string
          current_status: string
          dob: string
          docs: Json
          ec_address: string
          ec_country: string
          ec_email: string
          ec_mobile: string
          ec_name: string
          ec_postcode: string
          ec_relationship: string
          ec_state: string
          email: string
          employment_type: string
          enquiry_id: string | null
          full_name: string
          gender: string
          graduation_year: string
          id: string
          id_number: string
          import_batch_id: string | null
          industry: string
          lease_months: string
          level_of_study: string
          marital_status: string
          medical_condition: string
          medical_detail: string
          mobile: string
          move_in: string
          nationality: string
          occupancy: string
          occupation: string
          pay_method: string
          pay_schedule: string
          payer_address: string
          payer_country: string
          payer_email: string
          payer_mobile: string
          payer_name: string
          payer_postcode: string
          payer_relationship: string
          payer_state: string
          portal_invited: boolean
          postcode: string
          quickbooks_id: string | null
          race: string
          religion: string
          resident_code: string | null
          sponsor: string
          state: string
          status: string
          student_id: string
          university: string
          updated_at: string
        }
        Insert: {
          address?: string
          checkin_asked_at?: string | null
          checkin_on?: string | null
          checkin_remind?: boolean
          checkin_slot?: string
          company?: string
          country?: string
          course?: string
          created_at?: string
          current_status?: string
          dob?: string
          docs?: Json
          ec_address?: string
          ec_country?: string
          ec_email?: string
          ec_mobile?: string
          ec_name?: string
          ec_postcode?: string
          ec_relationship?: string
          ec_state?: string
          email?: string
          employment_type?: string
          enquiry_id?: string | null
          full_name?: string
          gender?: string
          graduation_year?: string
          id?: string
          id_number?: string
          import_batch_id?: string | null
          industry?: string
          lease_months?: string
          level_of_study?: string
          marital_status?: string
          medical_condition?: string
          medical_detail?: string
          mobile?: string
          move_in?: string
          nationality?: string
          occupancy?: string
          occupation?: string
          pay_method?: string
          pay_schedule?: string
          payer_address?: string
          payer_country?: string
          payer_email?: string
          payer_mobile?: string
          payer_name?: string
          payer_postcode?: string
          payer_relationship?: string
          payer_state?: string
          portal_invited?: boolean
          postcode?: string
          quickbooks_id?: string | null
          race?: string
          religion?: string
          resident_code?: string | null
          sponsor?: string
          state?: string
          status?: string
          student_id?: string
          university?: string
          updated_at?: string
        }
        Update: {
          address?: string
          checkin_asked_at?: string | null
          checkin_on?: string | null
          checkin_remind?: boolean
          checkin_slot?: string
          company?: string
          country?: string
          course?: string
          created_at?: string
          current_status?: string
          dob?: string
          docs?: Json
          ec_address?: string
          ec_country?: string
          ec_email?: string
          ec_mobile?: string
          ec_name?: string
          ec_postcode?: string
          ec_relationship?: string
          ec_state?: string
          email?: string
          employment_type?: string
          enquiry_id?: string | null
          full_name?: string
          gender?: string
          graduation_year?: string
          id?: string
          id_number?: string
          import_batch_id?: string | null
          industry?: string
          lease_months?: string
          level_of_study?: string
          marital_status?: string
          medical_condition?: string
          medical_detail?: string
          mobile?: string
          move_in?: string
          nationality?: string
          occupancy?: string
          occupation?: string
          pay_method?: string
          pay_schedule?: string
          payer_address?: string
          payer_country?: string
          payer_email?: string
          payer_mobile?: string
          payer_name?: string
          payer_postcode?: string
          payer_relationship?: string
          payer_state?: string
          portal_invited?: boolean
          postcode?: string
          quickbooks_id?: string | null
          race?: string
          religion?: string
          resident_code?: string | null
          sponsor?: string
          state?: string
          status?: string
          student_id?: string
          university?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "residents_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
        ]
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
      rooms: {
        Row: {
          created_at: string
          id: string
          import_batch_id: string | null
          letter: string
          occupancy: string
          rent: number
          room_type_code: string
          sort_order: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_batch_id?: string | null
          letter: string
          occupancy?: string
          rent?: number
          room_type_code?: string
          sort_order?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          import_batch_id?: string | null
          letter?: string
          occupancy?: string
          rent?: number
          room_type_code?: string
          sort_order?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      tenancies: {
        Row: {
          bed_id: string | null
          created_at: string
          end_date: string | null
          enquiry_id: string | null
          id: string
          resident_id: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          bed_id?: string | null
          created_at?: string
          end_date?: string | null
          enquiry_id?: string | null
          id?: string
          resident_id: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          bed_id?: string | null
          created_at?: string
          end_date?: string | null
          enquiry_id?: string | null
          id?: string
          resident_id?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenancies_enquiry_id_fkey"
            columns: ["enquiry_id"]
            isOneToOne: false
            referencedRelation: "enquiries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancies_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
        ]
      }
      tenancy_agreements: {
        Row: {
          agreement_no: string
          created_at: string
          id: string
          kind: string
          resident_id: string
          tenancy_id: string | null
        }
        Insert: {
          agreement_no: string
          created_at?: string
          id?: string
          kind?: string
          resident_id: string
          tenancy_id?: string | null
        }
        Update: {
          agreement_no?: string
          created_at?: string
          id?: string
          kind?: string
          resident_id?: string
          tenancy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenancy_agreements_resident_id_fkey"
            columns: ["resident_id"]
            isOneToOne: false
            referencedRelation: "residents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenancy_agreements_tenancy_id_fkey"
            columns: ["tenancy_id"]
            isOneToOne: false
            referencedRelation: "tenancies"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          block: string
          code: string
          created_at: string
          deactivated_at: string | null
          deactivation_reason: string
          floor: string
          gender: string
          id: string
          import_batch_id: string | null
          notes: string
          residence_id: string
          unit_no: string
          unit_type: string
          updated_at: string
          whole_unit: boolean
          whole_unit_rent: number
        }
        Insert: {
          block?: string
          code: string
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string
          floor?: string
          gender?: string
          id?: string
          import_batch_id?: string | null
          notes?: string
          residence_id: string
          unit_no: string
          unit_type?: string
          updated_at?: string
          whole_unit?: boolean
          whole_unit_rent?: number
        }
        Update: {
          block?: string
          code?: string
          created_at?: string
          deactivated_at?: string | null
          deactivation_reason?: string
          floor?: string
          gender?: string
          id?: string
          import_batch_id?: string | null
          notes?: string
          residence_id?: string
          unit_no?: string
          unit_type?: string
          updated_at?: string
          whole_unit?: boolean
          whole_unit_rent?: number
        }
        Relationships: [
          {
            foreignKeyName: "units_residence_id_fkey"
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
      bill_due_invoices: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      invoice_category_code: { Args: { invoice_type: string }; Returns: string }
      next_agreement_no: { Args: never; Returns: number }
      next_enquiry_reference: { Args: never; Returns: string }
      next_invoice_number: { Args: { invoice_type: string }; Returns: string }
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
