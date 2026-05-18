/**
 * File-backed persistence layer
 *
 * Replaces in-memory Maps with JSON file stores that survive restarts.
 * Simple, no DB dependency. Migration to PostgreSQL is straightforward.
 *
 * @rule:XSHT-022 Audit trail must survive restarts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = process.env['XSHIELD_DATA_DIR'] || join(process.cwd(), '.data');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

export class FileBackedMap<V> {
  private map: Map<string, V>;
  private filePath: string;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string) {
    this.filePath = join(DATA_DIR, `${name}.json`);
    this.map = new Map();
    this.load();
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8');
        const entries: [string, V][] = JSON.parse(raw);
        this.map = new Map(entries);
      } catch {
        // Corrupted file — start fresh but don't delete (might be recoverable)
        this.map = new Map();
      }
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    // Debounce: save at most every 500ms
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
        this.flushTimer = null;
      }, 500);
    }
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      const entries = Array.from(this.map.entries());
      writeFileSync(this.filePath, JSON.stringify(entries, null, 2));
      this.dirty = false;
    } catch (err) {
      console.error(`[file-store] Failed to save ${this.filePath}:`, err);
    }
  }

  get(key: string): V | undefined {
    return this.map.get(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  set(key: string, value: V): this {
    this.map.set(key, value);
    this.scheduleSave();
    return this;
  }

  delete(key: string): boolean {
    const result = this.map.delete(key);
    if (result) this.scheduleSave();
    return result;
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[string, V]> {
    return this.map.entries();
  }

  get size(): number {
    return this.map.size;
  }

  filter(predicate: (value: V) => boolean): V[] {
    return Array.from(this.map.values()).filter(predicate);
  }
}

export class FileBackedArray<V> {
  private items: V[];
  private filePath: string;
  private dirty = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(name: string) {
    this.filePath = join(DATA_DIR, `${name}.json`);
    this.items = [];
    this.load();
  }

  private load(): void {
    if (existsSync(this.filePath)) {
      try {
        const raw = readFileSync(this.filePath, 'utf-8');
        this.items = JSON.parse(raw);
      } catch {
        this.items = [];
      }
    }
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flush();
        this.flushTimer = null;
      }, 500);
    }
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      writeFileSync(this.filePath, JSON.stringify(this.items, null, 2));
      this.dirty = false;
    } catch (err) {
      console.error(`[file-store] Failed to save ${this.filePath}:`, err);
    }
  }

  push(item: V): void {
    this.items.push(item);
    this.scheduleSave();
  }

  filter(predicate: (item: V) => boolean): V[] {
    return this.items.filter(predicate);
  }

  find(predicate: (item: V) => boolean): V | undefined {
    return this.items.find(predicate);
  }

  slice(start?: number, end?: number): V[] {
    return this.items.slice(start, end);
  }

  get length(): number {
    return this.items.length;
  }
}
