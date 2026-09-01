
DO $$
DECLARE
  v_project uuid := '9fa1c7d1-f4f4-4b62-9b44-b039d86872a7';
  v_admin uuid := 'e379f8ae-43fb-4ab4-bf3a-b585080b8e10';
  v_ana uuid := '0baad8e2-a91b-4808-9500-e63cb1bfa469';
  v_space uuid;
BEGIN
  INSERT INTO public.project_members (project_id, user_id, project_role, allocation_pct)
  VALUES (v_project, v_admin, 'project_manager', 60),
         (v_project, v_ana, 'business_analyst', 80)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.tasks (project_id, title, description, task_type, status, priority, assignee_id, reporter_id,
    est_start_date, est_duration_days, est_end_date, upd_start_date, upd_duration_days, upd_end_date,
    real_start_date, real_duration_days, real_end_date)
  VALUES
    (v_project, 'Draft ledger migration requirements', 'Collect and sign off requirements for the general ledger migration.', 'story', 'in_progress', 2, v_ana, v_admin,
      current_date - 10, 8, current_date - 2, current_date - 10, 12, current_date + 2, current_date - 10, NULL, NULL),
    (v_project, 'Approve vendor payment API contract', 'Review and approve the payment provider API contract.', 'task', 'in_progress', 1, v_admin, v_admin,
      current_date - 6, 5, current_date - 1, current_date - 6, 5, current_date - 1, current_date - 6, NULL, NULL),
    (v_project, 'Configure test environment', 'Stand up the FIN UAT environment with anonymised data.', 'task', 'todo', 3, v_admin, v_admin,
      current_date, 4, current_date + 4, current_date, 4, current_date + 4, NULL, NULL, NULL),
    (v_project, 'Write UAT test scenarios', 'Prepare end-to-end UAT scenarios for invoicing and reconciliation.', 'task', 'todo', 3, v_ana, v_admin,
      current_date + 2, 6, current_date + 8, current_date + 2, 6, current_date + 8, NULL, NULL, NULL),
    (v_project, 'Kick-off workshop with finance stakeholders', 'Run the project kick-off workshop and capture minutes.', 'task', 'done', 2, v_admin, v_admin,
      current_date - 20, 1, current_date - 20, current_date - 20, 1, current_date - 20, current_date - 20, 1, current_date - 20);

  INSERT INTO public.kb_spaces (key, name, description, project_id, created_by)
  VALUES ('FINKB', 'FIN Knowledge Base', 'Documentation for the Finance Platform Rollout programme.', v_project, v_admin)
  RETURNING id INTO v_space;

  INSERT INTO public.kb_pages (space_id, title, content, created_by, updated_by)
  VALUES
    (v_space, 'FIN project overview',
'# Finance Platform Rollout

## Purpose
Replace the legacy finance stack with an integrated ledger, payments and reporting platform.

## Scope
- General ledger migration
- Vendor payment integration
- Invoicing and reconciliation
- UAT and cutover

## Key contacts
- Project manager: admin@atlas.local
- Business analyst: ana.pop@atlas.local

## Ways of working
Tasks are tracked on the FIN board. Every task carries an initial estimate, an updated plan and real dates so schedule slip is visible in Reports.',
      v_admin, v_admin),
    (v_space, 'UAT entry and exit criteria',
'# UAT entry and exit criteria

## Entry
- Test environment configured with anonymised data
- All P1 and P2 defects from system test closed
- Test scenarios reviewed and approved

## Exit
- 95% of scenarios executed and passed
- No open P1 defects
- Business sign-off recorded on this page',
      v_admin, v_admin);
END $$;
