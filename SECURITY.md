# Security

## IMPORTANT

We do not accept AI generated security reports. We receive a large number of
these and we do not have the resources to review them all. Please only submit
reports you have verified yourself against a real Clindroid Buddy install.

## Threat Model

### Overview

Clindroid Buddy is an AI coding agent for statistical programming that runs
locally on your machine. It provides an agent system with access to powerful
tools including shell execution, file operations, and web access.

### No Sandbox

Clindroid Buddy does **not** sandbox the agent. The permission system exists as
a UX feature to help users stay aware of what actions the agent is taking - it
prompts for confirmation before executing commands, writing files, etc. However,
it is not designed to provide security isolation.

If you need true isolation, run Clindroid Buddy inside a Docker container or VM.

### Where Your Data Goes

Clindroid Buddy is frequently used with clinical trial data, so it is worth
being explicit about what leaves your machine:

- **Prompts, file contents and tool output are sent to the LLM provider you
  configure.** Handling of that data is governed by that provider's policies.
  If you need data to stay on your own hardware, configure a local provider.
- **No model provider is enabled by default.** You must configure one
  (`/connect`) before Clindroid Buddy can talk to any model. In particular, the
  built-in `opencode` provider is not autoloaded and is never used with an
  anonymous key - it is only available once you supply your own credentials for
  it, and it is operated by the upstream OpenCode project, not by Clindroid.
- **Session sharing has been removed.** This fork ships no `/share` command,
  no `share` configuration option and no share endpoints, so a session can
  never be uploaded to a share service or given a public link.
- **Telemetry:** Clindroid Buddy does not send usage telemetry of its own.

### Server Mode

Server mode is opt-in only. When enabled, set `CLINBUDDY_SERVER_PASSWORD` to
require HTTP Basic Auth. Without this, the server runs unauthenticated (with a
warning). It is the end user's responsibility to secure the server - any
functionality it provides is not a vulnerability.

### Out of Scope

| Category                        | Rationale                                                               |
| ------------------------------- | ----------------------------------------------------------------------- |
| **Server access when opted-in** | If you enable server mode, API access is expected behavior              |
| **Sandbox escapes**             | The permission system is not a sandbox (see above)                      |
| **LLM provider data handling**  | Data sent to your configured LLM provider is governed by their policies |
| **MCP server behavior**         | External MCP servers you configure are outside our trust boundary       |
| **Malicious config files**      | Users control their own config; modifying it is not an attack vector    |

---

# Reporting Security Issues

We appreciate your efforts to responsibly disclose your findings, and will make
every effort to acknowledge your contributions.

To report a security issue, please use the GitHub Security Advisory
["Report a Vulnerability"](https://github.com/Clindroid/Clindroid-Buddy/security/advisories/new)
tab.

We will send a response indicating the next steps in handling your report.
After the initial reply to your report, we will keep you informed of the
progress towards a fix and full announcement, and may ask for additional
information or guidance.

## Escalation

If you do not receive an acknowledgement of your report within 6 business days,
please open a regular GitHub issue saying that you have filed a security
advisory and have not heard back. Do not include details of the vulnerability in
that issue.
