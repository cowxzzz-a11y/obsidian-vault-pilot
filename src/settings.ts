import { App, PluginSettingTab, Setting } from "obsidian"
import VaultPilotPlugin from "./main"

export interface VaultPilotSettings {
  gitRepoPath: string
  nasPosterExtensions: string[]
}

export const DEFAULT_SETTINGS: VaultPilotSettings = {
  gitRepoPath: "",
  nasPosterExtensions: ["png", "jpg", "webp"],
}

export class VaultPilotSettingTab extends PluginSettingTab {
  plugin: VaultPilotPlugin

  constructor(app: App, plugin: VaultPilotPlugin) {
    super(app, plugin)
    this.plugin = plugin
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    containerEl.createEl("h2", { text: "Vault Pilot" })

    new Setting(containerEl)
      .setName("Git 仓库路径")
      .setDesc("留空时默认使用当前 Obsidian 仓库根目录。")
      .addText((text) =>
        text
          .setPlaceholder("例如 D:\\Document\\quartz_obsidian")
          .setValue(this.plugin.settings.gitRepoPath)
          .onChange(async (value) => {
            this.plugin.settings.gitRepoPath = value.trim()
            await this.plugin.saveSettings()
          }),
      )

    new Setting(containerEl)
      .setName("封面后缀优先级")
      .setDesc("插入 NAS 视频时，会依次尝试 covers 下的这些后缀。")
      .addText((text) =>
        text
          .setPlaceholder("png,jpg,webp")
          .setValue(this.plugin.settings.nasPosterExtensions.join(","))
          .onChange(async (value) => {
            this.plugin.settings.nasPosterExtensions = value
              .split(",")
              .map((item) => item.trim().replace(/^\./, ""))
              .filter(Boolean)
            await this.plugin.saveSettings()
          }),
      )
  }
}
