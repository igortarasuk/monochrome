import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Monochrome's features hook into files that upstream owns. A sync can drop
// such a hook while resolving a conflict and still compile, and the feature
// then disappears from the app without any other test noticing. Every hook
// is listed here, so a lost one fails the suite and names the feature.
// When a hook moves on purpose, update its entry in the same commit.

const root = resolve(import.meta.dirname, "..");
const sources = new Map<string, string>();
const source = (file: string) => {
  if (!sources.has(file))
    sources.set(file, readFileSync(resolve(root, file), "utf8"));
  return sources.get(file)!;
};

const HOOKS: Record<string, Record<string, string[]>> = {
  "run commands in a terminal": {
    "src/features/sessions/ui/AgentMarkdown.tsx": [
      "<CodeRunButton",
      "isShellLanguage(",
      "isCommandBlock(",
      "bangCommand(",
      "requestRunInTerminal(",
    ],
    "src/app/App.tsx": [
      "bangCommand(",
      "RUN_IN_TERMINAL_EVENT",
      "queueTerminalInput(",
      "wrapWithDoneReport(",
      "TERMINAL_COMMAND_DONE_EVENT",
      "doneReportMessage(",
    ],
    "src/features/terminal/ui/TerminalView.tsx": [
      "takeTerminalInput(",
      "scanCommandDone(",
    ],
  },
  "transcript replies": {
    "src/features/sessions/ui/AgentTranscript.tsx": [
      "turnAsksQuestion(",
      '<ReplySaveButton text={text} kind="note"',
      '<ReplySaveButton text={text} kind="todo"',
      "Save as to-do",
      "<RemoteControlNotice",
      "zen-thought",
      "zen-command",
      "displayCommand(",
    ],
    "src/features/sessions/ui/AgentTabView.tsx": [
      "assistants/model/replyNotes",
    ],
    "src/features/sessions/ui/SessionPane.tsx": ["assistants/model/replyNotes"],
    "src/features/sessions/hooks/useTranscriptSelection.ts": [
      "selectionMarkdown(",
    ],
  },
  "composer controls": {
    "src/features/sessions/ui/Composer.tsx": [
      "<AutoModelToggle",
      "<ProjectKnowledgeButton",
      "REMOTE_CONTROL_COMMAND",
      "supportsRemoteControl(",
    ],
    "src/features/sessions/ui/ModelPicker.tsx": ["harnessCatalogError("],
  },
  "auto model and project knowledge": {
    "src/app/App.tsx": [
      "useAutoModelGate<",
      "pinSessionModel(",
      "withProjectKnowledge(",
    ],
  },
  "remote control": {
    "src/app/App.tsx": ["onRemoteTurn(", "remoteTurn", "remoteControlCommand"],
    "src/integrations/harness/providers/claude/claude.ts": [
      "--replay-user-messages",
      "announceRemoteTurn(",
      "export async function setClaudeRemoteControl(",
      "export function isClaudeRemoteControlled(",
    ],
    "src/integrations/harness/providers/claude/claudeProtocol.ts": [
      "export function replayedUserMessage(",
    ],
    "src/integrations/harness/core/registry.ts": [
      "export function supportsRemoteControl(",
      "export function isHarnessRemoteControlled(",
      "export async function setHarnessRemoteControl(",
    ],
    "src/integrations/harness/core/apply.ts": ["remoteControl"],
    "src/integrations/harness/index.ts": ["onRemoteTurn"],
  },
  "thinking summaries": {
    "src/integrations/harness/providers/claude/claudeProtocol.ts": [
      '"--thinking-display", "summarized"',
    ],
  },
  "assistants, calendar and services": {
    "src/app/App.tsx": [
      "<AssistantsView",
      "<CalendarView",
      "<ServicesStatus",
      "calendarViewOpen",
    ],
    "src/app/shell/Sidebar.tsx": ["assistantsNav", "<CalendarDays", "<Bot"],
    "src/app/shell/ProjectRail.tsx": ["assistantsNav", "calendarActive"],
    "src/features/projects/model/recents.ts": [
      "export function isAssistantWorkspace(",
    ],
    "src/shared/ui/icons.tsx": ["export const CalendarDays"],
  },
  "notes to-dos": {
    "src/features/notes/ui/NotesView.tsx": [
      "todoOnly",
      "<TodoCheckboxes",
      "toggleTodoLine",
    ],
  },
  "footer accounts and pipeline": {
    "src/app/shell/UsageFooter.tsx": [
      "<PipelineChip",
      "hasProjectAccountChoice(",
      "needsAccountChoice: claudeNeedsChoice",
      "needsAccountChoice: codexNeedsChoice",
      "{extra}",
    ],
    "src/app/shell/UsageProviderChip.tsx": ["needsAccountChoice"],
    "src/features/providers/model/providerAccountIdentity.ts": [
      "export function accountDisplayName(",
      "export function withoutDuplicateDefault(",
    ],
    "src/features/providers/model/providerAccountCredentials.ts": [
      "export async function readProviderAccountConfigDir(",
      "export async function setProviderAccountConfigDir(",
    ],
  },
  "source control": {
    "src/features/source-control/ui/GitChangesPanel.tsx": [
      "describeTextGenerator(",
      "withLinearRefs(",
      "stripAttribution(",
      "runVulnCheck(",
      "<VulnCheckStatus",
      "export function useReviewProvider(",
    ],
    "src/features/source-control/model/gitText.ts": [
      "export function stripAttribution(",
    ],
    "src/platform/tauri/fs.ts": ["export function gitReviewProvider("],
    "src/features/inbox/ui/InboxView.tsx": [
      "export function inboxProjectOptions(",
    ],
    "src/features/inbox/model/githubTasks.ts": [
      "export function linearIssueToInboxItem(",
    ],
  },
  "commit text generator": {
    "src/integrations/harness/core/textHarness.ts": [
      "loadTextGeneratorSettings",
    ],
    "src/integrations/harness/providers/claude/claudeText.ts": [
      "textProviderAccountId",
      "textModelSetting",
    ],
    "src/integrations/harness/providers/codex/codexText.ts": [
      "textProviderAccountId",
      "textModelSetting",
    ],
    "src/integrations/harness/providers/cursor/cursorText.ts": [
      "textModelSetting",
    ],
    "src/integrations/harness/providers/grok/grokText.ts": ["textModelSetting"],
    "src/integrations/harness/providers/opencode/opencodeText.ts": [
      "textModelSetting",
    ],
  },
  settings: {
    "src/features/settings/ui/SettingsView.tsx": [
      "<LintToolRows />",
      "<LayaSettings />",
      "<TextGeneratorSettingsCard",
      "setProviderAccountConfigDir",
      "oled",
    ],
    "src/features/settings/model/settings.ts": ["LINT_TOOL_SETTINGS"],
    "src/features/settings/model/appearance.ts": [
      '"oled"',
      "export function applyOledInk(",
      "export function isOledTheme(",
    ],
    "src/features/connections/ui/ConnectionsSettings.tsx": ["<TeleportPicker"],
  },
  "Laya gate": {
    "src/features/automations/ui/AutomationsView.tsx": ["<LayaGateSection"],
    "src/features/automations/model/automations.ts": [
      "export type AutomationGate",
    ],
    "src/app/App.tsx": ["checkAutomationGate("],
    "src/features/agent-app/model/agentApp.ts": ["laya/model/laya"],
    "src-tauri/src/control_cli.rs": ['"laya'],
  },
  "editor and file viewer": {
    "src/features/files/ui/FileEditor.tsx": [
      "externalLint(",
      "notifyExternalLintSaved(",
    ],
    "src/features/files/editor/editorLanguage.ts": [
      "export function isAnsibleYaml(",
      "hclMode",
      "jinja",
    ],
    "src/features/files/ui/BinaryFileView.tsx": ["<PdfView", "<ZoomButton"],
    "src/features/files/ui/FilePane.tsx": ["isPdfPath("],
    "src/features/files/model/filePreview.ts": [
      "export function isPdfPath(",
      "export function isPdfBytes(",
    ],
  },
  "Linux window and terminal": {
    "src/main.tsx": ["<ResizeEdges", "IS_LINUX"],
    "src/styles/index.css": [
      "is-linux",
      "oled",
      ".zen-thought {",
      ".zen-command {",
    ],
    "src-tauri/src/pty.rs": [
      ".or_else(passwd_shell)",
      "set_cloexec(master);",
      "set_cloexec(slave);",
      "F_DUPFD_CLOEXEC",
    ],
    "src-tauri/src/harness.rs": [
      "apply_login_config_dirs(",
      "pub fn provider_account_set_config_dir(",
    ],
    "src-tauri/src/skills.rs": ["claude_plugin_skill_roots("],
    "src-tauri/src/remote_ssh.rs": ["teleport"],
    "host/service.ts": ["linger"],
  },
  "low power mode": {
    "src/styles/index.css": ['@import "./low-power.css";'],
    "src/features/settings/model/appearance.ts": [
      "applyReduceEffects(loadReduceEffects())",
    ],
    "src/features/settings/model/settings.ts": ['id: "reduce-effects"'],
    "src/features/settings/ui/SettingsView.tsx": [
      'id="reduce-effects"',
      "onReduceEffects(REDUCE_EFFECTS_DEFAULT)",
    ],
    "src/features/sessions/ui/EmptySession.tsx": [
      "arcadeEnabled && !reduced",
    ],
    "src/features/sessions/ui/Composer.tsx": [
      "loadComposerRunner() && !effectsReduced()",
      "REDUCE_EFFECTS_CHANGE_EVENT",
    ],
    "src/features/source-control/ui/UnifiedDiffView.tsx": [
      "diff-sticky-header",
    ],
    "src/features/source-control/ui/GitChangesPanel.tsx": [
      "const GIT_POLL_MS = 5000;",
      "document.hasFocus()",
    ],
    "src/features/terminal/ui/TerminalView.tsx": [
      "cursorBlink: false",
      "loadWebglRenderer(term)",
    ],
  },
  "updates and branding": {
    "src/app/model/updater.ts": [
      "app_latest_release",
      "igortarasuk/monochrome",
    ],
    "src-tauri/tauri.conf.json": [
      '"productName": "Monochrome"',
      "frame-src asset:",
    ],
    ".gitattributes": [
      "README.md merge=ours",
      ".github/workflows/release.yml merge=ours",
      ".github/workflows/ci.yml merge=ours",
      ".github/workflows/host-release.yml merge=ours",
    ],
  },
};

