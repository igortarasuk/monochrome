import { expect, it } from "vitest";
import { displayCommand } from "./commandLabel";

it("drops the leading cd into the project", () => {
  expect(displayCommand("cd /home/me/app && git status", "/home/me/app")).toBe(
    "git status",
  );
  expect(displayCommand('cd "/home/me/app/" ; npm test', "/home/me/app")).toBe(
    "npm test",
  );
  expect(displayCommand("cd /home/me/app && ls", "~/app")).toBe("ls");
});

it("keeps a cd that goes somewhere else or stands alone", () => {
  expect(displayCommand("cd /tmp && ls", "/home/me/app")).toBe("cd /tmp && ls");
  expect(displayCommand("cd /home/me/app/src && ls", "/home/me/app")).toBe(
    "cd /home/me/app/src && ls",
  );
  expect(displayCommand("cd /home/me/app", "/home/me/app")).toBe(
    "cd /home/me/app",
  );
  expect(displayCommand("git status", "/home/me/app")).toBe("git status");
  expect(displayCommand("cd /home/me/app && ls")).toBe("cd /home/me/app && ls");
});
