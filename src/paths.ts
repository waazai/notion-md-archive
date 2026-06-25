import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";

const ILLEGAL = /[\\/:*?"<>|]/g;

/** Title -> filename-safe slug. Keeps unicode letters; lowercases ASCII. */
export function slug(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(ILLEGAL, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

/** Database name -> filesystem-safe folder name (keeps spaces & case). */
export function sanitizeFolder(name: string): string {
  return name.trim().replace(ILLEGAL, "").replace(/\.+$/, "") || "Untitled";
}

/** Expand a leading ~ to the home directory, then resolve to absolute. */
export function expandPath(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}
