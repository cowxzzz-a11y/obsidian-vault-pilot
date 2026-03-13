# Vault Pilot

Vault Pilot 是一个面向个人知识库工作流的 Obsidian 插件，目标是把常用但零散的自动化动作整合到一个插件里。

## 规划中的核心能力

- 一步插入 NAS 视频（Markdown + Canvas）
- 一键提交并推送整个仓库到 GitHub
- 更稳的 Canvas Mindmap 自动布局与节点尺寸自适应

## 本地开发

```bash
npm install
npm run dev
```

构建输出会直接生成在当前插件目录顶层：

- `main.js`
- `manifest.json`
- `styles.css`

然后在 Obsidian 的 **设置 → 社区插件** 中启用 `Vault Pilot`。
