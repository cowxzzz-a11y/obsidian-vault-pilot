import { execFile } from "child_process"
import { promisify } from "util"
import VaultPilotPlugin from "../main"

const execFileAsync = promisify(execFile)

type VaultAdapterLike = {
  basePath?: string
}

function getRepoPath(plugin: VaultPilotPlugin): string {
  const configuredPath = plugin.settings.gitRepoPath.trim()
  if (configuredPath) return configuredPath

  const adapter = plugin.app.vault.adapter as VaultAdapterLike
  if (adapter.basePath) return adapter.basePath

  throw new Error("未找到仓库路径，请先在设置里填写 Git 仓库路径")
}

async function runGitCommand(args: string[], cwd: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync("git", args, { cwd, windowsHide: true })
  return `${stdout ?? ""}${stderr ?? ""}`.trim()
}

function createCommitMessage(prefix: string): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
  return `${prefix} ${timestamp}`
}

export async function runQuickPush(plugin: VaultPilotPlugin): Promise<string> {
  const cwd = getRepoPath(plugin)
  const status = await runGitCommand(["status", "--porcelain"], cwd)

  await runGitCommand(["add", "-A"], cwd)

  if (status.trim()) {
    const message = createCommitMessage(plugin.settings.gitCommitPrefix)
    await runGitCommand(["commit", "-m", message], cwd)
  }

  const pushOutput = await runGitCommand(["push"], cwd)

  if (!status.trim()) {
    return pushOutput ? `Vault Pilot：无新改动，已尝试推送\n${pushOutput}` : "Vault Pilot：无新改动，推送完成"
  }

  return pushOutput ? `Vault Pilot：提交并推送完成\n${pushOutput}` : "Vault Pilot：提交并推送完成"
}