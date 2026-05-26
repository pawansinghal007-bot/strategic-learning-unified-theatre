import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  IPC_CHANNELS,
  IPC_CONTRACT_VERSION,
  type IpcEnvelope,
  type IpcErrorCode,
} from '../../shared/ipc/contract';
import { createLogger } from '../../logger.js';

const log = createLogger('ipc-adapter');

export type Validator<T> = (value: unknown) => value is T;

export type HandlerEntry<T> = {
  validate: Validator<T>;
  run: (payload: T, event: IpcMainInvokeEvent) => Promise<unknown> | unknown;
};

export type HandlerMap = Partial<
  Record<
    (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS],
    Record<string, HandlerEntry<any>>
  >
>;

function reject(code: IpcErrorCode, channel: string, detail: string) {
  log.warn('ipc.rejected', { code, channel, detail });
  return { ok: false, code, detail };
}

function isEnvelope(value: unknown): value is IpcEnvelope<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function registerIpcHandlers(handlers: HandlerMap): void {
  for (const channel of Object.keys(handlers) as Array<keyof HandlerMap>) {
    ipcMain.handle(channel, async (event, envelope) => {
      if (!isEnvelope(envelope)) {
        return reject('IPC_INVALID_PAYLOAD', channel, 'Missing or invalid IPC envelope');
      }

      const msg = envelope as Partial<IpcEnvelope<string, unknown>>;

      if (msg.v !== IPC_CONTRACT_VERSION) {
        return reject('IPC_DEPRECATED_OPERATION', channel, 'Unsupported IPC contract version');
      }

      const channelHandlers = handlers[channel];

      if (!channelHandlers || typeof msg.op !== 'string' || !(msg.op in channelHandlers)) {
        return reject('IPC_UNKNOWN_OPERATION', channel, 'Unknown IPC operation');
      }

      const entry = channelHandlers[msg.op];

      if (!entry.validate(msg.payload)) {
        return reject('IPC_INVALID_PAYLOAD', channel, 'Invalid IPC payload');
      }

      log.info('ipc.dispatch', { channel, op: msg.op });
      return await entry.run(msg.payload, event);
    });
  }
}
