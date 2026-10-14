// Plan §8.1 / §9 gate — the two Prisma schemas must stay in lockstep:
// `prisma/schema.prisma` (SQLite dev/test) vs `prisma/schema.pg.prisma`
// (Postgres/Neon). No migrations exist (`db:push` only), so drift between the
// two files silently breaks whichever client is not regenerated.
//
// The only intentional difference is enums: PG declares real `enum` blocks,
// SQLite stores the same values as `String`. Everything else — model set,
// field set, nullability, list-ness, @unique flags — must be identical.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type Field = { base: string; optional: boolean; list: boolean; unique: boolean };
type Parsed = { models: Map<string, Map<string, Field>>; enums: Set<string> };

function parseSchema(source: string): Parsed {
  // Drop line comments so commented-out fields never count.
  const clean = source.replace(/\/\/[^\n]*/g, "");

  const enums = new Set<string>();
  for (const m of clean.matchAll(/\benum\s+(\w+)\s*\{[^}]*\}/g)) enums.add(m[1]);

  const models = new Map<string, Map<string, Field>>();
  for (const m of clean.matchAll(/\bmodel\s+(\w+)\s*\{([^}]*)\}/g)) {
    const fields = new Map<string, Field>();
    for (const raw of m[2].split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("@@")) continue; // blank / block-level directives
      const [name, typeRaw] = line.split(/\s+/);
      if (!name || !typeRaw) continue;
      const optional = typeRaw.endsWith("?");
      const list = typeRaw.endsWith("[]") || typeRaw.endsWith("[]?");
      const base = typeRaw.replace(/\?$/, "").replace(/\[\]$/, "");
      fields.set(name, { base, optional, list, unique: line.includes("@unique") });
    }
    models.set(m[1], fields);
  }
  return { models, enums };
}

const sqlite = parseSchema(
  readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8")
);
const pg = parseSchema(
  readFileSync(path.resolve(process.cwd(), "prisma/schema.pg.prisma"), "utf8")
);

/** PG enum type vs SQLite String is the sanctioned difference. */
function typesMatch(sqliteBase: string, pgBase: string): boolean {
  if (sqliteBase === pgBase) return true;
  return pg.enums.has(pgBase) && sqliteBase === "String";
}

describe("Prisma schema parity (SQLite ↔ Postgres)", () => {
  it("parses both schemas (sanity)", () => {
    expect(sqlite.models.size).toBeGreaterThan(0);
    expect(pg.models.size).toBe(sqlite.models.size);
    expect(pg.enums.size).toBeGreaterThan(0); // PG declares enums; SQLite has none by design
    expect(sqlite.enums.size).toBe(0);
  });

  it("declares the same models in both schemas", () => {
    const onlySqlite = [...sqlite.models.keys()].filter((m) => !pg.models.has(m));
    const onlyPg = [...pg.models.keys()].filter((m) => !sqlite.models.has(m));
    expect({ onlySqlite, onlyPg }).toEqual({ onlySqlite: [], onlyPg: [] });
  });

  it("declares the same fields on every model", () => {
    const drift: string[] = [];
    for (const [model, fields] of sqlite.models) {
      const pgFields = pg.models.get(model)!;
      for (const name of fields.keys()) {
        if (!pgFields.has(name)) drift.push(`${model}.${name}: only in schema.prisma`);
      }
      for (const name of pgFields.keys()) {
        if (!fields.has(name)) drift.push(`${model}.${name}: only in schema.pg.prisma`);
      }
    }
    expect(drift).toEqual([]);
  });

  it("keeps field types, list-ness, and nullability in lockstep", () => {
    const drift: string[] = [];
    for (const [model, fields] of sqlite.models) {
      const pgFields = pg.models.get(model)!;
      for (const [name, sField] of fields) {
        const pField = pgFields.get(name);
        if (!pField) continue; // reported by the field-set test
        if (!typesMatch(sField.base, pField.base)) {
          drift.push(`${model}.${name}: type ${sField.base} vs ${pField.base}`);
        }
        if (sField.optional !== pField.optional) {
          drift.push(`${model}.${name}: optional ${sField.optional} vs ${pField.optional}`);
        }
        if (sField.list !== pField.list) {
          drift.push(`${model}.${name}: list ${sField.list} vs ${pField.list}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("marks the same fields @unique in both schemas", () => {
    const drift: string[] = [];
    for (const [model, fields] of sqlite.models) {
      const pgFields = pg.models.get(model)!;
      for (const [name, sField] of fields) {
        const pField = pgFields.get(name);
        if (!pField) continue;
        if (sField.unique !== pField.unique) {
          drift.push(`${model}.${name}: @unique ${sField.unique} vs ${pField.unique}`);
        }
      }
    }
    expect(drift).toEqual([]);
  });

  it("only uses enum types that the PG schema actually declares", () => {
    const undeclared: string[] = [];
    for (const [model, fields] of pg.models) {
      for (const [name, field] of fields) {
        if (field.base === "String") continue;
        const isModel = pg.models.has(field.base);
        const isBuiltin = ["Int", "Float", "Boolean", "DateTime", "Json", "Bytes", "Decimal"].includes(
          field.base
        );
        if (!isModel && !isBuiltin && !pg.enums.has(field.base)) {
          undeclared.push(`${model}.${name}: ${field.base}`);
        }
      }
    }
    expect(undeclared).toEqual([]);
  });
});
