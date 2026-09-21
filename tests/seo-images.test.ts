import { readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

describe('SEO y estabilidad de imágenes', () => {
  it('declara alt, dimensiones, carga y decodificación en todos los img React', () => {
    const failures: string[] = [];
    let imageCount = 0;

    for (const file of sourceFiles('src').filter((path) => ['.tsx', '.jsx'].includes(extname(path)))) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<img\b[\s\S]*?>/gu)) {
        imageCount += 1;
        const tag = match[0];
        const line = source.slice(0, match.index).split('\n').length;
        const missing = [
          !/\balt\s*=/u.test(tag) && 'alt',
          !/\bwidth\s*=/u.test(tag) && 'width',
          !/\bheight\s*=/u.test(tag) && 'height',
          !/\bloading\s*=/u.test(tag) && 'loading',
          !/\bdecoding\s*=/u.test(tag) && 'decoding',
        ].filter(Boolean);
        if (missing.length > 0) {
          failures.push(`${relative('.', file)}:${line} falta ${missing.join(', ')}`);
        }
      }
    }

    expect(imageCount).toBeGreaterThan(0);
    expect(failures).toEqual([]);
  });
});
