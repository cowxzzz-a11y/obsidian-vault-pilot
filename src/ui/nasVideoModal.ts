import { App, Modal, Setting } from "obsidian"

class NasVideoModal extends Modal {
  private resolve: (value: string | null) => void
  private submitted = false
  private inputValue = ""

  constructor(app: App, resolve: (value: string | null) => void) {
    super(app)
    this.resolve = resolve
  }

  onOpen(): void {
    const { contentEl } = this
    this.setTitle("插入视频链接")

    new Setting(contentEl)
      .setName("视频链接")
      .setDesc("支持 alist 直链和 B 站链接")
      .addText((text) => {
        text
          .setPlaceholder("https://...")
          .setValue(this.inputValue)
          .onChange((value) => {
            this.inputValue = value.trim()
          })

        text.inputEl.style.width = "100%"
        window.setTimeout(() => text.inputEl.focus(), 0)
        text.inputEl.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            this.submit()
          }
        })
      })

    const actionsEl = contentEl.createDiv({ cls: "vault-pilot-modal-actions" })

    const cancelButton = actionsEl.createEl("button", { text: "取消" })
    cancelButton.addEventListener("click", () => this.close())

    const submitButton = actionsEl.createEl("button", {
      text: "插入",
      cls: "mod-cta",
    })
    submitButton.addEventListener("click", () => this.submit())
  }

  onClose(): void {
    this.contentEl.empty()
    if (!this.submitted) {
      this.resolve(null)
    }
  }

  private submit(): void {
    if (!this.inputValue) return
    this.submitted = true
    this.resolve(this.inputValue)
    this.close()
  }
}

export function openNasVideoPrompt(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    new NasVideoModal(app, resolve).open()
  })
}
