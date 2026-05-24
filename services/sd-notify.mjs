// services/sd-notify.mjs
// Minimal sd_notify(3) client built on top of /usr/bin/systemd-notify.
//
// Node's node:dgram only supports udp4/udp6, so we can't write to $NOTIFY_SOCKET
// directly. Forking `systemd-notify --no-block` is the documented helper-script
// pattern. Cost: one fork per call (~ms), with ping cadence in tens of seconds.
//
// The service unit must use Type=notify and (when notifying from a helper) set
// NotifyAccess=all OR ensure we pass --pid=<main pid> so systemd accepts the
// message under NotifyAccess=main.

import { spawn } from 'node:child_process';

const NOTIFY_SOCKET = process.env.NOTIFY_SOCKET || '';
const MAIN_PID = process.pid;

function runNotify(args) {
  return new Promise((resolve) => {
    try {
      const child = spawn('/usr/bin/systemd-notify',
        ['--no-block', `--pid=${MAIN_PID}`, ...args],
        { stdio: 'ignore' });
      child.on('error', () => resolve(false));
      child.on('exit', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

export function isUnderSystemd() {
  return Boolean(NOTIFY_SOCKET);
}

export async function notifyReady(status = '') {
  if (!isUnderSystemd()) return false;
  const args = status ? ['--ready', `--status=${status}`] : ['--ready'];
  return runNotify(args);
}

export async function notifyWatchdog() {
  if (!isUnderSystemd()) return false;
  return runNotify(['WATCHDOG=1']);
}

export async function notifyStopping(status = '') {
  if (!isUnderSystemd()) return false;
  const args = status ? ['--stopping', `--status=${status}`] : ['--stopping'];
  return runNotify(args);
}

export async function notifyStatus(text) {
  if (!isUnderSystemd()) return false;
  return runNotify([`--status=${text}`]);
}

// Periodic WATCHDOG=1 pinger. `intervalMs` should be roughly half of the unit's
// WatchdogSec value (e.g. WatchdogSec=90 → ping every 30000ms). Returns a stop
// handle suitable for shutdown.
export function startWatchdogPinger(intervalMs) {
  if (!isUnderSystemd() || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return () => {};
  }
  const timer = setInterval(() => { notifyWatchdog(); }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
