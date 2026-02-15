/**
 * App‑integration shell commands:
 *   ps, theme
 */

import type { Process } from '@/shared/types';

export interface AppsContext {
  getProcesses: () => Process[];
  setTheme: (name: string) => boolean;
}

type CmdFn = (args: string[], ctx: AppsContext) => Promise<string>;

const ps: CmdFn = async (_args, ctx) => {
  const procs = ctx.getProcesses();
  if (!procs.length) return 'No running processes.';
  const header = `${'PID'.padEnd(12)} ${'APP'.padEnd(16)} ${'STATUS'.padEnd(12)} ${'MEMORY'}`;
  const rows = procs.map(p =>
    `${p.id.padEnd(12)} ${p.appId.padEnd(16)} ${p.status.padEnd(12)} ${p.memoryUsage}B`
  );
  return [header, ...rows].join('\n');
};

const theme: CmdFn = async (args, ctx) => {
  if (!args[0]) return 'Usage: theme <name>';
  const ok = ctx.setTheme(args[0]);
  if (ok) return `Theme switched to '${args[0]}'.`;
  return `theme: '${args[0]}' not found. Available: midnight, paper, retro`;
};

export const appsCommands: Record<string, CmdFn> = { ps, theme };
