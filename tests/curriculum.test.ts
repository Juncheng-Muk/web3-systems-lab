import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { modules } from '../src/data/curriculum';

describe('training deliverable integrity', () => {
  it('has twelve ordered weeks with real code, runnable commands and acceptance criteria', () => {
    expect(modules.map((m) => m.week)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(new Set(modules.map((m) => m.id)).size).toBe(12);
    for (const module of modules) {
      expect(module.tasks.length).toBeGreaterThanOrEqual(3);
      expect(module.acceptance.length).toBeGreaterThanOrEqual(2);
      expect(module.command).toMatch(/^pnpm /);
      for (const file of module.files) expect(existsSync(file), `${module.id}: ${file}`).toBe(true);
      for (const resource of module.resources)
        expect(new URL(resource.url).protocol).toBe('https:');
    }
  });
});
