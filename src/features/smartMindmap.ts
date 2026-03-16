import { App, ItemView, Plugin, debounce, editorInfoField } from "obsidian"
import { EditorView } from "@codemirror/view"
import { CanvasData, CanvasTextData } from "obsidian/canvas"

const MIN_NODE_WIDTH = 180
const MIN_NODE_HEIGHT = 56
const MAX_NODE_WIDTH = 420
const NODE_HORIZONTAL_PADDING = 56
const NODE_VERTICAL_PADDING = 24
const HORIZONTAL_GAP = 220
const VERTICAL_GAP = 36

type CanvasNodeLike = {
  id: string
  x: number
  y: number
  width: number
  height: number
  isEditing?: boolean
  canvas?: CanvasLike
  moveTo(position: { x: number; y: number }): void
  resize(size: { width: number; height: number }): void
  startEditing(): void
}

type CanvasEdgeLike = {
  from: { node: CanvasNodeLike; side: string }
  to: { node: CanvasNodeLike; side: string }
}

type CanvasLike = {
  x: number
  y: number
  readonly: boolean
  nodes: Map<string, CanvasNodeLike>
  selection: Set<CanvasNodeLike>
  getData(): CanvasData
  importData(data: CanvasData): void
  getEdgesForNode(node: CanvasNodeLike): CanvasEdgeLike[]
  requestFrame(): void
  requestSave(save?: boolean, triggerBySelf?: boolean): void
  deselectAll(): void
  selectOnly(node: CanvasNodeLike): void
  zoomToSelection(): void
}

export type CanvasViewLike = {
  canvas: CanvasLike
}

type TreeNode = {
  node: CanvasNodeLike
  children: TreeNode[]
  subtreeWidth: number
  subtreeHeight: number
  x: number
  y: number
}

function randomId(length = 16): string {
  const chars = "0123456789abcdef"
  let result = ""
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)]
  }
  return result
}

export function getActiveCanvasView(view: ItemView | null): CanvasViewLike | null {
  if (!view || view.getViewType() !== "canvas") return null
  return view as unknown as CanvasViewLike
}

function addEdge(canvas: CanvasLike, fromNode: CanvasNodeLike, toNode: CanvasNodeLike): void {
  const data = canvas.getData()
  canvas.importData({
    nodes: data.nodes,
    edges: [
      ...data.edges,
      {
        id: randomId(),
        fromNode: fromNode.id,
        fromSide: "right",
        toNode: toNode.id,
        toSide: "left",
      },
    ],
  })
}

function createTextNode(canvas: CanvasLike, x: number, y: number, width: number, height: number): CanvasNodeLike | null {
  const data = canvas.getData()
  const nodeId = randomId()
  const node: CanvasTextData = {
    id: nodeId,
    x,
    y,
    width,
    height,
    type: "text",
    text: "",
  }

  canvas.importData({
    nodes: [...data.nodes, node],
    edges: data.edges,
  })
  canvas.requestFrame()
  return canvas.nodes.get(nodeId) ?? null
}

function getParentNode(canvas: CanvasLike, node: CanvasNodeLike): CanvasNodeLike | null {
  const incoming = canvas.getEdgesForNode(node).find((edge) => edge.to.node.id === node.id)
  return incoming?.from.node ?? null
}

function getChildNodes(canvas: CanvasLike, node: CanvasNodeLike): CanvasNodeLike[] {
  return canvas
    .getEdgesForNode(node)
    .filter((edge) => edge.from.node.id === node.id && edge.to.side === "left")
    .map((edge) => edge.to.node)
    .sort((a, b) => a.y - b.y)
}

function getRootNode(canvas: CanvasLike, node: CanvasNodeLike): CanvasNodeLike {
  let current = node
  let parent = getParentNode(canvas, current)

  while (parent) {
    current = parent
    parent = getParentNode(canvas, current)
  }

  return current
}

function buildTree(canvas: CanvasLike, node: CanvasNodeLike): TreeNode {
  const children = getChildNodes(canvas, node).map((child) => buildTree(canvas, child))
  return {
    node,
    children,
    subtreeWidth: node.width,
    subtreeHeight: node.height,
    x: node.x,
    y: node.y,
  }
}

function measureTree(tree: TreeNode): void {
  if (tree.children.length === 0) {
    tree.subtreeWidth = tree.node.width
    tree.subtreeHeight = tree.node.height
    return
  }

  tree.children.forEach(measureTree)
  tree.subtreeWidth = tree.node.width + HORIZONTAL_GAP + Math.max(...tree.children.map((child) => child.subtreeWidth))
  tree.subtreeHeight = Math.max(
    tree.node.height,
    tree.children.reduce((sum, child) => sum + child.subtreeHeight, 0) + VERTICAL_GAP * (tree.children.length - 1),
  )
}

function positionTree(tree: TreeNode, left: number, top: number): void {
  tree.x = left
  tree.y = top + (tree.subtreeHeight - tree.node.height) / 2

  if (tree.children.length === 0) return

  let childTop = top + (tree.subtreeHeight - (tree.children.reduce((sum, child) => sum + child.subtreeHeight, 0) + VERTICAL_GAP * (tree.children.length - 1))) / 2
  const childLeft = left + tree.node.width + HORIZONTAL_GAP

  for (const child of tree.children) {
    positionTree(child, childLeft, childTop)
    childTop += child.subtreeHeight + VERTICAL_GAP
  }
}

