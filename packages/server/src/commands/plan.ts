import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { CommandPayload, CommandResultMap, Recurrence } from "@liferoute/contracts";
import { nextDueDate, pickTopRank } from "@liferoute/core";
import { goals, notes, projects, tasks } from "../db/schema";
import { DomainError, invalidTransition, isUniqueViolation, notFound } from "../errors";
import { toGoal, toProject, toTask } from "../mappers";
import { assertVersion, type CommandContext } from "./context";

type P<T extends keyof CommandResultMap> = CommandPayload<T>;
type R<T extends keyof CommandResultMap> = Promise<CommandResultMap[T]>;

const bump = (now: Date) => ({ updatedAt: now, version: sql`version + 1` });

async function nextSortOrder(ctx: CommandContext, table: typeof tasks | typeof goals | typeof projects) {
  const [row] = await ctx.tx.select({ max: sql<number>`coalesce(max(${table.sortOrder}), 0)` }).from(table);
  return Number(row?.max ?? 0) + 1;
}

async function requireProject(ctx: CommandContext, id: string) {
  const [row] = await ctx.tx.select().from(projects).where(eq(projects.id, id));
  if (!row || row.deletedAt) throw notFound("프로젝트");
  return row;
}

async function requireGoal(ctx: CommandContext, id: string) {
  const [row] = await ctx.tx.select().from(goals).where(eq(goals.id, id));
  if (!row || row.deletedAt) throw notFound("목표");
  return row;
}

function requireDueForRecurrence(recurrence: Recurrence | null, dueDate: string | null) {
  if (recurrence && !dueDate) {
    throw new DomainError("RECURRENCE_REQUIRES_DUE_DATE", "반복 할 일에는 마감일이 필요합니다.");
  }
}

async function assertNewId(ctx: CommandContext, table: typeof tasks | typeof goals | typeof projects, id: string) {
  const [row] = await ctx.tx.select({ id: table.id }).from(table).where(eq(table.id, id));
  if (row) throw new DomainError("VALIDATION_FAILED", "이미 사용 중인 id입니다.");
}

/** Goal follows the project (review D-26): a task in a project always carries that project's goal. */
async function resolveGoalId(ctx: CommandContext, projectId: string | null, goalId: string | null) {
  if (projectId) return (await requireProject(ctx, projectId)).goalId;
  if (goalId) await requireGoal(ctx, goalId);
  return goalId;
}

async function lockTask(ctx: CommandContext, taskId: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
  return assertVersion(row, expectedVersion, "task", taskId, toTask, "할 일");
}

