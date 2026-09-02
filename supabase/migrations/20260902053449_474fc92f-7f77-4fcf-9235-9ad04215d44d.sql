CREATE SEQUENCE IF NOT EXISTS public.enquiry_ref_seq;

CREATE OR REPLACE FUNCTION public.next_enquiry_reference()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'BRH-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.enquiry_ref_seq')::text, 4, '0')
$$;

ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS quote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.enquiries SET reference = public.next_enquiry_reference() WHERE reference IS NULL;

ALTER TABLE public.enquiries ALTER COLUMN reference SET DEFAULT public.next_enquiry_reference();
ALTER TABLE public.enquiries ALTER COLUMN reference SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS enquiries_reference_key ON public.enquiries (reference);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS enquiry_id uuid REFERENCES public.enquiries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS appointments_enquiry_id_idx ON public.appointments (enquiry_id);