const MODULES = [
  "app_release",
  "assistants",
  "auto_model",
  "external_lint",
  "laya",
  "ollama",
  "path_probe",
  "planning",
  "project_knowledge",
  "services",
  "teleport",
];

const COMMANDS = [
  "app_release::app_latest_release",
  "assistants::assistant_workspace_prepare",
  "auto_model::auto_model_project",
  "auto_model::auto_model_session_get",
  "auto_model::auto_model_session_set",
  "external_lint::external_lint",
  "external_lint::external_lint_tools",
  "external_lint::vuln_check",
  "fs::git_review_provider",
  "gitlab::gitlab_pipeline",
  "harness::provider_account_config_dir",
  "harness::provider_account_set_config_dir",
  "laya::laya_classify",
  "laya::laya_domain",
  "laya::laya_domains",
  "laya::laya_learn",
  "laya::laya_predict",
  "laya::laya_presets",
  "laya::laya_set_config",
  "laya::laya_start",
  "laya::laya_stats",
  "laya::laya_status",
  "laya::laya_stop",
  "laya::laya_train",
  "linear::linear_create_plan",
  "linear::linear_issue_close",
  "linear::linear_issue_set_due_date",
  "linear::linear_issue_set_labels",
  "linear::linear_issue_set_state",
  "linear::linear_plan_parents",
  "linear::linear_sprint",
  "linear::linear_team_labels",
  "linear::linear_team_states",
  "ollama::ollama_delete",
  "ollama::ollama_list",
  "ollama::ollama_pull",
  "path_probe::path_is_file",
  "planning::planning_delete_entry",
  "planning::planning_hours",
  "planning::planning_log_time",
  "planning::planning_set_planned",
  "planning::planning_spent_by_day",
  "project_knowledge::project_knowledge_page",
  "project_knowledge::project_knowledge_record",
  "project_knowledge::project_knowledge_sync",
  "project_knowledge::project_knowledge_write",
  "services::services_status",
  "teleport::teleport_nodes",
  "teleport::teleport_status",
];

describe("Monochrome hooks in upstream files", () => {
  for (const [feature, files] of Object.entries(HOOKS)) {
    it(`keeps ${feature}`, () => {
      const lost = Object.entries(files).flatMap(([file, markers]) =>
        markers
          .filter((marker) => !source(file).includes(marker))
          .map((marker) => `${file}: ${marker}`),
      );
      expect(lost).toEqual([]);
    });
  }

  it("keeps the thinking before the first answer", () => {
    expect(
      source("src/features/sessions/ui/AgentTranscript.tsx"),
    ).not.toContain("InitialThinking");
  });

  it("registers every Monochrome backend command", () => {
    const lib = source("src-tauri/src/lib.rs");
    const lost = [
      ...MODULES.filter((name) => !lib.includes(`mod ${name};`)),
      ...COMMANDS.filter(
        (command) => !new RegExp(`\\b${command}\\b`).test(lib),
      ),
    ];
    expect(lost).toEqual([]);
  });
});
