-- 1. Lock down residence-photos storage: no anon/authenticated access at all.
DROP POLICY IF EXISTS "residence photos read" ON storage.objects;
DROP POLICY IF EXISTS "residence photos insert" ON storage.objects;
DROP POLICY IF EXISTS "residence photos update" ON storage.objects;
DROP POLICY IF EXISTS "residence photos delete" ON storage.objects;

CREATE POLICY "residence photos admin read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'residence-photos' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE POLICY "residence photos admin insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'residence-photos' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE POLICY "residence photos admin update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'residence-photos' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (bucket_id = 'residence-photos' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));
CREATE POLICY "residence photos admin delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'residence-photos' AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- 2. Remove broad authenticated read on residences / room_types.
DROP POLICY IF EXISTS "authenticated can read residences" ON public.residences;
DROP POLICY IF EXISTS "authenticated can read room types" ON public.room_types;
DROP POLICY IF EXISTS "authenticated read appointment types" ON public.appointment_types;

-- 3. Replace has_role() usage in policies with inline checks, then revoke EXECUTE
--    on the SECURITY DEFINER function from anon/authenticated.
DROP POLICY IF EXISTS "admins manage residences" ON public.residences;
CREATE POLICY "admins manage residences" ON public.residences FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "admins manage room types" ON public.room_types;
CREATE POLICY "admins manage room types" ON public.room_types FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "admins manage enquiries" ON public.enquiries;
CREATE POLICY "admins manage enquiries" ON public.enquiries FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "admins manage appointments" ON public.appointments;
CREATE POLICY "admins manage appointments" ON public.appointments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "admins manage appointment types" ON public.appointment_types;
CREATE POLICY "admins manage appointment types" ON public.appointment_types FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "admins manage availability" ON public.availability_rules;
CREATE POLICY "admins manage availability" ON public.availability_rules FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

DROP POLICY IF EXISTS "admins manage blocked dates" ON public.blocked_dates;
CREATE POLICY "admins manage blocked dates" ON public.blocked_dates FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'))
WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, authenticated, PUBLIC;