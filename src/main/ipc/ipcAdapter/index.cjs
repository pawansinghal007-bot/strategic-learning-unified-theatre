const { ipcMain } = require('electron');
const { IPC_CHANNELS, IPC_CONTRACT_VERSION } = require('../../../shared/ipc/contract');
const { createLogger } = require('../../../logger.js');

const log = createLogger('ipc-adapter');

function reject(code, channel, detail) {
  log.warn('ipc.rejected', { code, channel, detail });
  return { ok: false, code, detail };
}

function isEnvelope(value) {
  return typeof value === 'object' && value !== null;
}

function registerIpcHandlers(handlers) {
  for (const channel of Object.keys(handlers)) {
    ipcMain.handle(channel, async (event, envelope) => {
      if (!isEnvelope(envelope)) {
        return reject('IPC_INVALID_PAYLOAD', channel, 'Missing or invalid IPC envelope');
      }

      if (envelope.v !== IPC_CONTRACT_VERSION) {
        return reject('IPC_DEPRECATED_OPERATION', channel, 'Unsupported IPC contract version');
      }

      const channelHandlers = handlers[channel];

      if (!channelHandlers || typeof envelope.op !== 'string' || !(envelope.op in channelHandlers)) {
        return reject('IPC_UNKNOWN_OPERATION', channel, 'Unknown IPC operation');
      }

      const entry = channelHandlers[envelope.op];

      if (!entry.validate(envelope.payload)) {
        return reject('IPC_INVALID_PAYLOAD', channel, 'Invalid IPC payload');
      }

      log.info('ipc.dispatch', { channel, op: envelope.op });
      return await entry.run(envelope.payload, event);
    });
  }
}

module.exports = {
  registerIpcHandlers,
  IPC_CHANNELS,
};
