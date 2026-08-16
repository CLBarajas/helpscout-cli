#!/usr/bin/env bun

/**
 * Builds a Claude Code Skill that bundles a standalone `helpscout` binary.
 *
 * Output: dist/skill/helpscout/
 *   SKILL.md              from skill/SKILL.md, with placeholders substituted
 *   bin/helpscout         standalone executable compiled from dist/cli.js
 *   references/*.md       command reference generated from the CLI's own --help
 *
 * Usage:
 *   bun scripts/build-skill.ts [--target <bun-target>] [--out <dir>] [--install]
 *
 * `--target` accepts any Bun compile target (bun-darwin-arm64, bun-linux-x64,
 * bun-windows-x64, ...) and defaults to the host platform.
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SKILL_NAME = 'helpscout';

interface Args {
  target?: string;
  out: string;
  install: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { out: join(ROOT, 'dist', 'skill', SKILL_NAME), install: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target') {
      args.target = argv[++i];
    } else if (arg === '--out') {
      args.out = resolve(argv[++i] ?? '');
    } else if (arg === '--install') {
      args.install = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

async function run(cmd: string[], label: string): Promise<void> {
  const proc = Bun.spawn(cmd, { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`${label} failed (exit ${code})`);
  }
}

/** Runs the built CLI and captures stdout. Help output goes to stdout for commander. */
async function cliHelp(path: string[]): Promise<string> {
  const proc = Bun.spawn([process.execPath, join(ROOT, 'dist', 'cli.js'), ...path, '--help'], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  if (code !== 0) {
    throw new Error(`helpscout ${path.join(' ')} --help failed (exit ${code})`);
  }
  return stdout.trimEnd();
}

/**
 * Extracts subcommand names from a commander help screen. Commands are listed
 * one per line under a `Commands:` heading, indented, with the name first.
 */
function parseSubcommands(help: string): string[] {
  const lines = help.split('\n');
  const start = lines.findIndex((line) => line.trim() === 'Commands:');
  if (start === -1) {
    return [];
  }

  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') {
      break;
    }
    // Continuation lines of a wrapped description are indented further than the
    // command column, so only take names at the expected indent.
    const match = /^ {2}(\S+)/.exec(line);
    if (match && match[1] !== 'help') {
      names.push(match[1]);
    }
  }
  return names;
}

function helpBlock(path: string[], help: string): string {
  return `## helpscout ${path.join(' ')}\n\n\`\`\`\n${help}\n\`\`\`\n`;
}

/** Writes one reference file per top-level command group. */
async function generateReferences(outDir: string): Promise<string[]> {
  const rootHelp = await cliHelp([]);
  const groups = parseSubcommands(rootHelp);

  await mkdir(join(outDir, 'references'), { recursive: true });

  for (const group of groups) {
    const groupHelp = await cliHelp([group]);
    const sections = [helpBlock([group], groupHelp)];

    for (const sub of parseSubcommands(groupHelp)) {
      sections.push(helpBlock([group, sub], await cliHelp([group, sub])));
    }

    const body = [
      `# helpscout ${group}`,
      '',
      'Generated from the CLI\'s own `--help` output. Every flag below is accurate',
      'for the bundled binary.',
      '',
      sections.join('\n'),
    ].join('\n');

    await writeFile(join(outDir, 'references', `${group}.md`), body);
  }

  await writeFile(
    join(outDir, 'references', 'global-options.md'),
    `# Global options\n\nFlags below apply to every command and go before the subcommand.\n\n\`\`\`\n${rootHelp}\n\`\`\`\n`,
  );

  return groups;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const entry = join(ROOT, 'dist', 'cli.js');
  if (!existsSync(entry)) {
    throw new Error('dist/cli.js not found. Run `bun run build` first.');
  }

  const { version } = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf-8'));

  await rm(args.out, { recursive: true, force: true });
  await mkdir(join(args.out, 'bin'), { recursive: true });

  const binaryName = args.target?.includes('windows') ? 'helpscout.exe' : 'helpscout';
  const binaryPath = join(args.out, 'bin', binaryName);

  console.log(`Compiling ${binaryName} (${args.target ?? 'host platform'})...`);
  await run(
    [
      'bun',
      'build',
      entry,
      '--compile',
      ...(args.target ? [`--target=${args.target}`] : []),
      '--outfile',
      binaryPath,
    ],
    'bun build --compile',
  );

  console.log('Generating command reference...');
  const groups = await generateReferences(args.out);

  const template = await readFile(join(ROOT, 'skill', 'SKILL.md'), 'utf-8');
  const referenceIndex = groups
    .map((group) => `- \`${group}\` — \`references/${group}.md\``)
    .join('\n');
  const skillMd = template
    .replaceAll('{{VERSION}}', version)
    .replaceAll('{{BINARY_NAME}}', binaryName)
    .replaceAll('{{REFERENCE_INDEX}}', referenceIndex);

  if (skillMd.includes('{{')) {
    throw new Error('SKILL.md still contains unsubstituted placeholders');
  }
  await writeFile(join(args.out, 'SKILL.md'), skillMd);

  const size = Bun.file(binaryPath).size;
  console.log(`\nSkill built: ${args.out}`);
  console.log(`  binary: bin/${binaryName} (${(size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`  references: ${groups.length + 1} files`);

  if (args.install) {
    const dest = join(homedir(), '.claude', 'skills', SKILL_NAME);
    await rm(dest, { recursive: true, force: true });
    await mkdir(join(homedir(), '.claude', 'skills'), { recursive: true });
    await cp(args.out, dest, { recursive: true });
    console.log(`\nInstalled to ${dest}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
