import type { CommandPayload, CommandResultMap, CommandType } from "@liferoute/contracts";
import * as admin from "./admin";
import * as analysis from "./analysis";
import * as calendar from "./calendar";
import * as collections from "./collections";
import type { CommandContext } from "./context";
import * as finance from "./finance";
import * as inbox from "./inbox";
import * as notes from "./notes";
import * as plan from "./plan";
import * as reviews from "./reviews";
import * as routines from "./routines";

type Handler<T extends CommandType> = (ctx: CommandContext, payload: CommandPayload<T>) => Promise<CommandResultMap[T]>;
export type HandlerMap = { [T in CommandType]: Handler<T> };

/** Exhaustive: adding a command to the contract without a handler is a compile error. */
export const handlers: HandlerMap = {
  "task.create": plan.taskCreate,
  "task.update": plan.taskUpdate,
  "task.complete": plan.taskComplete,
  "task.reopen": plan.taskReopen,
  "task.cancel": plan.taskCancel,
  "task.delete": plan.taskDelete,
  "task.setTop": plan.taskSetTop,
  "task.clearTop": plan.taskClearTop,
  "goal.create": plan.goalCreate,
  "goal.update": plan.goalUpdate,
  "goal.delete": plan.goalDelete,
  "project.create": plan.projectCreate,
  "project.update": plan.projectUpdate,
  "project.delete": plan.projectDelete,
  "routine.create": routines.routineCreate,
  "routine.update": routines.routineUpdate,
  "routine.delete": routines.routineDelete,
  "checkin.record": routines.checkInRecord,
  "checkin.clear": routines.checkInClear,
  "account.create": finance.accountCreate,
  "account.update": finance.accountUpdate,
  "account.archive": finance.accountArchive,
  "account.restore": finance.accountRestore,
  "snapshot.add": finance.snapshotAdd,
  "snapshot.delete": finance.snapshotDelete,
  "note.create": notes.noteCreate,
  "note.save": notes.noteSave,
  "note.delete": notes.noteDelete,
  "note.restoreRevision": notes.noteRestoreRevision,
  "collection.create": collections.collectionCreate,
  "collection.update": collections.collectionUpdate,
  "collection.delete": collections.collectionDelete,
  "collection.record.create": collections.recordCreate,
  "collection.record.update": collections.recordUpdate,
  "collection.record.delete": collections.recordDelete,
  "calendar.event.create": calendar.eventCreate,
  "calendar.event.update": calendar.eventUpdate,
  "calendar.event.delete": calendar.eventDelete,
  "calendar.propose": calendar.calendarPropose,
  "calendar.approve": calendar.calendarApprove,
  "calendar.reject": calendar.calendarReject,
  "inbox.create": inbox.inboxCreate,
  "inbox.convert": inbox.inboxConvert,
  "inbox.archive": inbox.inboxArchive,
  "receipt.update": inbox.receiptUpdate,
  "receipt.confirm": inbox.receiptConfirm,
  "receipt.discard": inbox.receiptDiscard,
  "receipt.requestOcr": inbox.receiptRequestOcr,
  "review.generate": reviews.reviewGenerate,
  "review.update": reviews.reviewUpdate,
  "review.finalize": reviews.reviewFinalize,
  "analysis.preview": analysis.analysisPreview,
  "analysis.execute": analysis.analysisExecute,
  "analysis.cancel": analysis.analysisCancel,
  "settings.update": admin.settingsUpdate,
  "connection.disconnect": admin.connectionDisconnect,
  "connection.syncNow": admin.connectionSyncNow,
  "token.create": admin.tokenCreate,
  "token.revoke": admin.tokenRevoke,
  "backup.runNow": admin.backupRunNow,
  "guidance.upsert": admin.guidanceUpsert,
  "guidance.delete": admin.guidanceDelete,
};
