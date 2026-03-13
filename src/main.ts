import { Notice, Plugin } from "obsidian"
import { registerCommands } from "./commands"
import { DEFAULT_SETTINGS, VaultPilotSettings, VaultPilotSettingTab } from "./settings"

export default class VaultPilotPlugin extends Plugin {
  settings!: VaultPilotSettings

  async onload() {
    await this.loadSettings()

    this.addRibbonIcon("rocket", "Vault Pilot：一键推送仓库", () => {
      new Notice("Vault Pilot 已加载，下一步开始接入真实推送逻辑。")
    })

    registerCommands(this)
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
