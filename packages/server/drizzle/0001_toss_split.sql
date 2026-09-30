-- Custom SQL migration file, put your code below! --
-- Q-2: Toss is two read-only sources, 토스뱅크 잔액 and 토스증권 잔고 (ADR-014).
-- The single "toss" connection becomes "toss_bank"; ensureSeeded adds "toss_securities".
UPDATE "connections" SET "provider" = 'toss_bank' WHERE "provider" = 'toss';--> statement-breakpoint
UPDATE "balance_snapshots" SET "source" = 'toss_bank' WHERE "source" = 'toss';
