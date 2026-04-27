import { ItemView, MarkdownView, Notice } from "obsidian"
import VaultPilotPlugin from "../main"
import { prepareVideoEmbed, insertHtmlIntoCanvas, insertHtmlIntoMarkdown } from "../features/nasVideo"
import { openNasVideoPrompt } from "../ui/nasVideoModal"

export function registerNasVideoCommands(plugin: VaultPilotPlugin) {
  plugin.addCommand({
    id: "insert-nas-video",
    name: "Insert video link",
    callback: async () => {
      const url = await openNasVideoPrompt(plugin.app)
      if (!url) return

      const { html, dimensions } = await prepareVideoEmbed(url, plugin.settings.nasPosterExtensions)
      const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView)

      if (markdownView?.editor) {
        insertHtmlIntoMarkdown(markdownView.editor, html)
        new Notice("Vault Pilot: inserted video link")
        return
      }

      const activeView = plugin.app.workspace.getActiveViewOfType(ItemView)
      if (activeView?.getViewType() === "canvas") {
        insertHtmlIntoCanvas(activeView as never, html, dimensions)
        new Notice("Vault Pilot: created a video card in Canvas")
        return
      }

      new Notice("Vault Pilot: open a Markdown note or Canvas first")
    },
  })
}
