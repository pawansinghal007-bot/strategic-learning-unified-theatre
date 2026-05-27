import { probeHardware } from "./hwProbe";

async function main() {
  const profile = await probeHardware();

  console.log("\n=== Hardware Probe Result ===\n");
  console.log(`Platform  : ${profile.platform}`);
  console.log(`CPU       : ${profile.cpuModel} (${profile.cpuCores} cores)`);
  console.log(`RAM       : ${Math.round(profile.ramMB / 1024)} GB`);
  console.log(`GPUs      :`);
  if (profile.gpus.length === 0) {
    console.log("  none detected");
  }
  for (const g of profile.gpus) {
    const vram = g.vramMB >= 1024 ? `${(g.vramMB / 1024).toFixed(1)} GB` : `${g.vramMB} MB`;
    console.log(`  - ${g.name} [${g.vendor}] ${vram} VRAM`);
  }
  console.log(`\nTier      : ★ ${profile.tier}`);
  console.log(`Reason    : ${profile.tierReason}`);
  console.log("\n============================\n");
}

main().catch(console.error);