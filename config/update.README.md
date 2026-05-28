/*
  config/update.json is intended to be templated by deployment systems per device group.

  channel values:
    - "latest" = stable production channel
    - "beta" = pre-release channel for early devices or preview builds

  healthCheckTimeoutMs:
    - milliseconds to wait before treating the startup health check as failed
    - use a higher value for slower or managed environments where startup may be delayed

  Deployment systems such as MDM, Intune, or SCCM should generate this file for each device group
  and set `channel` per release ring. Example:
    - stable office fleet: "latest"
    - preview / pilot group: "beta"
*/
