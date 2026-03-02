const EventEmitter = require('events');

const logEmitter = new EventEmitter();
const MAX_LOG_HISTORY = 100;
const logHistory = [];

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function broadcast(level, args) {
  const message = Array.from(args).map(a =>
    typeof a === 'object' ? JSON.stringify(a) : String(a)
  ).join(' ');
  const timestamp = new Date().toISOString().substring(11, 19);
  const entry = { level, message, timestamp };
  logHistory.push(entry);
  if (logHistory.length > MAX_LOG_HISTORY) logHistory.shift();
  logEmitter.emit('log', entry);
}

console.log = function () { broadcast('info', arguments); originalLog.apply(console, arguments); };
console.error = function () { broadcast('error', arguments); originalError.apply(console, arguments); };
console.warn = function () { broadcast('warn', arguments); originalWarn.apply(console, arguments); };

module.exports = { logEmitter, logHistory };
