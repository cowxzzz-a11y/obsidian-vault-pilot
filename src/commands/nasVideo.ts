import { Notice } from "obsidian"
import VaultPilotPlugin from "../main"

export function registerNasVideoCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "insert-nas-video",
    name: "插入 NAS 视频",
    callback: async () => {
      new Notice("Vault Pilot：NAS 视频插入命令骨架已就位，下一步开始做 Markdown + Canvas 双支持。")
    },
  })
}
