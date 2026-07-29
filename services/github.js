/**
 * FILE: services/github.js
 * PURPOSE:
 * Server-side only helper that triggers a GitHub Actions workflow via
 * `workflow_dispatch` from inside a Next.js API route. This is what
 * lets the super-admin panel offer a "Run Backup Now" button and an
 * "Import SQL" action WITHOUT ever running pg_dump/psql inside the
 * live app itself — the actual heavy DB work still only ever runs on
 * GitHub's own runners (Rule 40.1's "decoupled from live traffic"
 * guarantee is preserved), this file just remotely presses the
 * workflow's own "Run workflow" button on the admin's behalf.
 *
 * Never import this in a "use client" file — GITHUB_ACTIONS_TOKEN is a
 * secret with repo + workflow scope.
 */
import { recordApiCall } from "@/services/apiUsageTracker";

/**
 * triggerWorkflowDispatch
 * Calls the GitHub REST API to dispatch a workflow_dispatch event for
 * the given workflow file. Throws on any non-2xx response so the
 * calling route can surface a clear error to the admin.
 *
 * @param {string} workflowFileName - e.g. "database-backup.yml"
 * @param {Record<string,string>} inputs - workflow_dispatch inputs (must match the workflow's `on.workflow_dispatch.inputs` block)
 */
export async function triggerWorkflowDispatch(workflowFileName, inputs = {}) {
  const owner = process.env.GITHUB_REPO_OWNER;
  const repo = process.env.GITHUB_REPO_NAME;
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  const ref = process.env.GITHUB_WORKFLOW_REF || "static";

  if (!owner || !repo || !token) {
    throw new Error(
      "GitHub Actions is not configured. Set GITHUB_REPO_OWNER, GITHUB_REPO_NAME, and GITHUB_ACTIONS_TOKEN."
    );
  }

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFileName}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref, inputs }),
    }
  );

  recordApiCall("github", "workflow_dispatch", response.ok);

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`GitHub API responded ${response.status}: ${errorBody || "unknown error"}`);
  }
}
