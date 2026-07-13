import type { Plan } from "../types.js";

export function createInitialPlan(goal: string): Plan {
  return {
    goal,
    steps: [
      {
        id: "understand-request",
        title: "Understand the user request and choose the next action",
        status: "in_progress"
      },
      {
        id: "use-tools",
        title: "Use tools to inspect or modify the workspace if needed",
        status: "pending"
      },
      {
        id: "report",
        title: "Return a final answer with outcomes and risks",
        status: "pending"
      }
    ]
  };
}

export function markPlanStep(
  plan: Plan,
  stepId: string,
  status: Plan["steps"][number]["status"],
  notes?: string
): Plan {
  return {
    ...plan,
    steps: plan.steps.map((step) =>
      step.id === stepId ? { ...step, status, notes: notes ?? step.notes } : step
    )
  };
}
