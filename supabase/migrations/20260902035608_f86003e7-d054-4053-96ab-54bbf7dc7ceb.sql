-- Helper: portfolio-wide visibility (managers/admins)
CREATE OR REPLACE FUNCTION public.has_portfolio_view(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id,'global_pm')
      OR public.has_role(_user_id,'project_manager')
      OR public.has_role(_user_id,'business_manager');
$$;

-- Helper: can this user see this project at all?
CREATE OR REPLACE FUNCTION public.can_view_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_portfolio_view(_user_id)
      OR public.is_project_member(_user_id, _project_id)
      OR public.can_manage_project(_user_id, _project_id);
$$;

-- Helper: do two users share a project?
CREATE OR REPLACE FUNCTION public.shares_project(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members m1
    JOIN public.project_members m2 ON m1.project_id = m2.project_id
    WHERE m1.user_id = _a AND m2.user_id = _b
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_portfolio_view(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_project(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_project(uuid, uuid) TO authenticated;

-- profiles: self, shared-project colleagues, managers/admins
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_scoped ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR public.has_portfolio_view(auth.uid())
  OR public.shares_project(auth.uid(), id)
);

-- user_roles: self or admin only
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select_scoped ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- projects / members / tasks / deps / kb: membership scoped
DROP POLICY IF EXISTS projects_select ON public.projects;
CREATE POLICY projects_select ON public.projects FOR SELECT TO authenticated
USING (public.can_view_project(auth.uid(), id));

DROP POLICY IF EXISTS members_select ON public.project_members;
CREATE POLICY members_select ON public.project_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.can_view_project(auth.uid(), project_id));

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
USING (
  assignee_id = auth.uid()
  OR reporter_id = auth.uid()
  OR public.can_view_project(auth.uid(), project_id)
);

DROP POLICY IF EXISTS deps_select ON public.task_dependencies;
CREATE POLICY deps_select ON public.task_dependencies FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_dependencies.task_id
          AND public.can_view_project(auth.uid(), t.project_id))
);

DROP POLICY IF EXISTS kb_spaces_select ON public.kb_spaces;
CREATE POLICY kb_spaces_select ON public.kb_spaces FOR SELECT TO authenticated
USING (
  project_id IS NULL
  OR created_by = auth.uid()
  OR public.can_view_project(auth.uid(), project_id)
);

DROP POLICY IF EXISTS kb_pages_select ON public.kb_pages;
CREATE POLICY kb_pages_select ON public.kb_pages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.kb_spaces s
    WHERE s.id = kb_pages.space_id
      AND (s.project_id IS NULL OR s.created_by = auth.uid()
           OR public.can_view_project(auth.uid(), s.project_id))
  )
);

-- Priority governance enforced in the database
CREATE OR REPLACE FUNCTION public.enforce_priority_governance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority
     AND auth.uid() IS NOT NULL
     AND NOT (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'global_pm')) THEN
    RAISE EXCEPTION 'Only a global project manager or administrator can change project priority.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_projects_priority_governance ON public.projects;
CREATE TRIGGER trg_projects_priority_governance
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.enforce_priority_governance();

-- Trigger-only SECURITY DEFINER functions must not be directly callable
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_priority_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_task_number() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_priority_governance() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_portfolio_view(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shares_project(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_project_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_project(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_project(uuid, uuid) TO authenticated;