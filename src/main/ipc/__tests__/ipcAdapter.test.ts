import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcMain } from 'electron';
import { IPC_CHANNELS, IPC_CONTRACT_VERSION } from '../../../shared/ipc/contract';
import { registerIpcHandlers, type HandlerMap } from '../ipcAdapter';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

function createHandlers(run = vi.fn((payload) => ({ ok: true, payload }))) {
  return {
    [IPC_CHANNELS.healthGet]: {
      read: {
        validate: (value: unknown): value is { id: string } =>
          typeof value === 'object' &&
          value !== null &&
          typeof (value as { id?: unknown }).id === 'string',
        run,
      },
    },
  } as Partial<HandlerMap> as HandlerMap;
}

function getRegisteredHandler() {
  registerIpcHandlers(createHandlers());
  return vi.mocked(ipcMain.handle).mock.calls.find(
    ([channel]) => channel === IPC_CHANNELS.healthGet,
  )?.[1] as (event: unknown, envelope: unknown) => Promise<unknown>;
}

describe('ipcAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('registerIpcHandlers is a function', () => {
    expect(registerIpcHandlers).toBeTypeOf('function');
  });

  it('calls entry.run and returns its result for a valid envelope with a known op', async () => {
    const run = vi.fn(() => ({ ok: true }));
    const handlers = createHandlers(run);
    registerIpcHandlers(handlers);
    const listener = vi.mocked(ipcMain.handle).mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.healthGet,
    )?.[1] as (event: unknown, envelope: unknown) => Promise<unknown>;
    const event = { sender: {} };

    const result = await listener(event, {
      v: IPC_CONTRACT_VERSION,
      op: 'read',
      payload: { id: 'main' },
    });

    expect(run).toHaveBeenCalledWith({ id: 'main' }, event);
    expect(result).toEqual({ ok: true });
  });

  it('rejects an unknown op', async () => {
    const listener = getRegisteredHandler();

    await expect(
      listener({}, { v: IPC_CONTRACT_VERSION, op: 'missing', payload: { id: 'main' } }),
    ).resolves.toMatchObject({ ok: false, code: 'IPC_UNKNOWN_OPERATION' });
  });

  it('rejects a deprecated version', async () => {
    const listener = getRegisteredHandler();

    await expect(listener({}, { v: 0, op: 'read', payload: { id: 'main' } })).resolves.toMatchObject({
      ok: false,
      code: 'IPC_DEPRECATED_OPERATION',
    });
  });

  it('rejects an invalid payload', async () => {
    const listener = getRegisteredHandler();

    await expect(
      listener({}, { v: IPC_CONTRACT_VERSION, op: 'read', payload: { id: 1 } }),
    ).resolves.toMatchObject({ ok: false, code: 'IPC_INVALID_PAYLOAD' });
  });

  it('rejects a missing envelope', async () => {
    const listener = getRegisteredHandler();

    await expect(listener({}, undefined)).resolves.toMatchObject({
      ok: false,
      code: 'IPC_INVALID_PAYLOAD',
    });
  });
});
