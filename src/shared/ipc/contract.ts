export const IPC_CONTRACT_VERSION = 1 as const;

export const IPC_CHANNELS = {
  /** Receives captured browser response payloads from isolated capture contexts. */
  captureResponse: 'ipc:capture-response',
  /** Sends tray-originated commands into the application control surface. */
  trayCommand: 'ipc:tray-command',
  /** Requests log-view operations from the renderer. */
  logView: 'ipc:log-view',
  /** Requests robot runner actions from the renderer. */
  robotRunnerAction: 'ipc:robot-runner-action',
  /** Fetches the aggregate application health model. */
  healthGet: 'health:get',
  /** Streams structured log entries from main to renderer. */
  logEvent: 'log:event',
  /** Switches the embedded browser pane to a named platform. */
  browserSwitchPlatform: 'browser:switchPlatform',
  /** Toggles embedded browser pane visibility. */
  browserSetVisible: 'browser:setVisible',
  /** Navigates the embedded browser pane to a URL. */
  browserNavigate: 'browser:navigate',
} as const;

export type IpcChannelName = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

export type IpcErrorCode =
  | 'IPC_UNKNOWN_OPERATION'
  | 'IPC_DEPRECATED_OPERATION'
  | 'IPC_INVALID_PAYLOAD'
  | 'IPC_UNAUTHORIZED_PAYLOAD';

export type IpcEnvelope<TOp extends string, TPayload> = {
  v: typeof IPC_CONTRACT_VERSION;
  op: TOp;
  payload: TPayload;
};

export const ipcContract = {
  version: IPC_CONTRACT_VERSION,
  channels: IPC_CHANNELS,
} as const;
