ALTER TABLE public.catalogs ADD COLUMN shared boolean NOT NULL DEFAULT false;
GRANT SELECT ON public.catalogs TO anon;
CREATE POLICY "shared select" ON public.catalogs FOR SELECT TO anon, authenticated USING (shared = true);
CREATE POLICY "shared read files" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'catalog-pages' AND EXISTS (
    SELECT 1 FROM public.catalogs c WHERE c.id::text = (storage.foldername(name))[2] AND c.shared = true));