# JIRA Image Attachments in Agent Prompts

## What This Is

Pass image attachments from JIRA issues into agent prompts so the LLM can see screenshots, diagrams, mockups, and UI references that accompany documentation tasks.

## Core Concept

Many JIRA documentation tasks include screenshots showing the UI feature being documented, architecture diagrams, or annotated mockups. Currently these are invisible to the agent — it only sees the plain-text description. With vision-capable models (Claude Opus/Sonnet), the agent could analyze these images to produce more accurate documentation.

## Expected Behavior

1. When building the prompt for a task, the orchestrator fetches image attachments from the JIRA issue
2. Images are downloaded and stored locally (temp directory or container mount)
3. The CLI prompt includes the images via the appropriate mechanism for the CLI (Copilot vs Claude)
4. The agent template references the images: "See the attached screenshots for UI context"

## What Changes in the Codebase

### JiraClient

New method: `getAttachments(issueKey: string): Promise<JiraAttachment[]>` — fetches the attachment list from `fields.attachment`. Filter to image MIME types (`image/png`, `image/jpeg`, `image/gif`, `image/webp`).

Download method: `downloadAttachment(url: string, destPath: string): Promise<void>` — downloads the attachment content via the JIRA API (attachments require the same auth as the REST API).

### Prompt Builder / Task Runner

Before agent invocation:

1. Fetch attachments for the issue
2. Filter to supported image types
3. Download to a temp directory / mount point accessible to the container
4. Pass image paths to the CLI executor

### CLI Executor Changes

Both CLI executors need to handle image input:

**Copilot CLI**: Check if `--image` or similar flag exists (the CLI reference needs review). If not natively supported, images could be placed in the workspace and the agent instructed to read them.

**Claude Code CLI**: The `-p` prompt flag might support image references, or images could be passed via stdin/multimodal API. Claude Code's `--image` support needs investigation.

If neither CLI supports image input directly, the images could be:

- Mounted into the container at a known path
- Referenced in the agent template: "Image attachments are available at `/workspace/.ralph/attachments/`"
- The agent uses vision tools or reads them as needed

### Container Mount

A new volume mount for downloaded attachments:

```yaml
volumes:
  - ${ATTACHMENT_DIR}:/workspace/.ralph/attachments:ro
```

### Template Context

New field: `imageAttachments: { filename: string; path: string; mimeType: string }[]`

Agent templates can reference them:

```liquid
{%- if imageAttachments.size > 0 %}
## Attached Images
The following images were attached to the JIRA issue. Use them for visual context:
{% for img in imageAttachments %}
- `{{ img.filename }}` at `/workspace/.ralph/attachments/{{ img.filename }}`
{% endfor %}
{%- endif %}
```

### Squid Allowlist

If images are hosted on Atlassian's CDN (which they typically are — URLs like `https://api.media.atlassian.com/...`), the Squid allowlist needs to include that domain. Or download pre-container-start so no runtime network access is needed.

Pre-download is the better security posture — the agent container shouldn't need to reach JIRA's media CDN.

## Open Questions

- **Size limits**: Large screenshots or many attachments could bloat the context. Should there be a max count/size? Image compression/resizing before passing to the model?
- **CLI support**: Do Copilot CLI and Claude Code CLI support multimodal input in headless mode? This is a prerequisite.
- **Non-image attachments**: Should PDFs, Word docs, or other attachment types also be passed? These would need conversion to text first.
- **Relevance filtering**: Not all attachments are relevant. Old screenshots from previous work might confuse the agent. Filter by upload date relative to trigger comment?
