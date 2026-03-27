import { ItemView, MarkdownView, Notice } from "obsidian"
import VaultPilotPlugin from "../main"
import { prepareVideoEmbed, insertHtmlIntoCanvas, insertHtmlIntoMarkdown } from "../features/nasVideo"
import { openNasVideoPrompt } from "../ui/nasVideoModal"

export function registerNasVideoCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "insert-nas-video",
    name: "插入视频链接",
    callback: async () => {
      const url = await openNasVideoPrompt(plugin.app)
      if (!url) return

      const { html, dimensions } = await prepareVideoEmbed(url, plugin.settings.nasPosterExtensions)
      const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView)

      if (markdownView?.editor) {
        insertHtmlIntoMarkdown(markdownView.editor, html)
        new Notice("Vault Pilot：已插入视频链接")
        return
      }

      const activeView = plugin.app.workspace.getActiveViewOfType(ItemView)
      if (activeView?.getViewType() === "canvas") {
        insertHtmlIntoCanvas(activeView as never, html, dimensions)
        new Notice("Vault Pilot：已在 Canvas 新建视频卡片")
        return
      }

      new Notice("Vault Pilot：当前仅支持 Markdown 笔记或 Canvas 画板")
    },
  })
}
