/** Run a command without a shell; resolves trimmed stdout, rejects on non-zero exit. */
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

export async function run(cmd: string, args: string[] = []): Promise<string> {
  const { stdout } = await execFileAsync(cmd, args, { maxBuffer: 64 * 1024 * 1024 })
  return stdout.trim()
}
