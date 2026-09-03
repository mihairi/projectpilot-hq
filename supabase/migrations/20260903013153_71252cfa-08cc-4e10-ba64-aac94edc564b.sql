
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS emailed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_uidx
  ON public.notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS notifications_unemailed_idx
  ON public.notifications (created_at) WHERE emailed_at IS NULL;

-- Task status change -> notify assignee and reporter
CREATE OR REPLACE FUNCTION public.notify_task_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  proj record;
  recipient uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT key, name INTO proj FROM public.projects WHERE id = NEW.project_id;
  FOREACH recipient IN ARRAY ARRAY[NEW.assignee_id, NEW.reporter_id] LOOP
    IF recipient IS NULL OR recipient = auth.uid() THEN CONTINUE; END IF;
    INSERT INTO public.notifications (user_id, kind, title, body, link, dedupe_key)
    VALUES (
      recipient,
      'task_status',
      format('%s-%s status: %s', proj.key, NEW.task_number, NEW.status),
      format('"%s" in %s moved from %s to %s.', NEW.title, proj.name, OLD.status, NEW.status),
      format('/projects/%s', NEW.project_id),
      format('status:%s:%s:%s', NEW.id, NEW.status, to_char(now(),'YYYYMMDDHH24MI'))
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.notify_task_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tasks_status_notify ON public.tasks;
CREATE TRIGGER trg_tasks_status_notify AFTER UPDATE OF status ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.notify_task_status_change();

-- Deadline scan, called by the scheduled mailer
CREATE OR REPLACE FUNCTION public.queue_deadline_notifications(_days integer DEFAULT 3)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inserted integer;
BEGIN
  WITH due AS (
    SELECT t.id, t.title, t.task_number, t.assignee_id, t.project_id, p.key, p.name,
           COALESCE(t.real_end_date, t.upd_end_date, t.est_end_date) AS due_date
    FROM public.tasks t JOIN public.projects p ON p.id = t.project_id
    WHERE t.assignee_id IS NOT NULL
      AND t.status NOT IN ('done','cancelled')
      AND COALESCE(t.real_end_date, t.upd_end_date, t.est_end_date)
          BETWEEN CURRENT_DATE AND CURRENT_DATE + _days
  ), ins AS (
    INSERT INTO public.notifications (user_id, kind, title, body, link, dedupe_key)
    SELECT assignee_id, 'deadline',
           format('%s-%s due %s', key, task_number, to_char(due_date,'DD Mon')),
           format('"%s" in %s is due on %s.', title, name, to_char(due_date,'DD Mon YYYY')),
           format('/projects/%s', project_id),
           format('deadline:%s:%s', id, due_date)
    FROM due
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted FROM ins;
  RETURN inserted;
END; $$;

REVOKE EXECUTE ON FUNCTION public.queue_deadline_notifications(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_deadline_notifications(integer) TO service_role;
