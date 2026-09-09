#!/usr/bin/env node
// @ts-check
/**
 * npm run dev
 *
 * Runs the API and the web app together, with each line of output labelled so
 * you can tell which one is complaining. Ctrl-C stops both.
 *
 * Hand-written instead of pulling in a task runner: it is forty lines, it
 * behaves the same on macOS and Windows, and it is one less dependency that
 * can fail to install on somebody's laptop.
 */

import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';

const tasks = [
  { name: 'api', color: '\u001b[36m', args: ['run', 'dev:api'] },
  { name: 'web', color: '\u001b[35m', args: ['run', 'dev:web'] },
];

const RESET = '\u001b[0m';
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

/** @type {import('node:child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function label(task) {
  const text = task.name.padEnd(3);
  return useColor ? `${task.color}${text}${RESET} | ` : `${text} | `;
}

function prefixLines(task, stream, write) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) write(`${label(task)}${line}\n`);
  });
  stream.on('end', () => {
    if (buffer) write(`${label(task)}${buffer}\n`);
  });
}

function stopAll(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  process.exitCode = code;
}

for (const task of tasks) {
  const child = spawn(npm, task.args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
  });

  children.push(child);
  if (child.stdout) prefixLines(task, child.stdout, (text) => process.stdout.write(text));
  if (child.stderr) prefixLines(task, child.stderr, (text) => process.stderr.write(text));

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.log(`\n${task.name} exited (${signal ?? `code ${code}`}). Stopping the other process too.`);
    stopAll(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`${label(task)}could not start: ${error.message}`);
    stopAll(1);
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stopAll(0));
}

console.log(
  'Starting the API and the web app. Ctrl-C stops both.\n' +
    '  api  http://127.0.0.1:3001/api/health\n' +
    '  web  http://localhost:5173\n',
);
