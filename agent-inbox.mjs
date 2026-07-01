#!/usr/bin/env node

/**
 * agent-inbox.mjs — Lightweight CLI queue for deferred HITL tasks.
 * Supports: add, list, done.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';

const INBOX_PATH = 'data/agent-inbox.md';
const SKELETON = `# Agent Inbox

Pending follow-up and human-in-the-loop tasks.

| ID | Added | Task | Status |
|----|-------|------|--------|
`;

function getInboxTasks() {
  if (!existsSync(INBOX_PATH)) return [];
  const content = readFileSync(INBOX_PATH, 'utf-8');
  const lines = content.split('\n');
  const tasks = [];
  for (const line of lines) {
    const match = line.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (match) {
      tasks.push({
        id: parseInt(match[1]),
        added: match[2].trim(),
        task: match[3].trim(),
        status: match[4].trim(),
        originalLine: line
      });
    }
  }
  return tasks;
}

function saveInboxTasks(tasks) {
  let content = SKELETON;
  for (const t of tasks) {
    content += `| ${t.id} | ${t.added} | ${t.task} | ${t.status} |\n`;
  }
  writeFileSync(INBOX_PATH, content, 'utf-8');
}

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    console.log('Usage:');
    console.log('  node agent-inbox.mjs add "<task>"  → Add a new task');
    console.log('  node agent-inbox.mjs list          → List all pending tasks');
    console.log('  node agent-inbox.mjs done <id>     → Mark a task as done');
    process.exit(0);
  }

  if (cmd === 'add') {
    const taskText = args.slice(1).join(' ').trim();
    if (!taskText) {
      console.error('Error: Task text is required.');
      process.exit(1);
    }
    const tasks = getInboxTasks();
    const nextId = tasks.reduce((max, t) => t.id > max ? t.id : max, 0) + 1;
    const today = new Date().toISOString().slice(0, 10);
    
    tasks.push({
      id: nextId,
      added: today,
      task: taskText,
      status: 'Pending'
    });
    saveInboxTasks(tasks);
    console.log(`Added task #${nextId} to inbox: "${taskText}"`);
    process.exit(0);
  }

  if (cmd === 'list') {
    const tasks = getInboxTasks().filter(t => t.status.toLowerCase() === 'pending');
    if (tasks.length === 0) {
      console.log('No pending tasks in agent inbox.');
      process.exit(0);
    }
    console.log('ID   | Added      | Task');
    console.log('-----+------------+--------------------------------------');
    for (const t of tasks) {
      console.log(`${String(t.id).padEnd(4)} | ${t.added.padEnd(10)} | ${t.task}`);
    }
    process.exit(0);
  }

  if (cmd === 'done') {
    const targetId = parseInt(args[1]);
    if (isNaN(targetId)) {
      console.error('Error: Task ID must be a number.');
      process.exit(1);
    }
    const tasks = getInboxTasks();
    const task = tasks.find(t => t.id === targetId);
    if (!task) {
      console.error(`Error: Task #${targetId} not found.`);
      process.exit(1);
    }
    if (task.status.toLowerCase() === 'done') {
      console.log(`Task #${targetId} is already marked as done.`);
      process.exit(0);
    }
    task.status = 'Done';
    saveInboxTasks(tasks);
    console.log(`Marked task #${targetId} as done.`);
    process.exit(0);
  }

  console.error(`Unknown command: ${cmd}`);
  process.exit(1);
}

main();
