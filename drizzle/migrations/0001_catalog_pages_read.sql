CREATE POLICY "own read files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'catalog-pages' AND (storage.foldername(name))[1] = auth.uid()::text);