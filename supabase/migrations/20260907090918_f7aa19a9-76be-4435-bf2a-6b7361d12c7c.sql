ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS assigned_staff text NOT NULL DEFAULT '';
ALTER TABLE public.enquiries ADD COLUMN IF NOT EXISTS viewing_token text;
CREATE UNIQUE INDEX IF NOT EXISTS enquiries_viewing_token_key ON public.enquiries (viewing_token) WHERE viewing_token IS NOT NULL;