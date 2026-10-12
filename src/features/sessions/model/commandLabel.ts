/**
 * A shell command as the transcript shows it: agents start nearly every call
 * with `cd <project> &&`, which pushes the command itself off the row.
 */
export function displayCommand(command: string, cwd?: string): string {
  const match = /^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*(?:&&|;)\s*/.exec(
    command,
  );
  if (!match || !cwd) return command;
  const dir = trimSlash(match[1] ?? match[2] ?? match[3]);
  const project = trimSlash(cwd);
  const same =
    dir === project ||
    (project.startsWith("~/") && dir.endsWith(project.slice(1))) ||
    (dir.startsWith("~/") && project.endsWith(dir.slice(1)));
  const rest = command.slice(match[0].length);
  return same && rest.trim() ? rest : command;
}

function trimSlash(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
