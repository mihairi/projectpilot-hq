
CREATE TYPE public.app_role AS ENUM ('admin','global_pm','project_manager','business_manager','business_analyst','developer','tester','requester');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  job_title text,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, job_title, department)
  VALUES (NEW.id, NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          NEW.raw_user_meta_data->>'job_title',
          NEW.raw_user_meta_data->>'department')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'requester'))
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT TO authenticated USING (true);

CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'active',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  start_date date,
  target_end_date date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_role public.app_role NOT NULL DEFAULT 'developer',
  allocation_pct smallint NOT NULL DEFAULT 100 CHECK (allocation_pct BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_project_member(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE user_id = _user_id AND project_id = _project_id);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_project(_user_id uuid, _project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(_user_id)
      OR public.has_role(_user_id,'global_pm')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.owner_id = _user_id)
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = _project_id AND m.user_id = _user_id AND m.project_role IN ('project_manager','business_manager'));
$$;

CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_number integer NOT NULL DEFAULT 0,
  title text NOT NULL,
  description text,
  task_type text NOT NULL DEFAULT 'task',
  status text NOT NULL DEFAULT 'backlog',
  priority smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  est_start_date date,
  est_duration_days numeric,
  est_end_date date,
  upd_start_date date,
  upd_duration_days numeric,
  upd_end_date date,
  real_start_date date,
  real_duration_days numeric,
  real_end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.set_task_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.task_number IS NULL OR NEW.task_number = 0 THEN
    SELECT COALESCE(MAX(task_number),0)+1 INTO NEW.task_number FROM public.tasks WHERE project_id = NEW.project_id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_tasks_number BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_task_number();

CREATE TABLE public.task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type text NOT NULL DEFAULT 'finish_to_start',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_dependencies TO authenticated;
GRANT ALL ON public.task_dependencies TO service_role;
ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kb_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_spaces TO authenticated;
GRANT ALL ON public.kb_spaces TO service_role;
ALTER TABLE public.kb_spaces ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.kb_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES public.kb_spaces(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.kb_pages(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kb_pages TO authenticated;
GRANT ALL ON public.kb_pages TO service_role;
ALTER TABLE public.kb_pages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_kb_pages_updated BEFORE UPDATE ON public.kb_pages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "projects_select" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'global_pm') OR public.has_role(auth.uid(),'project_manager'));
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_manage_project(auth.uid(), id)) WITH CHECK (public.can_manage_project(auth.uid(), id));
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "members_select" ON public.project_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "members_write" ON public.project_members FOR ALL TO authenticated
  USING (public.can_manage_project(auth.uid(), project_id)) WITH CHECK (public.can_manage_project(auth.uid(), project_id));

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (true);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.can_manage_project(auth.uid(), project_id));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE TO authenticated
  USING (public.is_project_member(auth.uid(), project_id) OR public.can_manage_project(auth.uid(), project_id))
  WITH CHECK (public.is_project_member(auth.uid(), project_id) OR public.can_manage_project(auth.uid(), project_id));
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE TO authenticated
  USING (public.can_manage_project(auth.uid(), project_id));

CREATE POLICY "deps_select" ON public.task_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "deps_write" ON public.task_dependencies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.can_manage_project(auth.uid(), t.project_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id AND (public.is_project_member(auth.uid(), t.project_id) OR public.can_manage_project(auth.uid(), t.project_id))));

CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "kb_spaces_select" ON public.kb_spaces FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb_spaces_write" ON public.kb_spaces FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'global_pm') OR created_by = auth.uid())
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'global_pm') OR created_by = auth.uid());

CREATE POLICY "kb_pages_select" ON public.kb_pages FOR SELECT TO authenticated USING (true);
CREATE POLICY "kb_pages_insert" ON public.kb_pages FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "kb_pages_update" ON public.kb_pages FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid() OR public.has_role(auth.uid(),'business_analyst') OR public.has_role(auth.uid(),'project_manager'))
  WITH CHECK (true);
CREATE POLICY "kb_pages_delete" ON public.kb_pages FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.notify_priority_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO public.notifications (user_id, title, body, link)
    SELECT m.user_id,
           'Priority changed: ' || NEW.key,
           'Project "' || NEW.name || '" priority changed from P' || OLD.priority || ' to P' || NEW.priority || '.',
           '/projects/' || NEW.id
    FROM public.project_members m
    WHERE m.project_id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_projects_priority_notify AFTER UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.notify_priority_change();
