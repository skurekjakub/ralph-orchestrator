---
name: ralph-write-release-notes
description: "Format and examples for writing release notes for Xperience by Kentico features and changes. Use this skill whenever asked to write release notes, summarize feature changes for a changelog, describe new capabilities or updates for a release, draft user-facing change descriptions, or when the JIRA issue involves documenting what's new in a Refresh release."
---

# Write Release Notes Skill

Instructions for writing release notes for Xperience by Kentico features and changes.

## Context

Release notes are always about Xperience by Kentico functionality, features, or bug fixes. Focus on capabilities and changes to the Xperience by Kentico product itself, not implementation examples or documentation updates.

Use all available context from the current conversation, including code changes, documentation outlines, technical specifications, and feature descriptions.

## Release Note Structure

### Title
- Use a concise, descriptive title (3-7 words)
- Focus on the user benefit or capability
- Use sentence case

### Body
- **First paragraph**: Describe what users can now do (the capability)
- **Additional paragraphs** (if needed): Explain how it works, any limitations, or important details
- **Final sentence** (if applicable): Link to documentation with "See [Page name] for more information."

## Writing Guidelines

1. **User-focused**: Write from the user's perspective, emphasizing what they can accomplish
2. **Active voice**: Use present tense and active voice ("Users can now..." not "It has been made possible...")
3. **Concise**: Keep sentences under 20 words when possible
4. **Specific**: Include concrete details about functionality
5. **No jargon**: Avoid internal terminology; use terms users understand
6. **No version numbers**: Don't reference specific version numbers in the body

## Categorization

Determine if the release note belongs under:
- **New features** — Entirely new capabilities
- **Updates and changes** — Improvements to existing functionality

## Examples

### New features

**Read-only deployment support**
Xperience by Kentico applications can now run and be deployed in read-only mode. Switching traffic from a live application to a read-only deployment enables zero-downtime database and file system updates for production environments. When read-only mode is enabled, the system automatically blocks all write operations to the database and Azure Blob Storage, ensuring data consistency during deployment windows. See Read-only deployments for more information.

Currently, read-only mode is available for private cloud deployments. Support for zero-downtime deployments of SaaS projects will be introduced soon.

**Restore deleted content**
Deleting pages, content items, headless items, and emails is no longer permanent. Deleted items are retained in the system for a configurable period of time, during which they can be recovered. References to restored pages and content items in other content are restored along with these items.

**Validation rules for form fields**
When creating forms in the Form Builder, users can now add validation rules to fields. These rules restrict which values can be submitted into fields. For example, validation rules can limit the maximum length of a field or enforce a specific format. The system provides a basic set of validation rules by default, and also allows developers to define custom rules suitable for project-specific scenarios.

**Content item cloning**
New reusable content items can now be easily created by cloning existing ones, with the option to clone all language variants of an item.

**Content type management API and MCP server preview**
This update includes a preview version of a management API that allows retrieval and editing of objects within Xperience. The management API is intended to be used via AI tools together with a corresponding Model Context Protocol (MCP) server.

At this time, the functionality is limited to retrieving information about content types and reusable field schemas. Support for create, update and delete operations will be added in the future.

For detailed information and instructions, see Content type management API.

**Extended logging**
The system now performs more detailed logging for the following functionality:

- Content synchronization – structured logging and tracing during various steps of the content sync process, including both the source instance and content restoration on the target. This helps developers and administrators analyze potential issues that may occur when synchronizing content. See Troubleshoot content sync to learn how to configure your preferred logging provider to receive all available content sync logs.
- Asynchronous tasks – logs that provide information about the start, completion and results of scheduled tasks and background services. This gives developers and administrators more insight into actions that occur in the application's background.

### Updates and changes

**Default event log size increased**
The default size of the event log (i.e., the value of the Event log size setting) was increased to 10 000 items on newly installed projects. No changes are applied when updating existing projects.

**Logging of pre-initialization events**
The system's logging functionality was updated to provide buffering of errors and other log triggers that occur during startup before the Xperience by Kentico application is initialized (InitKentico). The buffer content is included in the log output after the application is initialized.

## Output

When writing release notes, provide:
1. **Category**: New features / Updates and changes
2. **Release note**: The formatted release note following the structure above
