CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION private.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE user_id = _user_id AND project_id = _project_id);
$$;

CREATE OR REPLACE FUNCTION private.can_manage_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_admin(_user_id)
      OR private.has_role(_user_id,'global_pm')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id AND m.project_role IN ('project_manager','business_manager'));
$$;

CREATE OR REPLACE FUNCTION private.has_portfolio_view(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.is_admin(_user_id)
      OR private.has_role(_user_id,'global_pm')
      OR private.has_role(_user_id,'project_manager')
      OR private.has_role(_user_id,'business_manager');
$$;

CREATE OR REPLACE FUNCTION private.can_view_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT private.has_portfolio_view(_user_id)
      OR private.is_project_member(_user_id, _project_id)
      OR private.can_manage_project(_user_id, _project_id);
$$;

CREATE OR REPLACE FUNCTION private.shares_project(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members m1
    JOIN public.project_members m2 ON m1.project_id = m2.project_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  );
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.is_project_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_portfolio_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_view_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.shares_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_portfolio_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_view_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.shares_project(uuid, uuid) TO authenticated;

-- Recreate every policy against the private helpers
DROP POLICY IF EXISTS profiles_select_scoped ON public.profiles;
CREATE POLICY profiles_select_scoped ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR private.has_portfolio_view(auth.uid()) OR private.shares_project(auth.uid(), id));

DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated
USING (private.is_admin(auth.uid())) WITH CHECK (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS user_roles_select_scoped ON public.user_roles;
CREATE POLICY user_roles_select_scoped ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.is_admin(auth.uid()));

DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
USING (private.can_view_project(auth.uid(), id));

DROP POLICY IF EXISTS projects_insert ON public.projects;
CREATE POLICY projects_insert ON public.projects FOR INSERT TO authenticated
WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(),'global_pm') OR private.has_role(auth.uid(),'project_manager'));

DROP POLICY IF EXISTS projects_update ON public.projects;
CREATE POLICY projects_update ON public.projects FOR UPDATE TO authenticated
USING (private.can_manage_project(auth.uid(), id)) WITH CHECK (private.can_manage_project(auth.uid(), id));

DROP POLICY IF EXISTS projects_delete ON public.projects;
CREATE POLICY projects_delete ON public.projects FOR DELETE TO authenticated
USING (private.is_admin(auth.uid()));

DROP POLICY IF EXISTS members_select ON public.project_members;
CREATE POLICY members_select ON public.project_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR private.can_view_project(auth.uid(), project_id));

DROP POLICY IF EXISTS members_write ON public.project_members;
CREATE POLICY members_write ON public.project_members FOR ALL TO authenticated
USING (private.can_manage_project(auth.uid(), project_id)) WITH CHECK (private.can_manage_project(auth.uid(), project_id));

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
USING (assignee_id = auth.uid() OR reporter_id = auth.uid() OR private.can_view_project(auth.uid(), project_id));

DROP POLICY IF EXISTS tasks_insert ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated
WITH CHECK (private.is_project_member(auth.uid(), project_id) OR private.can_manage_project(auth.uid(), project_id));

DROP POLICY IF EXISTS tasks_update ON public.tasks;
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated
USING (private.is_project_member(auth.uid(), project_id) OR private.can_manage_project(auth.uid(), project_id))
WITH CHECK (private.is_project_member(auth.uid(), project_id) OR private.can_manage_project(auth.uid(), project_id));

DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated
USING (private.can_manage_project(auth.uid(), project_id));

DROP POLICY IF EXISTS deps_select ON public.task_dependencies;
CREATE POLICY deps_select ON public.task_dependencies FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.task_id AND private.can_view_project(auth.uid(), t.project_id)));

DROP POLICY IF EXISTS deps_write ON public.task_dependencies;
CREATE POLICY deps_write ON public.task_dependencies FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.task_id AND (private.is_project_member(auth.uid(), t.project_id) OR private.can_manage_project(auth.uid(), t.project_id))))
WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.task_id AND (private.is_project_member(auth.uid(), t.project_id) OR private.can_manage_project(auth.uid(), t.project_id))));

DROP POLICY IF EXISTS kb_spaces_select ON public.kb_spaces;
CREATE POLICY kb_spaces_select ON public.kb_spaces FOR SELECT TO authenticated
USING (project_id IS NULL OR created_by = auth.uid() OR private.can_view_project(auth.uid(), project_id));

DROP POLICY IF EXISTS kb_spaces_write ON public.kb_spaces;
CREATE POLICY kb_spaces_write ON public.kb_spaces FOR ALL TO authenticated
USING (private.is_admin(auth.uid()) OR private.has_role(auth.uid(),'global_pm') OR created_by = auth.uid())
WITH CHECK (private.is_admin(auth.uid()) OR private.has_role(auth.uid(),'global_pm') OR created_by = auth.uid());

DROP POLICY IF EXISTS kb_pages_select ON public.kb_pages;
CREATE POLICY kb_pages_select ON public.kb_pages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.kb_spaces s WHERE s.id = kb_pages.space_id
  AND (s.project_id IS NULL OR s.created_by = auth.uid() OR private.can_view_project(auth.uid(), s.project_id))));

DROP POLICY IF EXISTS kb_pages_update ON public.kb_pages;
CREATE POLICY kb_pages_update ON public.kb_pages FOR UPDATE TO authenticated
USING (private.is_admin(auth.uid()) OR created_by = auth.uid() OR private.has_role(auth.uid(),'business_analyst') OR private.has_role(auth.uid(),'project_manager'))
WITH CHECK (true);

DROP POLICY IF EXISTS kb_pages_delete ON public.kb_pages;
CREATE POLICY kb_pages_delete ON public.kb_pages FOR DELETE TO authenticated
USING (private.is_admin(auth.uid()) OR created_by = auth.uid());

-- Trigger functions now use the private helpers
CREATE OR REPLACE FUNCTION public.enforce_priority_governance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority
     AND auth.uid() IS NOT NULL
     AND NOT (private.is_admin(auth.uid()) OR private.has_role(auth.uid(),'global_pm')) THEN
    RAISE EXCEPTION 'Only a global project manager or administrator can change project priority.';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.enforce_priority_governance() FROM PUBLIC, anon, authenticated;

-- Remove the public-schema copies now that nothing references them
DROP FUNCTION IF EXISTS public.can_view_project(uuid, uuid);
DROP FUNCTION IF EXISTS public.has_portfolio_view(uuid);
DROP FUNCTION IF EXISTS public.shares_project(uuid, uuid);
DROP FUNCTION IF EXISTS public.can_manage_project(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_project_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.is_admin(uuid);
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);