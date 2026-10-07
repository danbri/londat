#!/usr/bin/env node
// Copied from danbri/glitchcan-minigam tools/check-skills.mjs on 2026-10-07, with the cwplans project; the same rule holds here.
// check-skills.mjs — is every skill in this repo actually DISCOVERABLE?
//
//   node tools/check-skills.mjs          # report
//   node tools/check-skills.mjs --fix    # create the missing symlinks
//
// WHY THIS EXISTS. On 2026-07-17 a session wrote four properly-formed skills
// for Lucid, put them in `lucid/skills/`, and left a README saying "symlink
// individual skills into your skills path". Nobody did. For nine days every
// session was told this project had two skills, both about FINK, while
// Lucid's 80 files and edot's 211 looked undocumented. On 2026-07-26 a fresh
// instance was asked what skills the repo had, answered "two", and added
// "nothing else repo-specific" — a confident negative that one `find` would
// have disproved.
//
// A skill nobody is offered is a comment in a file. So the rule is:
//
//   SKILLS LIVE NEXT TO THE CODE THEY DESCRIBE, at <area>/skills/<name>/,
//   AND ARE SYMLINKED INTO .claude/skills/ SO THE RUNTIME OFFERS THEM.
//
// Co-located because a skill is part of its subproject — extract `trees/`
// and its skill goes with it, and the person editing the code is looking at
// the right file. Symlinked rather than copied because two copies of a
// hard-won lesson diverge, and the stale one is the one you will read.
// `.claude/skills/` stays a pure index: real directories for repo-wide
// skills, symlinks for co-located ones.
//
// VERIFIED: Claude Code picks up a newly created symlink mid-session, with
// no restart.

import { readdir, readFile, symlink, lstat, realpath } from 'node:fs/promises';
import { join, relative, dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, '.claude', 'skills');
const FIX = process.argv.includes('--fix');
// NOT skipping `.claude` — the index's own resident skills must appear in the
// report too, or the count lies. Symlinked entries under it are not descended
// into, because `withFileTypes` reports a symlink as a symlink and not a
// directory, so nothing is counted twice.
const SKIP = new Set(['node_modules', '.git', 'third_party', 'vendor']);

/** Every SKILL.md in the tree, except the ones inside the index itself. */
async function findSkills(dir, out = []) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.claude') continue;
    if (SKIP.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) await findSkills(p, out);
    else if (e.name === 'SKILL.md') out.push(p);
  }
  return out;
}

/** `name` and `description` out of the YAML frontmatter, without a parser. */
async function frontmatter(file) {
  const text = await readFile(file, 'utf8');
  if (!text.startsWith('---')) return { error: 'no frontmatter' };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { error: 'unterminated frontmatter' };
  const head = text.slice(3, end);
  const name = /^name:\s*(.+)$/m.exec(head)?.[1]?.trim();
  const desc = /^description:\s*(?:>-\s*)?([\s\S]*?)(?=\n\w+:|$)/m.exec(head)?.[1];
  if (!name) return { error: 'no name in frontmatter' };
  if (!desc || !desc.trim()) return { error: 'no description in frontmatter' };
  return { name, description: desc.replace(/\s+/g, ' ').trim() };
}

const skills = await findSkills(ROOT);
let indexed = [];
try {
  indexed = await readdir(INDEX, { withFileTypes: true });
} catch {
  console.error('✖ no .claude/skills directory');
  process.exit(1);
}

// What the runtime will actually offer: a real dir or a symlink that resolves.
const offered = new Map();                 // realpath of SKILL.md -> index entry name
for (const e of indexed) {
  const p = join(INDEX, e.name, 'SKILL.md');
  try { offered.set(await realpath(p), e.name); } catch { /* dangling */ }
}

let problems = 0;
const rows = [];
for (const file of skills) {
  const rel = relative(ROOT, file);
  const inIndex = rel.startsWith(join('.claude', 'skills') + sep);
  const real = await realpath(file);
  const fm = await frontmatter(file);
  const discoverable = inIndex || offered.has(real);
  const home = relative(ROOT, dirname(file));

  if (fm.error) { problems++; rows.push(['✖', home, `MALFORMED: ${fm.error}`]); continue; }
  if (!discoverable) {
    problems++;
    rows.push(['✖', home, `NOT OFFERED — nothing in .claude/skills points at it`]);
    if (FIX) {
      const link = join(INDEX, fm.name);
      const target = relative(INDEX, dirname(file));
      try {
        await lstat(link);
        console.error(`  ! ${fm.name} already exists in the index and is not this skill — resolve by hand`);
      } catch {
        await symlink(target, link, 'dir');
        rows[rows.length - 1] = ['+', home, `LINKED as ${fm.name} -> ${target}`];
        problems--;
      }
    }
    continue;
  }
  rows.push(['✔', home, `${fm.name} (${fm.description.length} char description)`]);
}

// A dangling symlink is worse than a missing one: the index claims a skill
// that cannot load.
for (const e of indexed) {
  const p = join(INDEX, e.name, 'SKILL.md');
  try { await realpath(p); } catch {
    problems++;
    rows.push(['✖', join('.claude/skills', e.name), 'DANGLING — index entry resolves to nothing']);
  }
}

const w = Math.max(...rows.map(r => r[1].length), 10);
for (const [mark, home, note] of rows.sort((a, b) => a[1].localeCompare(b[1]))) {
  console.log(`${mark} ${home.padEnd(w)}  ${note}`);
}
console.log(`\n${skills.length} SKILL.md in the tree · ` +
            `${rows.filter(r => r[0] === '✔').length} discoverable · ` +
            `${problems} problem(s)`);
if (problems && !FIX) console.log('run with --fix to create the missing symlinks');
process.exit(problems ? 1 : 0);
