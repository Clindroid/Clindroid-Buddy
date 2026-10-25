import { For } from "solid-js"
import { DEFAULT_THEMES, useTheme } from "@tui/context/theme"

const themeCount = Object.keys(DEFAULT_THEMES).length
const themeTip = `Use {highlight}/themes{/highlight} or {highlight}Ctrl+X T{/highlight} to switch between ${themeCount} built-in themes`

type TipPart = { text: string; highlight: boolean }

function parse(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}

export function Tips() {
  const theme = useTheme().theme
  const parts = parse(TIPS[Math.floor(Math.random() * TIPS.length)])

  return (
    <box flexDirection="row" maxWidth="100%">
      <text flexShrink={0} style={{ fg: theme.warning }}>
        ● Tip{" "}
      </text>
      <text flexShrink={1}>
        <For each={parts}>
          {(part) => <span style={{ fg: part.highlight ? theme.text : theme.textMuted }}>{part.text}</span>}
        </For>
      </text>
    </box>
  )
}

const TIPS = [
  "Press {highlight}Tab{/highlight} to switch to the {highlight}SDTM{/highlight}, {highlight}ADaM{/highlight}, or {highlight}TFL{/highlight} agent for each stage of clinical programming",
  "The {highlight}SDTM{/highlight} agent only edits files under {highlight}data/sdtm/{/highlight} and {highlight}AGENTS.md{/highlight}",
  "The {highlight}ADaM{/highlight} agent writes datasets to {highlight}data/adam/{/highlight} and specs to {highlight}docs/specs/adam/{/highlight}",
  "The {highlight}TFL{/highlight} agent writes programs to {highlight}programs/tfls/{/highlight} and specs to {highlight}docs/specs/tfls/{/highlight}",
  "Switch to the {highlight}review{/highlight} agent to get feedback on your programs without changing any files",
  "Run {highlight}/init{/highlight} in an empty directory to create the standard clinical project folders and {highlight}AGENTS.md{/highlight}",
  "Fill in the {highlight}CDISC Standards Versions{/highlight} table in {highlight}AGENTS.md{/highlight}; skills never assume the latest version",
  "Run {highlight}/download-adam-terminology{/highlight} to save the ADaM Controlled Terminology declared in {highlight}AGENTS.md{/highlight} to {highlight}dict/{/highlight}",
  "Pass a date like {highlight}/download-adam-terminology 2026-03-27{/highlight} to download a specific terminology version",
  "Place ADaM/SDTM IG PDF or DOCX files in {highlight}docs/standards/<std>/{/highlight}, then run {highlight}/index-standard-docs{/highlight} to make them searchable",
  "Set {highlight}rag.embeddingModel{/highlight} in config to choose the embedding model for {highlight}/index-standard-docs{/highlight}",
  "Use the {highlight}adam-dataset-inventory{/highlight} skill to list every ADaM dataset the SAP requires",
  "Place table shells in {highlight}docs/specs/shells/{/highlight} so the {highlight}tfl-spec-writer{/highlight} skill can build TFL specs",
  "Type {highlight}@{/highlight} followed by a filename to fuzzy search and attach files",
  "Start a message with {highlight}!{/highlight} to run shell commands directly (e.g., {highlight}!ls -la{/highlight})",
  "Use {highlight}/undo{/highlight} to revert the last message and file changes",
  "Use {highlight}/redo{/highlight} to restore previously undone messages and file changes",
  "Drag and drop images or PDFs into the terminal to add them as context",
  "Press {highlight}Ctrl+V{/highlight} to paste images from your clipboard into the prompt",
  "Press {highlight}Ctrl+X E{/highlight} or {highlight}/editor{/highlight} to compose messages in your external editor",
  "Run {highlight}/models{/highlight} or {highlight}Ctrl+X M{/highlight} to see and switch between available AI models",
  themeTip,
  "Press {highlight}Ctrl+X N{/highlight} or {highlight}/new{/highlight} to start a fresh conversation session",
  "Use {highlight}/sessions{/highlight} or {highlight}Ctrl+X L{/highlight} to list and continue previous conversations",
  "Run {highlight}/compact{/highlight} to summarize long sessions near context limits",
  "Press {highlight}Ctrl+X X{/highlight} or {highlight}/export{/highlight} to save the conversation as Markdown",
  "Press {highlight}Ctrl+X Y{/highlight} to copy the assistant's last message to clipboard",
  "Press {highlight}Ctrl+P{/highlight} to see all available actions and commands",
  "The leader key is {highlight}Ctrl+X{/highlight}; combine with other keys for quick actions",
  "Press {highlight}F2{/highlight} to quickly switch between recently used models",
  "Press {highlight}Ctrl+X B{/highlight} to show/hide the sidebar panel",
  "Use {highlight}PageUp{/highlight}/{highlight}PageDown{/highlight} to navigate through conversation history",
  "Press {highlight}Ctrl+G{/highlight} or {highlight}Home{/highlight} to jump to the beginning of the conversation",
  "Press {highlight}Ctrl+Alt+G{/highlight} or {highlight}End{/highlight} to jump to the most recent message",
  "Press {highlight}Shift+Enter{/highlight} or {highlight}Ctrl+J{/highlight} to add newlines in your prompt",
  "Press {highlight}Ctrl+C{/highlight} when typing to clear the input field",
  "Press {highlight}Escape{/highlight} to stop the AI mid-response",
  "Switch to {highlight}Plan{/highlight} agent to get suggestions without making actual changes",
  "Use {highlight}@agent-name{/highlight} in prompts to invoke specialized subagents",
  "Configure model providers in the {highlight}provider{/highlight} section of {highlight}.clindroidbuddy/clindroidbuddy.jsonc{/highlight}",
  "Place TUI settings in {highlight}~/.config/clindroidbuddy/tui.json{/highlight} for global config",
  "Add {highlight}$schema{/highlight} to your config for autocomplete in your editor",
  "Configure {highlight}model{/highlight} in config to set your default model",
  "Override any keybind in {highlight}tui.json{/highlight} via the {highlight}keybinds{/highlight} section",
  "Set any keybind to {highlight}none{/highlight} to disable it completely",
  // "Configure local or remote MCP servers in the {highlight}mcp{/highlight} config section",
  // "ClindroidBuddy auto-handles OAuth for remote MCP servers requiring auth",
  "Add {highlight}.md{/highlight} files to {highlight}.clindroidbuddy/command/{/highlight} to define reusable custom prompts",
  "Use {highlight}$ARGUMENTS{/highlight}, {highlight}$1{/highlight}, {highlight}$2{/highlight} in custom commands for dynamic input",
  "Use backticks in commands to inject shell output (e.g., {highlight}`git status`{/highlight})",
  "Add {highlight}.md{/highlight} files to {highlight}.clindroidbuddy/agent/{/highlight} for specialized AI personas",
  "Configure per-agent permissions for {highlight}edit{/highlight}, {highlight}bash{/highlight}, and {highlight}webfetch{/highlight} tools",
  'Use patterns like {highlight}"git *": "allow"{/highlight} for granular bash permissions',
  'Set {highlight}"rm -rf *": "deny"{/highlight} to block destructive commands',
  'Set {highlight}"formatter": false{/highlight} in config to disable all auto-formatting',
  "Define custom formatter commands with file extensions in config",
  "Create {highlight}.ts{/highlight} files in {highlight}.clindroidbuddy/tools/{/highlight} to define new LLM tools",
  "Add {highlight}.ts{/highlight} files to {highlight}.clindroidbuddy/plugin/{/highlight} for event hooks",
  "Use plugins to send OS notifications when sessions complete",
  "Create a plugin to prevent ClindroidBuddy from reading sensitive files",
  "Use {highlight}--format json{/highlight} for machine-readable output in scripts",
  'Use {highlight}"theme": "system"{/highlight} to match your terminal\'s colors',
  "Create JSON theme files in {highlight}.clindroidbuddy/themes/{/highlight} directory",
  "Themes support dark/light variants for both modes",
  "Reference ANSI colors 0-255 in custom themes",
  "Use {highlight}{env:VAR_NAME}{/highlight} syntax to reference environment variables in config",
  "Use {highlight}{file:path}{/highlight} to include file contents in config values",
  "Use {highlight}instructions{/highlight} in config to load additional rules files",
  "Set agent {highlight}temperature{/highlight} from 0.0 (focused) to 1.0 (creative)",
  "Configure {highlight}steps{/highlight} to limit agentic iterations per request",
  'Set {highlight}"tools": {"bash": false}{/highlight} to disable specific tools',
  // 'Set {highlight}"mcp_*": false{/highlight} to disable all tools from an MCP server',
  "Override global tool settings per agent configuration",
  "Permission {highlight}doom_loop{/highlight} prevents infinite tool call loops",
  "Permission {highlight}external_directory{/highlight} protects files outside project",
  "Use {highlight}--print-logs{/highlight} flag to see detailed logs in stderr",
  "Press {highlight}Ctrl+X S{/highlight} or {highlight}/status{/highlight} to see system status info",
  "Enable {highlight}scroll_acceleration{/highlight} in {highlight}tui.json{/highlight} for smooth macOS-style scrolling",
  "Toggle username display in chat via command palette ({highlight}Ctrl+P{/highlight})",
  "Commit your project's {highlight}AGENTS.md{/highlight} file to Git for team sharing",
  "Use {highlight}/rename{/highlight} to rename the current session",
  ...(process.platform === "win32"
    ? ["Press {highlight}Ctrl+Z{/highlight} to undo changes in your prompt"]
    : ["Press {highlight}Ctrl+Z{/highlight} to suspend the terminal and return to your shell"]),
]
