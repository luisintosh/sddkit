// Bundled entry for the checkpoint MCP server. esbuild bundles this into a
// single self-contained file the harness launches via `node`. Kept separate
// from server.ts so importing the server (tests, adapters) has no side effects.
import { runStdioServer } from "./server"

runStdioServer().catch((err) => {
  console.error("sdd-checkpoint MCP server failed to start:", err)
  process.exit(1)
})
