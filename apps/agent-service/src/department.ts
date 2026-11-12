import type { Department } from './model.ts'

// Maps what an agent just did onto the three bays. The tool name is real; which bay it belongs to is our mapping:
// reading and planning -> Planning, editing -> Development, tests / lint / diff -> Review & QA, commit / push / PR / deploy -> Development too (the Integration bay was folded into Development).

const PLANNING = new Set([
  'read', 'grep', 'glob', 'ls', 'websearch', 'webfetch', 'todowrite', 'todoread', 'exitplanmode', 'enterplanmode', 'askuserquestion',
  'toolsearch', 'skill', 'update_plan', 'read_file', 'list_dir', 'file_search', 'grep_search', 'semantic_search', 'search', 'fetch', 'web',
  'view_image', 'taskcreate', 'taskupdate', 'tasklist',
])
const EDITING = new Set([
  'edit', 'write', 'multiedit', 'notebookedit', 'apply_patch', 'replace_string_in_file', 'insert_edit_into_file', 'create_file', 'edit_file',
  'create_directory', 'str_replace_editor',
])
const SHELL = new Set(['bash', 'shell', 'shell_command', 'powershell', 'exec_command', 'local_shell', 'run_in_terminal', 'terminal', 'run_command'])

const SHIPPING =
  /\bgit\s+(commit|push|merge|rebase|tag|cherry-pick|pull)\b|\bgh\s+(pr|release|workflow)\b|\bnpm\s+publish\b|\bdocker\s+(build|push)\b|\bdeploy\b|\bvercel\b|\bkubectl\s+apply\b/i
const REVIEW =
  /\b(vitest|jest|pytest|mocha|oxlint|eslint|tsc|playwright\s+test|cargo\s+(test|clippy)|go\s+(test|vet)|(npm|pnpm|yarn)\s+(run\s+)?(test|lint|typecheck)|git\s+(diff|status|log|show))\b/i

/** Department for a shell command line. Shipping (commit, push, deploy) is development work and wins over review, because "npm test && git push" ships. */
export function departmentForCommand(command: string): Department {
  if (SHIPPING.test(command)) return 'development'
  if (REVIEW.test(command)) return 'review'
  return 'development'
}

/** Department for one tool call. `command` is the shell command line when the tool runs one. */
export function departmentFor(tool: string, command?: string): Department {
  const name = tool.trim().toLowerCase().replace(/^copilot_/, '')
  if (name.startsWith('mcp__')) {
    if (/github|pull_request|publish|deploy|merge|commit|push|release/.test(name)) return 'development'
    if (/review|test/.test(name)) return 'review'
    return 'development'
  }
  if (SHELL.has(name)) return command ? departmentForCommand(command) : 'development'
  if (PLANNING.has(name)) return 'planning'
  if (EDITING.has(name)) return 'development'
  if (name.includes('review')) return 'review'
  // Copilot tool ids such as copilot_readFile, copilot_findTextInFiles, copilot_replaceString, copilot_createFile
  if (/^(read|find|search|list|fetch|codebase|think|geterrors|usages|get_?changed)/.test(name)) return 'planning'
  if (/^(replace|apply|create|insert|edit|multi)/.test(name)) return 'development'
  return 'development'
}
