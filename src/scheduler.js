const { downloadFiles } = require('./downloader');
const { readCredentials } = require('./config');

// Map of clientId => { intervalId, nextRunAt, intervalMinutes }
const schedulers = {};

function getStatus(clientId) {
  const s = schedulers[clientId];
  if (!s) return { running: false, nextRunAt: null, intervalMinutes: null };
  return { running: true, nextRunAt: s.nextRunAt, intervalMinutes: s.intervalMinutes };
}

function getAllStatuses() {
  const result = {};
  for (const id of Object.keys(schedulers)) {
    result[id] = getStatus(id);
  }
  return result;
}

async function _runDownload(client) {
  const credentials = readCredentials();
  console.log(`[Scheduler:${client.id}] ⏰ Triggering download for "${client.label || client.id}"...`);
  try {
    await downloadFiles(client, credentials);
  } catch (err) {
    console.error(`[Scheduler:${client.id}] Error:`, err.message);
  }
}

function start(client) {
  const { id, intervalMinutes } = client;
  const mins = parseInt(intervalMinutes, 10);

  if (!mins || mins < 1 || mins > 60) {
    console.warn(`[Scheduler:${id}] Invalid interval "${intervalMinutes}". Must be 1–60.`);
    return false;
  }

  // Stop existing scheduler if any
  stop(id);

  const ms = mins * 60 * 1000;
  const nextRunAt = Date.now() + ms;

  const intervalId = setInterval(() => {
    schedulers[id].nextRunAt = Date.now() + ms;
    _runDownload(client);
  }, ms);

  schedulers[id] = { intervalId, nextRunAt, intervalMinutes: mins };

  const nextStr = new Date(nextRunAt).toLocaleTimeString('th-TH');
  console.log(`[Scheduler:${id}] ✅ Started — every ${mins} min. Next run at ${nextStr}.`);
  return true;
}

function stop(clientId) {
  if (schedulers[clientId]) {
    clearInterval(schedulers[clientId].intervalId);
    delete schedulers[clientId];
    console.log(`[Scheduler:${clientId}] ⏹ Stopped.`);
    return true;
  }
  return false;
}

function stopAll() {
  for (const id of Object.keys(schedulers)) stop(id);
}

module.exports = { start, stop, stopAll, getStatus, getAllStatuses };
