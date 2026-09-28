import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { createDb } from "@liferoute/server/db";
import { createAuth, createOwner, OwnerExistsError } from "@liferoute/server/auth";
import { loadEnv, requireEnv } from "./lib/env";

/**
 * Provisions the single LifeRoute owner (docs/11_operations step 3). There is no public sign-up.
 * Usage: pnpm owner:create [--email you@example.com] [--name 이름]
 * The password is read interactively (or from LIFEROUTE_OWNER_PASSWORD for automation) and never logged.
 */
loadEnv();
requireEnv("DATABASE_URL");
requireEnv("BETTER_AUTH_SECRET");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const rl = createInterface({ input: stdin, output: stdout });
const email = arg("email") ?? (await rl.question("Owner email: "));
const name = arg("name") ?? ((await rl.question("Display name (Enter = 나): ")) || "나");
let password = process.env.LIFEROUTE_OWNER_PASSWORD ?? "";
if (!password) {
  password = await rl.question("Password (min 12 chars; input is visible, clear your terminal afterwards): ");
}
rl.close();

const { db, pool } = createDb(process.env.DATABASE_URL, 2);
try {
  const owner = await createOwner(createAuth(db), db, { email, name, password });
  console.log(`Owner created: ${owner.email}`);
} catch (error) {
  if (error instanceof OwnerExistsError) {
    console.error(error.message);
    process.exitCode = 2;
  } else {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
