import type { StepChecklist } from "../types.js";

/** Execution-oriented Step checklist (default after `/execute` or normal Runs). */
export function createExecutionStepChecklist(goal: string): StepChecklist {
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

/** Planning-oriented Step checklist used while Plan Mode is active. */
export function createPlanningStepChecklist(goal: string): StepChecklist {
  return {
    goal,
    steps: [
      {
        id: "clarify-goal",
        title: "Clarify the Goal, Scope, and Acceptance for the Plan",
        status: "in_progress"
      },
      {
        id: "explore-readonly",
        title: "Explore the workspace with read-only tools",
        status: "pending"
      },
      {
        id: "write-plan",
        title: "Write the Plan document via update_plan",
        status: "pending"
      }
    ]
  };
}

export function markStepChecklistStep(
  checklist: StepChecklist,
  stepId: string,
  status: StepChecklist["steps"][number]["status"],
  notes?: string
): StepChecklist {
  return {
    ...checklist,
    steps: checklist.steps.map((step) =>
      step.id === stepId ? { ...step, status, notes: notes ?? step.notes } : step
    )
  };
}

/** @deprecated Use createExecutionStepChecklist */
export const createInitialPlan = createExecutionStepChecklist;
/** @deprecated Use markStepChecklistStep */
export const markPlanStep = markStepChecklistStep;
