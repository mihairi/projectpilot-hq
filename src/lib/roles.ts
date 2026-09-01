export const APP_ROLES = [
  "admin",
  "global_pm",
  "project_manager",
  "business_manager",
  "business_analyst",
  "developer",
  "tester",
  "requester",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  global_pm: "Global Project Manager",
  project_manager: "Project Manager",
  business_manager: "Business Manager",
  business_analyst: "Business Analyst",
  developer: "Developer",
  tester: "Test User",
  requester: "Business Requester",
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  admin: "Manages users, roles, access revocation, password and 2FA resets.",
  global_pm: "Sets global project priorities and reports across the portfolio.",
  project_manager: "Runs projects, plans tasks, allocates resources, reports.",
  business_manager: "Reports on project and task status and resource allocation.",
  business_analyst: "Writes requirements and knowledge base documentation.",
  developer: "Delivers and updates assigned tasks.",
  tester: "Validates delivered tasks and logs defects.",
  requester: "Raises requests and follows their progress.",
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "P1 - Critical",
  2: "P2 - High",
  3: "P3 - Medium",
  4: "P4 - Low",
  5: "P5 - Lowest",
};

export const PRIORITY_CLASS: Record<number, string> = {
  1: "bg-p1/15 text-p1 border-p1/30",
  2: "bg-p2/15 text-p2 border-p2/30",
  3: "bg-p3/15 text-p3 border-p3/30",
  4: "bg-p4/15 text-p4 border-p4/30",
  5: "bg-p5/15 text-p5 border-p5/30",
};

export const TASK_STATUSES = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "testing",
  "done",
  "blocked",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  testing: "Testing",
  done: "Done",
  blocked: "Blocked",
};

export const TASK_TYPES = ["epic", "story", "task", "bug", "request"] as const;

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "closed"] as const;

/** Permission helpers, mirrored by database policies. */
export function can(roles: AppRole[]) {
  const has = (r: AppRole) => roles.includes(r);
  const isAdmin = has("admin");
  return {
    isAdmin,
    manageUsers: isAdmin,
    setGlobalPriority: isAdmin || has("global_pm"),
    createProject: isAdmin || has("global_pm") || has("project_manager"),
    report: isAdmin || has("global_pm") || has("project_manager") || has("business_manager"),
    editKnowledgeBase:
      isAdmin || has("global_pm") || has("project_manager") || has("business_analyst"),
  };
}
