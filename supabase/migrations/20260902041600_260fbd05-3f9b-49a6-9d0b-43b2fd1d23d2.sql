CREATE OR REPLACE FUNCTION public.enforce_start_date_locks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.est_start_date IS NOT NULL
     AND NEW.est_start_date IS DISTINCT FROM OLD.est_start_date
     AND NOT (private.is_admin(auth.uid()) OR private.has_role(auth.uid(),'global_pm')) THEN
    RAISE EXCEPTION 'The initial estimated start date is locked once set. Only an administrator or global project manager can change it.';
  END IF;

  IF OLD.upd_start_date IS NOT NULL
     AND OLD.upd_start_date < CURRENT_DATE
     AND NEW.upd_start_date IS DISTINCT FROM OLD.upd_start_date THEN
    RAISE EXCEPTION 'The updated start date is in the past and can no longer be changed.';
  END IF;

  IF OLD.real_start_date IS NOT NULL
     AND OLD.real_start_date < CURRENT_DATE
     AND NEW.real_start_date IS DISTINCT FROM OLD.real_start_date THEN
    RAISE EXCEPTION 'The real start date is in the past and can no longer be changed.';
  END IF;

  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.enforce_start_date_locks() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_tasks_start_date_locks ON public.tasks;
CREATE TRIGGER trg_tasks_start_date_locks
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.enforce_start_date_locks();