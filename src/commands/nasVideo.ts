import { ItemView, MarkdownView, Notice } from "obsidian"
import VaultPilotPlugin from "../main"
import { openNasVideoPrompt } from "../ui/nasVideoModal"
import {
  buildNasVideoHtml,
  detectPosterUrl,
  insertHtmlIntoCanvas,
  insertHtmlIntoMarkdown,
} from "../features/nasVideo"

export function registerNasVideoCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "insert-nas-video",
    name: "插入 NAS 视频",
    callback: async () => {
      const url = await openNasVideoPrompt(plugin.app)
      if (!url) return

      const posterUrl = await detectPosterUrl(url, plugin.settings.nasPosterExtensions)
      const html = buildNasVideoHtml(url, posterUrl)
      const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView)

      if (markdownView?.editor) {
        insertHtmlIntoMarkdown(markdownView.editor, html)
        new Notice("Vault Pilot：已插入 NAS 视频")
        return
      }

      const activeView = plugin.app.workspace.getActiveViewOfType(ItemView)
      if (activeView?.getViewType() === "canvas") {
        insertHtmlIntoCanvas(activeView as never, html)
        new Notice("Vault Pilot：已在 Canvas 新建视频卡片")
        return
      }

      new Notice("Vault Pilot：当前仅支持 Markdown 笔记或 Canvas 画板")
    },
  })
}
