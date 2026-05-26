const IPC_CONTRACT_VERSION = 1;

const IPC_CHANNELS = {
  captureResponse: 'ipc:capture-response',
  trayCommand: 'ipc:tray-command',
  logView: 'ipc:log-view',
  robotRunnerAction: 'ipc:robot-runner-action',
  healthGet: 'health:get',
  logEvent: 'log:event',
  browserSwitchPlatform: 'browser:switchPlatform',
  browserSetVisible: 'browser:setVisible',
  browserNavigate: 'browser:navigate',
};

const ipcContract = {
  version: IPC_CONTRACT_VERSION,
  channels: IPC_CHANNELS,
};

module.exports = {
  IPC_CONTRACT_VERSION,
  IPC_CHANNELS,
  ipcContract,
};
