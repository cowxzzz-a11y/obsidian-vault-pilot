import { App, PluginSettingTab, Setting } from "obsidian"
import VaultPilotPlugin from "./main"

export interface VaultPilotSettings {
  nasPosterExtensions: string[]
}

export const DEFAULT_SETTINGS: VaultPilotSettings = {
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

    new Setting(containerEl).setName("Vault Pilot").setHeading()

    new Setting(containerEl)
      .setName("Poster extension priority")
      .setDesc("When inserting Alist or NAS video links, Vault Pilot checks these extensions under covers.")
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
