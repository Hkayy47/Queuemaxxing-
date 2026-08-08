import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import type { WalEvent } from "./types.js";

export class WAL {
  private fd: number | null = null;
  private readonly walPath: string;
  private readonly dirPath: string;

  constructor(dataDir: string, queueName: string) {
    this.dirPath = path.join(dataDir, "queues", queueName);
    this.walPath = path.join(this.dirPath, "wal.log");
  }

  async open(): Promise<void> {
    await fsp.mkdir(this.dirPath, { recursive: true });
    this.fd = fs.openSync(this.walPath, "a");
  }

  async close(): Promise<void> {
    if (this.fd !== null) {
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  async append(event: WalEvent): Promise<void> {
    if (this.fd === null) throw new Error("WAL not open");
    const line = JSON.stringify(event) + "\n";
    const buf = Buffer.from(line, "utf8");
    fs.writeSync(this.fd, buf);
    fs.fsyncSync(this.fd);
  }

  async replay(): Promise<WalEvent[]> {
    try {
      const raw = await fsp.readFile(this.walPath, "utf8");
      const events: WalEvent[] = [];
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed) as WalEvent);
        } catch {
          // skip corrupted lines
        }
      }
      return events;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  async deleteDir(): Promise<void> {
    await this.close();
    await fsp.rm(this.dirPath, { recursive: true, force: true });
  }
}
