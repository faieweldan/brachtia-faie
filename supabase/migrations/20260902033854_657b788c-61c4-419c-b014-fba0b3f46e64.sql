CREATE POLICY "residence photos read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'residence-photos');
CREATE POLICY "residence photos insert" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'residence-photos');
CREATE POLICY "residence photos update" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'residence-photos') WITH CHECK (bucket_id = 'residence-photos');
CREATE POLICY "residence photos delete" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'residence-photos');