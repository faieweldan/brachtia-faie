ALTER TABLE public.enquiries ALTER COLUMN status SET DEFAULT 'open';
UPDATE public.enquiries SET status = 'open' WHERE status IN ('new', '');