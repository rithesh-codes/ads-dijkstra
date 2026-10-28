// JSON-file persistence. data/store.json holds the live data. On the first run (or after
// "Reset to demo data") it is copied from data/demo_data.json. Writes go to a temp file
// that is then renamed over the real file, so a crash never leaves half-written JSON.
import fs from "node:fs";
import path from "node:path";
import type { StoreData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

export function storePath(): string {
  return process.env.ROUTE_STORE_PATH ?? path.join(DATA_DIR, "store.json");
}

export function demoPath(): string {
  return process.env.ROUTE_DEMO_PATH ?? path.join(DATA_DIR, "demo_data.json");
}

export function loadDemo(): StoreData {
  return JSON.parse(fs.readFileSync(demoPath(), "utf8")) as StoreData;
}

export function loadStore(): StoreData {
  const file = storePath();
  if (!fs.existsSync(file)) {
    const demo = loadDemo();
    saveStore(demo);
    return demo;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as StoreData;
  } catch {
    // A corrupted store file is kept as a backup and replaced with the demo data.
    fs.copyFileSync(file, `${file}.corrupt-${Date.now()}.bak`);
    const demo = loadDemo();
    saveStore(demo);
    return demo;
  }
}

export function saveStore(data: StoreData): void {
  const file = storePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function resetToDemo(): StoreData {
  const demo = loadDemo();
  saveStore(demo);
  return demo;
}

// Load, modify, and save in one step. The callback can throw to abort without saving.
export function mutateStore<T>(fn: (data: StoreData) => T): { data: StoreData; result: T } {
  const data = loadStore();
  const result = fn(data);
  saveStore(data);
  return { data, result };
}