async function updateTask(ctx: CommandContext, taskId: string, values: Partial<typeof tasks.$inferInsert>) {
  try {
    const [row] = await ctx.tx
      .update(tasks)
      .set({ ...values, ...bump(ctx.now) })
      .where(eq(tasks.id, taskId))
      .returning();
    return toTask(row!);
  } catch (error) {
    if (isUniqueViolation(error, "tasks_top_slot_uq")) {
      throw new DomainError("TOP_RANK_TAKEN", "그 순위는 이미 다른 할 일이 차지하고 있습니다.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------- tasks

export async function taskCreate(ctx: CommandContext, p: P<"task.create">): R<"task.create"> {
  const id = p.id ?? randomUUID();
  if (p.id) await assertNewId(ctx, tasks, id);
  requireDueForRecurrence(p.recurrence, p.dueDate);
  const goalId = await resolveGoalId(ctx, p.projectId, p.goalId);
  const [row] = await ctx.tx
    .insert(tasks)
    .values({
      id,
      title: p.title.trim(),
      description: p.description,
      projectId: p.projectId,
      goalId,
      dueDate: p.dueDate,
      plannedAt: p.plannedAt ? new Date(p.plannedAt) : null,
      plannedDurationMin: p.plannedDurationMin,
      recurrence: p.recurrence,
      seriesId: p.recurrence ? id : null,
      sortOrder: await nextSortOrder(ctx, tasks),
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { task: toTask(row!) };
}

export async function taskUpdate(ctx: CommandContext, p: P<"task.update">): R<"task.update"> {
  const row = await lockTask(ctx, p.taskId, p.expectedVersion);
  const patch = p.patch;
  const recurrence = patch.recurrence !== undefined ? patch.recurrence : row.recurrence;
  const dueDate = patch.dueDate !== undefined ? patch.dueDate : row.dueDate;
  requireDueForRecurrence(recurrence, dueDate);
  const projectId = patch.projectId !== undefined ? patch.projectId : row.projectId;
  const goalId =
    patch.projectId !== undefined || patch.goalId !== undefined
      ? await resolveGoalId(ctx, projectId, patch.goalId !== undefined ? patch.goalId : row.goalId)
      : row.goalId;
  const task = await updateTask(ctx, row.id, {
    ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    projectId,
    goalId,
    dueDate,
    ...(patch.plannedAt !== undefined ? { plannedAt: patch.plannedAt ? new Date(patch.plannedAt) : null } : {}),
    ...(patch.plannedDurationMin !== undefined ? { plannedDurationMin: patch.plannedDurationMin } : {}),
    recurrence,
    seriesId: recurrence ? (row.seriesId ?? row.id) : row.seriesId,
    ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
  });
  return { task };
}

export async function taskComplete(ctx: CommandContext, p: P<"task.complete">): R<"task.complete"> {
  const row = await lockTask(ctx, p.taskId, p.expectedVersion);
  if (row.status !== "open") throw invalidTransition("열린 할 일만 완료할 수 있습니다.");
  const completedAt = p.completedAt ? new Date(p.completedAt) : ctx.now;

  let nextOccurrence = null;
  if (row.recurrence && row.dueDate) {
    const due = nextDueDate(row.recurrence, row.dueDate, ctx.today);
    if (due) {
      const [next] = await ctx.tx
        .insert(tasks)
        .values({
          id: randomUUID(),
          title: row.title,
          description: row.description,
          projectId: row.projectId,
          goalId: row.goalId,
          dueDate: due,
          plannedDurationMin: row.plannedDurationMin,
          recurrence: row.recurrence,
          seriesId: row.seriesId ?? row.id,
          sortOrder: row.sortOrder,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .returning();
      nextOccurrence = toTask(next!);
    }
  }
  // The rule moves to the next occurrence so reopening this one never spawns a duplicate.
  const task = await updateTask(ctx, row.id, {
    status: "done",
    completedAt,
    recurrence: null,
    seriesId: row.seriesId ?? (row.recurrence ? row.id : null),
  });
  return { task, nextOccurrence };
}

export async function taskReopen(ctx: CommandContext, p: P<"task.reopen">): R<"task.reopen"> {
  const row = await lockTask(ctx, p.taskId, p.expectedVersion);
  if (row.status === "open") throw invalidTransition("이미 열린 할 일입니다.");
  let top: { topDate: string | null; topRank: 1 | 2 | 3 | null } = { topDate: row.topDate, topRank: row.topRank };
  if (row.topDate && row.topRank) {
    const [taken] = await ctx.tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(eq(tasks.topDate, row.topDate), eq(tasks.topRank, row.topRank), eq(tasks.status, "open"), isNull(tasks.deletedAt)),
      );
    if (taken) top = { topDate: null, topRank: null };
  }
  const task = await updateTask(ctx, row.id, { status: "open", completedAt: null, ...top });
  return { task };
}

export async function taskCancel(ctx: CommandContext, p: P<"task.cancel">): R<"task.cancel"> {
  const row = await lockTask(ctx, p.taskId, p.expectedVersion);
  if (row.status !== "open") throw invalidTransition("열린 할 일만 취소할 수 있습니다.");
  return { task: await updateTask(ctx, row.id, { status: "cancelled" }) };
}

export async function taskDelete(ctx: CommandContext, p: P<"task.delete">): R<"task.delete"> {
  const row = await lockTask(ctx, p.taskId, p.expectedVersion);
  return { task: await updateTask(ctx, row.id, { deletedAt: ctx.now, topDate: null, topRank: null }) };
}

export async function taskSetTop(ctx: CommandContext, p: P<"task.setTop">): R<"task.setTop"> {
  const row = await lockTask(ctx, p.taskId, p.expectedVersion);
  if (row.status !== "open") throw invalidTransition("열린 할 일만 오늘의 3가지로 지정할 수 있습니다.");
  const sameDay = await ctx.tx
    .select({ id: tasks.id, status: tasks.status, topDate: tasks.topDate, topRank: tasks.topRank, deletedAt: tasks.deletedAt })
    .from(tasks)
    .where(and(eq(tasks.topDate, p.date), eq(tasks.status, "open"), isNull(tasks.deletedAt)))
    .for("update");
  const pick = pickTopRank(
    sameDay.map((t) => ({ ...t, deletedAt: null })),
    p.date,
    row.id,
    p.rank,
  );
  if (!pick.ok) {
    throw pick.code === "TOP_LIMIT_EXCEEDED"
      ? new DomainError("TOP_LIMIT_EXCEEDED", "하루에 3개까지만 지정할 수 있습니다.", undefined, "다른 항목을 먼저 빼 주세요.")
      : new DomainError("TOP_RANK_TAKEN", "그 순위는 이미 다른 할 일이 차지하고 있습니다.");
  }
  return { task: await updateTask(ctx, row.id, { topDate: p.date, topRank: pick.rank }) };
}

export async function taskClearTop(ctx: CommandContext, p: P<"task.clearTop">): R<"task.clearTop"> {
  const row = await lockTask(ctx, p.taskId, p.expectedVersion);
  return { task: await updateTask(ctx, row.id, { topDate: null, topRank: null }) };
}

// ---------------------------------------------------------------- goals

async function lockGoal(ctx: CommandContext, goalId: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(goals).where(eq(goals.id, goalId)).for("update");
  return assertVersion(row, expectedVersion, "goal", goalId, toGoal, "목표");
}

export async function goalCreate(ctx: CommandContext, p: P<"goal.create">): R<"goal.create"> {
  const id = p.id ?? randomUUID();
  if (p.id) await assertNewId(ctx, goals, id);
  const [row] = await ctx.tx
    .insert(goals)
    .values({
      id,
      title: p.title.trim(),
      description: p.description,
      targetDate: p.targetDate,
      sortOrder: await nextSortOrder(ctx, goals),
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { goal: toGoal(row!) };
}

export async function goalUpdate(ctx: CommandContext, p: P<"goal.update">): R<"goal.update"> {
  await lockGoal(ctx, p.goalId, p.expectedVersion);
  const [row] = await ctx.tx
    .update(goals)
    .set({ ...p.patch, ...(p.patch.title ? { title: p.patch.title.trim() } : {}), ...bump(ctx.now) })
    .where(eq(goals.id, p.goalId))
    .returning();
  return { goal: toGoal(row!) };
}

export async function goalDelete(ctx: CommandContext, p: P<"goal.delete">): R<"goal.delete"> {
  await lockGoal(ctx, p.goalId, p.expectedVersion);
  // Detach dependants so nothing points at a deleted goal (versions bump so stale clients get 409).
  for (const table of [projects, tasks, notes] as const) {
    await ctx.tx.update(table).set({ goalId: null, ...bump(ctx.now) }).where(eq(table.goalId, p.goalId));
  }
  const [row] = await ctx.tx
    .update(goals)
    .set({ deletedAt: ctx.now, ...bump(ctx.now) })
    .where(eq(goals.id, p.goalId))
    .returning();
  return { goal: toGoal(row!) };
}

// ---------------------------------------------------------------- projects

async function lockProject(ctx: CommandContext, projectId: string, expectedVersion: number) {
  const [row] = await ctx.tx.select().from(projects).where(eq(projects.id, projectId)).for("update");
  return assertVersion(row, expectedVersion, "project", projectId, toProject, "프로젝트");
}

export async function projectCreate(ctx: CommandContext, p: P<"project.create">): R<"project.create"> {
  const id = p.id ?? randomUUID();
  if (p.id) await assertNewId(ctx, projects, id);
  if (p.goalId) await requireGoal(ctx, p.goalId);
  const [row] = await ctx.tx
    .insert(projects)
    .values({
      id,
      goalId: p.goalId,
      title: p.title.trim(),
      doneCriteria: p.doneCriteria,
      dueDate: p.dueDate,
      sortOrder: await nextSortOrder(ctx, projects),
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .returning();
  return { project: toProject(row!) };
}

export async function projectUpdate(ctx: CommandContext, p: P<"project.update">): R<"project.update"> {
  const current = await lockProject(ctx, p.projectId, p.expectedVersion);
  if (p.patch.goalId) await requireGoal(ctx, p.patch.goalId);
  const [row] = await ctx.tx
    .update(projects)
    .set({ ...p.patch, ...(p.patch.title ? { title: p.patch.title.trim() } : {}), ...bump(ctx.now) })
    .where(eq(projects.id, p.projectId))
    .returning();
  if (p.patch.goalId !== undefined && p.patch.goalId !== current.goalId) {
    await ctx.tx
      .update(tasks)
      .set({ goalId: p.patch.goalId, ...bump(ctx.now) })
      .where(eq(tasks.projectId, p.projectId));
  }
  return { project: toProject(row!) };
}

export async function projectDelete(ctx: CommandContext, p: P<"project.delete">): R<"project.delete"> {
  await lockProject(ctx, p.projectId, p.expectedVersion);
  for (const table of [tasks, notes] as const) {
    await ctx.tx.update(table).set({ projectId: null, ...bump(ctx.now) }).where(eq(table.projectId, p.projectId));
  }
  const [row] = await ctx.tx
    .update(projects)
    .set({ deletedAt: ctx.now, ...bump(ctx.now) })
    .where(eq(projects.id, p.projectId))
    .returning();
  return { project: toProject(row!) };
}
