import { Notice } from "obsidian"
import VaultPilotPlugin from "../main"

export function registerGitCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "quick-push-vault-repo",
    name: "一键推送仓库",
    callback: async () => {
      new Notice("Vault Pilot：一键推送功能骨架已就位，下一步接入 git add / commit / push。")
    },
  })
}
