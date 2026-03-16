import { Notice, Plugin } from "obsidian"
import { registerCommands } from "./commands"
import { runQuickPush } from "./features/quickPush"
import { registerSmartMindmapAutoResize, registerSmartMindmapHotkeys } from "./features/smartMindmap"
import { DEFAULT_SETTINGS, VaultPilotSettings, VaultPilotSettingTab } from "./settings"

export default class VaultPilotPlugin extends Plugin {
  settings!: VaultPilotSettings

  async onload() {
    await this.loadSettings()

    this.addRibbonIcon("rocket", "Vault Pilot：一键推送仓库", async () => {
      new Notice("Vault Pilot：开始推送仓库…")
      try {
        const result = await runQuickPush(this)
        new Notice(result, 6000)
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误"
        new Notice(`Vault Pilot 推送失败：${message}`, 8000)
      }
    })

    registerCommands(this)
    registerSmartMindmapHotkeys(this)
    registerSmartMindmapAutoResize(this)
    this.addSettingTab(new VaultPilotSettingTab(this.app, this))
  }

  onunload() {
    // Obsidian 会通过 register 系列 API 自动清理已注册资源
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<VaultPilotSettings>)
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
