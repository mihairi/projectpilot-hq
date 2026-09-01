CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, job_title, department)
  VALUES (NEW.id, NEW.email,
          COALESCE(NEW.raw_user_meta_data->>'full_name',''),
          NEW.raw_user_meta_data->>'job_title',
          NEW.raw_user_meta_data->>'department')
  ON CONFLICT (id) DO NOTHING;

  IF NEW.raw_user_meta_data->>'role' IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, (NEW.raw_user_meta_data->>'role')::public.app_role)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $function$;

DELETE FROM public.user_roles r
WHERE r.role = 'requester'
  AND EXISTS (SELECT 1 FROM public.user_roles o WHERE o.user_id = r.user_id AND o.role <> 'requester');