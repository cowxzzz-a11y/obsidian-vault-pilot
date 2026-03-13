import { Notice, Platform } from "obsidian"
import VaultPilotPlugin from "../main"
import { runQuickPush } from "../features/quickPush"

export function registerGitCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "quick-push-vault-repo",
    name: "一键推送仓库",
    callback: async () => {
      if (!Platform.isDesktopApp) {
        new Notice("Vault Pilot：一键推送仅支持桌面端")
        return
      }

      new Notice("Vault Pilot：开始推送仓库…")

      try {
        const result = await runQuickPush(plugin)
        new Notice(result, 6000)
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        new Notice(`Vault Pilot 推送失败：${message}`, 8000)
      }
    },
  })
}
