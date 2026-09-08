CREATE OR REPLACE FUNCTION public.next_enquiry_reference()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  SELECT 'BH-' || to_char(now(), 'DDMMYY') || '-QT' || lpad(nextval('public.enquiry_ref_seq')::text, 4, '0')
$function$;

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS assigned_staff text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewing_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS fee_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS resident_id text NOT NULL DEFAULT '';