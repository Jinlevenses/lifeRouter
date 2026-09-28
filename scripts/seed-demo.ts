import { createDb } from "@liferoute/server/db";
import { MemoryJobQueue, disconnectedIntegrations, executeCommand } from "@liferoute/server";
import type { CommandInput } from "@liferoute/contracts";
import { loadEnv, requireEnv } from "./lib/env";

/**
 * Fills an EMPTY development database with a small sample (never run against real data).
 * Usage: pnpm tsx scripts/seed-demo.ts
 */
loadEnv();
const { db, pool } = createDb(requireEnv("DATABASE_URL"), 2);
const deps = { db, jobs: new MemoryJobQueue(), integrations: disconnectedIntegrations() };
async function ok(command: CommandInput) {
  const res = await executeCommand(deps, command);
  if (res.status !== 200) throw new Error(`${command.type}: ${JSON.stringify(res.body)}`);
  return (res.body as { result: any }).result;
}
try {
  const { rows } = await pool.query("select count(*)::int as n from tasks");
  if (rows[0].n > 0) {
    console.error("Database already has tasks; refusing to seed.");
    process.exit(1);
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const { goal } = await ok({
    type: "goal.create",
    payload: { title: "건강한 몸", description: "꾸준히 움직이기" },
  });
  const { project } = await ok({
    type: "project.create",
    payload: {
      title: "10km 완주",
      goalId: goal.id,
      doneCriteria: "60분 안에 10km 완주",
      dueDate: "2026-11-30",
    },
  });
  const a = await ok({
    type: "task.create",
    payload: { title: "러닝화 사기", projectId: project.id, dueDate: today },
  });
  const b = await ok({
    type: "task.create",
    payload: { title: "연말정산 서류 모으기", dueDate: "2026-10-10" },
  });
  await ok({
    type: "task.create",
    payload: {
      title: "주간 정리",
      dueDate: today,
      recurrence: { kind: "weekly", weekdays: ["mon"], startDate: "2026-09-01", endDate: null },
    },
  });
  await ok({
    type: "task.create",
    payload: {
      title: "치과 예약 전화",
      plannedAt: new Date(Date.now() + 2 * 3600_000).toISOString().replace(/\.\d+Z$/, ".000Z"),
      plannedDurationMin: 15,
    },
  });
  await ok({ type: "task.setTop", payload: { taskId: a.task.id, expectedVersion: 1, date: today } });
  await ok({ type: "task.setTop", payload: { taskId: b.task.id, expectedVersion: 1, date: today } });
  const { routine } = await ok({
    type: "routine.create",
    payload: { title: "물 2L 마시기", schedule: { kind: "daily", startDate: "2026-09-01", endDate: null } },
  });
  await ok({
    type: "routine.create",
    payload: {
      title: "달리기",
      schedule: { kind: "weekly", weekdays: ["mon", "wed", "fri"], startDate: "2026-09-01", endDate: null },
    },
  });
  await ok({ type: "checkin.record", payload: { routineId: routine.id, date: today, status: "done" } });
  const { account: dep } = await ok({
    type: "account.create",
    payload: { name: "급여 통장", kind: "asset", category: "deposit", liquid: true, institution: "토스뱅크" },
  });
  const { account: pen } = await ok({
    type: "account.create",
    payload: { name: "IRP", kind: "asset", category: "pension" },
  });
  const { account: loan } = await ok({
    type: "account.create",
    payload: { name: "전세 대출", kind: "liability", category: "loan" },
  });
  await ok({
    type: "account.create",
    payload: { name: "달러 예금", kind: "asset", category: "deposit", currency: "USD" },
  });
  await ok({ type: "snapshot.add", payload: { accountId: dep.id, asOf: today, amount: "4230000" } });
  await ok({
    type: "snapshot.add",
    payload: {
      accountId: pen.id,
      asOf: "2026-08-10",
      amount: "12500000",
      estimated: true,
      reason: "지난달 명세 기준",
    },
  });
  await ok({ type: "snapshot.add", payload: { accountId: loan.id, asOf: today, amount: "30000000" } });
  const { note } = await ok({
    type: "note.create",
    payload: { title: "달리기 계획", tags: ["건강"], projectId: project.id },
  });
  await ok({
    type: "note.save",
    payload: {
      noteId: note.id,
      expectedVersion: 1,
      title: "달리기 계획",
      tags: ["건강"],
      projectId: project.id,
      goalId: null,
      document: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "10월" }] },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "주 3회, 30분부터 시작. 관련: " },
              {
                type: "noteLink",
                attrs: { targetType: "project", targetId: project.id, label: "10km 완주" },
              },
            ],
          },
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [{ type: "paragraph", content: [{ type: "text", text: "러닝화 사기" }] }],
              },
            ],
          },
        ],
      },
    },
  });
  await ok({ type: "inbox.create", payload: { kind: "text", text: "주말에 부모님 댁 방문 일정 잡기" } });
  await ok({ type: "inbox.create", payload: { kind: "url", url: "https://www.easylaw.go.kr" } });
  await ok({
    type: "calendar.event.create",
    payload: {
      title: "팀 회의",
      when: { allDay: false, start: `${today}T05:00:00.000Z`, end: `${today}T06:00:00.000Z` },
    },
  });
  await ok({ type: "review.generate", payload: { kind: "weekly", date: today } });
  console.log("Demo data created.");
} finally {
  await pool.end();
}
