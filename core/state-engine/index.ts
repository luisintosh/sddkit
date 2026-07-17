// Harness-agnostic SDD state engine. Adapters (OpenCode plugin, Cursor hooks,
// the checkpoint MCP server) import from here; none of this module depends on
// a specific harness runtime.
export * from "./schema"
export * from "./merge"
export * from "./io"
export * from "./guards"
export * from "./checkpoint"
