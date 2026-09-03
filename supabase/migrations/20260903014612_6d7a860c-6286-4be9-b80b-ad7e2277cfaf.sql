DROP POLICY IF EXISTS kb_pages_update ON public.kb_pages;
CREATE POLICY kb_pages_update ON public.kb_pages
FOR UPDATE TO authenticated
USING (
  private.is_admin(auth.uid())
  OR created_by = auth.uid()
  OR private.has_role(auth.uid(), 'business_analyst'::app_role)
  OR private.has_role(auth.uid(), 'project_manager'::app_role)
)
WITH CHECK (
  private.is_admin(auth.uid())
  OR created_by = auth.uid()
  OR private.has_role(auth.uid(), 'business_analyst'::app_role)
  OR private.has_role(auth.uid(), 'project_manager'::app_role)
);