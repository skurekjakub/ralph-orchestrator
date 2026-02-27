/**
 * JIRA data source connector.
 *
 * Wraps {@link IJiraClient} and maps between JIRA-specific types and generic
 * {@link WorkItem} types. All ADF conversion, custom field extraction, and
 * transition ID resolution happen inside this connector.
 */

import type { IJiraClient } from "../../../jira/client.js";
import type { IDataSourceConnector, ISupportsAttachments, ISupportsTransitions, SourceQuery } from "../../connector.js";
import type { WorkItem, WorkItemComment, WorkItemAttachment, WorkItemTransition } from "../../types.js";
import type { Logger } from "../../../logger.js";
import {
  mapIssueToWorkItem,
  mapCommentToWorkItemComment,
  mapAttachmentToWorkItemAttachment,
  mapTransitionToWorkItemTransition,
} from "./jira-mapper.js";

/** JIRA issue key pattern: one or more uppercase letters, dash, one or more digits. */
const JIRA_KEY_PATTERN = /^[A-Z][A-Z0-9]*-\d+$/;

/**
 * Implements {@link IDataSourceConnector} for Atlassian JIRA Cloud.
 *
 * Supports all capabilities: discovery, comments, transitions, and attachments.
 * Delegates HTTP calls to {@link IJiraClient} and uses the mapper functions
 * to convert JIRA responses into generic work item types.
 */
export class JiraConnector implements IDataSourceConnector, ISupportsTransitions, ISupportsAttachments {
  readonly name = "JIRA";
  readonly sourceKey: string;

  private readonly client: IJiraClient;
  private readonly excludeFields: string[];
  private readonly allowedUsers: readonly string[];
  private readonly logger?: Logger;

  constructor(sourceKey: string, client: IJiraClient, excludeFields: string[] = [], allowedUsers: readonly string[] = [], logger?: Logger) {
    this.sourceKey = sourceKey;
    this.client = client;
    this.excludeFields = excludeFields;
    this.allowedUsers = allowedUsers;
    this.logger = logger;
  }

  getAllowedUsers(): readonly string[] {
    return this.allowedUsers;
  }

  // ── IWorkItemSource ─────────────────────────────────────────

  buildQueries(profiles: readonly { match: { projects: string[]; statuses?: string[] } }[]): SourceQuery[] {
    const queries = new Set<string>();

    for (const profile of profiles) {
      const allStatuses = [...new Set(profile.match.statuses ?? [])];

      for (const project of profile.match.projects) {
        const clauses: string[] = [`project = "${project}"`];

        if (allStatuses.length === 1) {
          clauses.push(`status = "${allStatuses[0]}"`);
        } else if (allStatuses.length > 1) {
          const list = allStatuses.map(s => `"${s}"`).join(", ");
          clauses.push(`status IN (${list})`);
        }

        queries.add(`${clauses.join(" AND ")} ORDER BY created ASC`);
      }
    }

    return [...queries];
  }

  async searchWorkItems(query: SourceQuery, pageSize?: number): Promise<WorkItem[]> {
    const issues = await this.client.searchIssues(query, pageSize);
    return issues.map(i => mapIssueToWorkItem(i, this.sourceKey, this.excludeFields));
  }

  async refreshWorkItem(workItemId: string): Promise<WorkItem> {
    const issues = await this.client.searchIssues(`key = "${workItemId}"`, 1);
    if (!issues[0]) throw new Error(`Work item ${workItemId} not found in JIRA`);
    return mapIssueToWorkItem(issues[0], this.sourceKey, this.excludeFields);
  }

  isValidItemId(id: string): boolean {
    return JIRA_KEY_PATTERN.test(id);
  }

  // ── IWorkItemComments ───────────────────────────────────────

  async getComments(workItemId: string): Promise<WorkItemComment[]> {
    const comments = await this.client.getComments(workItemId);
    return comments.map(mapCommentToWorkItemComment);
  }

  async addComment(workItemId: string, bodyText: string): Promise<void> {
    await this.client.addComment(workItemId, bodyText);
  }

  // ── IWorkItemTransitions ────────────────────────────────────

  async getTransitions(workItemId: string): Promise<WorkItemTransition[]> {
    const transitions = await this.client.getTransitions(workItemId);
    return transitions.map(mapTransitionToWorkItemTransition);
  }

  async transitionWorkItem(workItemId: string, targetStatus: string): Promise<void> {
    const transitionId = await this.client.findTransitionId(workItemId, targetStatus);
    if (!transitionId) {
      throw new Error(`No transition to "${targetStatus}" available for ${workItemId}`);
    }
    await this.client.transitionIssue(workItemId, transitionId);
  }

  // ── IWorkItemAttachments ────────────────────────────────────

  async getAttachments(workItemId: string): Promise<WorkItemAttachment[]> {
    const attachments = await this.client.getAttachments(workItemId);
    return attachments.map(mapAttachmentToWorkItemAttachment);
  }

  async downloadAttachment(workItemId: string, attachmentId: string): Promise<string> {
    const attachments = await this.client.getAttachments(workItemId);
    const att = attachments.find(a => a.id === attachmentId);
    if (!att) {
      throw new Error(`Attachment ${attachmentId} not found on ${workItemId}`);
    }
    return this.client.downloadAttachment(att.content);
  }

  async addAttachment(workItemId: string, filename: string, content: string | Buffer): Promise<void> {
    const text = typeof content === "string" ? content : content.toString("utf-8");
    await this.client.addAttachment(workItemId, filename, text);
  }
}
