# Enterprise Release Checklist — UnifiedTheatre

## 1. Inputs
- Version tag: `v<semver>` for the release being deployed.
- Artifact download URL: the published installer location for Windows and Linux.
- SHA256SUMS: checksum manifest for all published artifacts.
- Optional GPG signature: digitally sign the artifact manifest if required by policy.
- Release notes and channel designation so pilot and broad rollout groups know the expected behavior.

## 2. Pre-deployment validation
- Verify SHA256 checksums for each downloaded installer against `SHA256SUMS`.
- On Windows, verify installer publisher and digital signature match UnifiedTheatre and approved certificate chain.
- Confirm the release channel in `config/update.json` is correct for the target group (`latest` for stable, `beta` for pilot).
- Validate published release artifacts and update metadata on the configured generic provider endpoint before deployment.

## 3. Pilot deployment
- Deploy to a small pilot group first.
- Install the Windows NSIS or Linux AppImage/deb package on pilot devices.
- Launch UnifiedTheatre and confirm startup succeeds.
- Confirm the app performs an auto-update check and reports the expected channel state.
- Collect pilot feedback and verify logs or telemetry show healthy startup, update checks, and no crashes.

## 4. Broad rollout
- Use MDM, SCCM, or Intune to deploy the approved installer to the broader enterprise fleet.
- Ensure devices pick up the release from the update server or deployment package.
- Verify no unexpected rollbacks occur and application health remains stable after deployment.
- Monitor rollout status with deployment dashboards and ensure devices are reporting the intended version.

## 5. Rollback procedure
- Mark the release as blocked in your deployment tracking system.
- Re-publish the last known good version to the appropriate channel if necessary.
- Redeploy the stable version through the enterprise deployment tool.
- Monitor rollout and device health closely until the fleet stabilizes.
- Confirm the update server points to a verified lastKnownGood artifact and that clients no longer receive the faulty release.
