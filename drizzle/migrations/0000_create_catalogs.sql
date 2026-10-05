CREATE TABLE public.catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL DEFAULT 'catalogo',
  pages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogs TO authenticated;
GRANT ALL ON public.catalogs TO service_role;
ALTER TABLE public.catalogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own select" ON public.catalogs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own insert" ON public.catalogs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own update" ON public.catalogs FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own delete" ON public.catalogs FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "own upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'catalog-pages' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own delete files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'catalog-pages' AND (storage.foldername(name))[1] = auth.uid()::text);