import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

function formatJson(value) {
  return JSON.stringify(value, null, 2);
}

async function main() {
  // Use tsx for ESM TypeScript execution (tsx v4 uses ESM entry points)
  const tsxPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxPath, "src/mcp/server.ts"],
    cwd: repoRoot,
    env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
  });

  const client = new Client(
    { name: "stdio-smoke-test", version: "1.0.0" },
    { capabilities: {} },
  );

  try {
    await client.connect(transport);

    console.log("initialize -> ok");
    console.log("serverInfo:", formatJson(client.getServerVersion()));
    console.log(
      "serverCapabilities:",
      formatJson(client.getServerCapabilities()),
    );

    const tools = await client.listTools();
    console.log("tools/list -> ok");
    console.log(
      "tools:",
      formatJson(
        tools.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
      ),
    );

    const toolResult = await client.callTool({
      name: "list-tools",
      arguments: {},
    });
    console.log("tools/call -> ok");
    console.log("toolResult:", formatJson(toolResult));
  } catch (error) {
    console.error("stdio handshake failed");
    console.error(error);
    process.exit(1);
  } finally {
    await transport.close();
  }
}

await main();
