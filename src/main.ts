import { Plugin } from "obsidian"
import { registerCommands } from "./commands"
import { registerSmartMindmapAutoResize, registerSmartMindmapHotkeys } from "./features/smartMindmap"
import { DEFAULT_SETTINGS, VaultPilotSettings, VaultPilotSettingTab } from "./settings"

export default class VaultPilotPlugin extends Plugin {
  settings!: VaultPilotSettings

  async onload() {
    await this.loadSettings()

    registerCommands(this)
    registerSmartMindmapHotkeys(this)
    registerSmartMindmapAutoResize(this)
    this.addSettingTab(new VaultPilotSettingTab(this.app, this))
  }

  onunload() {
    // Obsidian cleans up registered resources automatically.
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<VaultPilotSettings>)
  }

  async saveSettings() {
    await this.saveData(this.settings)
  }
}
