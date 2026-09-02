ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS heard_about text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS heard_about_other text NOT NULL DEFAULT '';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS heard_about text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS heard_about_other text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS enquiry_status text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nationality text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS intake text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS gender text NOT NULL DEFAULT '';