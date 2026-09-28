import type {
  Account,
  BalanceSnapshot,
  CheckIn,
  Note,
  Receipt,
  ReviewComputed,
  Routine,
  Settings,
  Task,
} from "@liferoute/contracts";
import { addDays, dateInZone, isWithin, minDate, type Period } from "./date";
import { computeNetWorth } from "./finance";
import { add, formatKrw, isNegative, isPositive, sub } from "./money";
import { indexCheckIns, routineStats } from "./routines";

/**
 * Weekly/monthly reviews (FR-009, docs/10_review, review D-46..D-48).
 * Pure and deterministic: the same inputs always produce the same computed block and draft.
 * AI never participates here; optional AI analysis is a separate, consented flow.
 */
export interface ReviewInput {
  period: Period;
  today: string;
  timeZone: string;
  finance: Settings["finance"];
  tasks: readonly Pick<Task, "id" | "title" | "status" | "dueDate" | "completedAt" | "deletedAt">[];
  routines: readonly Pick<Routine, "id" | "title" | "schedule" | "status" | "deletedAt">[];
  checkIns: readonly Pick<CheckIn, "routineId" | "date" | "status">[];
  accounts: readonly Pick<Account, "id" | "kind" | "included" | "liquid" | "archivedAt">[];
  snapshots: readonly Pick<BalanceSnapshot, "id" | "accountId" | "asOf" | "amountKrw" | "estimated">[];
  receipts: readonly Pick<Receipt, "status" | "confirmed">[];
  notes: readonly Pick<Note, "createdAt" | "deletedAt">[];
}

export function computeReview(input: ReviewInput): ReviewComputed {
  const { period, timeZone } = input;
  const until = minDate(period.end, input.today);
  const completedDate = (t: { completedAt: string | null }) => (t.completedAt ? dateInZone(t.completedAt, timeZone) : null);

  const completed = input.tasks
    .filter((t) => t.deletedAt === null && t.status === "done")
    .filter((t) => {
      const d = completedDate(t);
      return d !== null && isWithin(d, period.start, period.end);
    })
    .map((t) => t.id)
    .sort();

  const overdue = input.tasks
    .filter((t) => t.deletedAt === null && t.status !== "cancelled" && t.dueDate !== null)
    .filter((t) => isWithin(t.dueDate!, period.start, until))
    .filter((t) => {
      if (t.status === "open") return true;
      const d = completedDate(t);
      return d !== null && d > period.end;
    })
    .map((t) => t.id)
    .sort();

  const index = indexCheckIns(input.checkIns);
  const routines = input.routines
    .filter((r) => r.deletedAt === null)
    .map((r) => routineStats(r, index, period.start, until))
    .filter((s) => s.expected > 0)
    .sort((a, b) => a.routineId.localeCompare(b.routineId));

  const worthAt = (date: string) =>
    computeNetWorth({
      accounts: input.accounts,
      snapshots: input.snapshots,
      today: input.today,
      finance: input.finance,
      timeZone,
      asOf: date,
    });
  const startWorth = worthAt(addDays(period.start, -1));
  const endWorth = worthAt(until);
  const hasData = (w: ReturnType<typeof worthAt>) => w.accounts.some((a) => !a.missing);
  const startKrw = hasData(startWorth) ? startWorth.netWorthKrw : null;
  const endKrw = hasData(endWorth) ? endWorth.netWorthKrw : null;

  const spending = input.receipts
    .filter((r) => r.status === "confirmed" && r.confirmed && isWithin(r.confirmed.date, period.start, period.end))
    .map((r) => r.confirmed!.amountKrw);

  return {
    completedTasks: { count: completed.length, taskIds: completed },
    overdueTasks: { count: overdue.length, taskIds: overdue },
    routines,
    netWorth: {
      startKrw,
      endKrw,
      deltaKrw: startKrw !== null && endKrw !== null ? sub(endKrw, startKrw) : null,
      incomplete: startKrw === null || endKrw === null || startWorth.data === "incomplete" || endWorth.data === "incomplete",
    },
    spendingKrw: add("0", ...spending),
    notesCreated: input.notes.filter(
      (n) => n.deletedAt === null && isWithin(dateInZone(n.createdAt, timeZone), period.start, period.end),
    ).length,
    checkInsRecorded: input.checkIns.filter((c) => isWithin(c.date, period.start, until)).length,
  };
}

/** Rule-based draft sentences from the computed block (no AI). */
export function draftFromComputed(
  computed: ReviewComputed,
  names: { tasks: ReadonlyMap<string, string>; routines: ReadonlyMap<string, string> },
): { wins: string[]; challenges: string[]; nextFocus: string[] } {
  const wins: string[] = [];
  const challenges: string[] = [];
  const nextFocus: string[] = [];

  if (computed.completedTasks.count > 0) wins.push(`할 일 ${computed.completedTasks.count}개를 완료했습니다.`);
  for (const r of computed.routines) {
    const title = names.routines.get(r.routineId) ?? "루틴";
    if (r.expected > 0 && r.done / r.expected >= 0.8) wins.push(`‘${title}’ ${r.done}/${r.expected}회 달성`);
    else if (r.unrecorded > 0 && r.done / r.expected < 0.5) {
      challenges.push(`‘${title}’ 기록 누락 ${r.unrecorded}회 (달성 ${r.done}/${r.expected})`);
      if (nextFocus.length < 3) nextFocus.push(`‘${title}’ 루틴을 작게 다시 시작하기`);
    }
  }
  const delta = computed.netWorth.deltaKrw;
  if (delta !== null && isPositive(delta)) wins.push(`순자산 ${formatKrw(delta)} 증가`);
  if (delta !== null && isNegative(delta)) challenges.push(`순자산 ${formatKrw(delta.slice(1))} 감소`);
  if (computed.overdueTasks.count > 0) {
    challenges.push(`기한을 넘긴 할 일 ${computed.overdueTasks.count}개`);
    for (const id of computed.overdueTasks.taskIds.slice(0, 3 - Math.min(3, nextFocus.length))) {
      nextFocus.push(`‘${names.tasks.get(id) ?? "할 일"}’ 마무리하거나 일정 다시 잡기`);
    }
  }
  if (computed.netWorth.incomplete) {
    challenges.push("일부 계좌 잔액이 없거나 오래되어 순자산 변화가 정확하지 않을 수 있습니다.");
    if (nextFocus.length < 5) nextFocus.push("계좌 잔액 스냅샷 업데이트");
  }
  if (wins.length === 0) wins.push("기록을 이어가는 것 자체가 진전입니다.");
  return { wins: wins.slice(0, 10), challenges: challenges.slice(0, 10), nextFocus: nextFocus.slice(0, 10) };
}

/** Deterministic JSON (sorted object keys) used to hash review inputs. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