function applyTree(tree: TreeNode): void {
  tree.node.moveTo({ x: tree.x, y: tree.y })
  tree.children.forEach(applyTree)
}

function relayoutFromRoot(canvas: CanvasLike, root: CanvasNodeLike): void {
  const tree = buildTree(canvas, root)
  measureTree(tree)
  positionTree(tree, root.x, root.y - (tree.subtreeHeight - root.height) / 2)
  applyTree(tree)
  canvas.requestSave()
}

function focusNode(canvas: CanvasLike, node: CanvasNodeLike): void {
  canvas.deselectAll()
  canvas.selectOnly(node)
  canvas.zoomToSelection()
  window.setTimeout(() => node.startEditing(), 50)
}

export async function createSmartChildNode(canvasView: CanvasViewLike): Promise<boolean> {
  const canvas = canvasView.canvas
  if (canvas.readonly || canvas.selection.size !== 1) return false

  const parent = Array.from(canvas.selection)[0]
  if (parent.isEditing) return false

  const child = createTextNode(
    canvas,
    parent.x + parent.width + HORIZONTAL_GAP,
    parent.y,
    MIN_NODE_WIDTH,
    MIN_NODE_HEIGHT,
  )

  if (!child) return false

  addEdge(canvas, parent, child)
  const root = getRootNode(canvas, parent)
  relayoutFromRoot(canvas, root)
  focusNode(canvas, child)
  return true
}

export async function createSmartSiblingNode(canvasView: CanvasViewLike): Promise<boolean> {
  const canvas = canvasView.canvas
  if (canvas.readonly || canvas.selection.size !== 1) return false

  const selected = Array.from(canvas.selection)[0]
  if (selected.isEditing) return false

  const parent = getParentNode(canvas, selected)
  if (!parent) return false

  const sibling = createTextNode(
    canvas,
    selected.x,
    selected.y + selected.height + VERTICAL_GAP,
    MIN_NODE_WIDTH,
    MIN_NODE_HEIGHT,
  )

  if (!sibling) return false

  addEdge(canvas, parent, sibling)
  const root = getRootNode(canvas, parent)
  relayoutFromRoot(canvas, root)
  focusNode(canvas, sibling)
  return true
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false

  const editable = target.closest(
    "input, textarea, [contenteditable='true'], .cm-content, .canvas-node-content.is-editing, .canvas-node.is-editing",
  )
  return Boolean(editable)
}

function isCanvasInteractionTarget(view: CanvasViewLike, target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const container = (view as unknown as { contentEl?: HTMLElement }).contentEl
  return container ? container.contains(target) : true
}

async function runSmartShortcut(app: App, key: "Tab" | "Enter"): Promise<boolean> {
  const view = getActiveCanvasView(app.workspace.getActiveViewOfType(ItemView))
  if (!view) return false

  if (key === "Tab") {
    return createSmartChildNode(view)
  }

  return createSmartSiblingNode(view)
}

export function registerSmartMindmapHotkeys(plugin: Plugin & { app: App }): void {
  plugin.registerDomEvent(document, "keydown", (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key !== "Tab" && event.key !== "Enter") return
    if (isEditableTarget(event.target)) return

    const view = getActiveCanvasView(plugin.app.workspace.getActiveViewOfType(ItemView))
    if (!view) return
    if (!isCanvasInteractionTarget(view, event.target)) return

    event.preventDefault()
    void runSmartShortcut(plugin.app, event.key)
  })
}

function getLongestLineLength(view: EditorView): number {
  let longest = 0
  for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber++) {
    longest = Math.max(longest, view.state.doc.line(lineNumber).length)
  }
  return longest
}

function calculateNodeSizeFromEditor(view: EditorView): { width: number; height: number } {
  const longestLineLength = getLongestLineLength(view)
  const estimatedWidth = Math.round(longestLineLength * view.defaultCharacterWidth + NODE_HORIZONTAL_PADDING)
  const width = Math.min(Math.max(estimatedWidth, MIN_NODE_WIDTH), MAX_NODE_WIDTH)
  const height = Math.max(Math.round(view.contentHeight + NODE_VERTICAL_PADDING), MIN_NODE_HEIGHT)
  return { width, height }
}

export function registerSmartMindmapAutoResize(plugin: Plugin & { app: App }): void {
  const debouncedRelayout = debounce((canvas: CanvasLike, node: CanvasNodeLike) => {
    const root = getRootNode(canvas, node)
    relayoutFromRoot(canvas, root)
  }, 150, false)

  plugin.registerEditorExtension(
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return

      const editorInfo = update.state.field(editorInfoField) as unknown as {
        node?: CanvasNodeLike
      }
      const node = editorInfo?.node
      const canvas = node?.canvas

      if (!node || !canvas || typeof node.resize !== "function") return

      const nextSize = calculateNodeSizeFromEditor(update.view)
      if (node.width === nextSize.width && node.height === nextSize.height) return

      node.resize(nextSize)
      debouncedRelayout(canvas, node)
    }),
  )
}