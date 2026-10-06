import type { JiraEnv, TaskDifficulty } from "./types.js";

const EASY_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Add a short section to the bottom of the reusable field schemas page (src/_documentation/_documentation/developers-and-admins/development/content-types/reusable-field-schemas.md). The section should mention that reusable field schemas cannot be nested inside other reusable field schemas, and that changes to a schema propagate to all content types that use it.",
        },
      ],
    },
  ],
};

const HARD_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The retrieve-content-items.md page briefly mentions the RetrieveContentOfReusableSchemas method alongside RetrieveContent and RetrieveContentOfContentTypes, but there is no detailed documentation explaining when and how to use schema-based retrieval.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Create a new documentation page under the content retrieval section (src/_documentation/_documentation/developers-and-admins/development/content-retrieval/) that provides detailed guidance on retrieving content items by reusable field schema. The page should:",
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Explain the use case: when an editor creates multiple content types that share a reusable field schema, developers need to query all items implementing that schema regardless of their specific content type.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Show a complete code example using RetrieveContentOfReusableSchemas with parameters like filtering, ordering, and language selection.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Document how schema-based retrieval handles linked items and generated classes — specifically, what type the retrieved items are when they have different content types but share the same schema.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Include a comparison table or note explaining when to use RetrieveContent (single type) vs RetrieveContentOfContentTypes (multiple types) vs RetrieveContentOfReusableSchemas (schema-based).",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Research the Xperience source code to find the RetrieveContentOfReusableSchemas method signature, its parameter class, and any important configuration options. Use the actual parameter names and return types from the source code.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "After creating the page, add a cross-reference from the existing retrieve-content-items.md page (where RetrieveContentOfReusableSchemas is currently mentioned as a bullet point) linking to the new detailed page.",
        },
      ],
    },
  ],
};

const VERY_HARD_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The content retrieval documentation has pages for retrieving items by type (retrieve-content-items.md), pages (retrieve-page-content.md), headless content (retrieve-headless-content.md), and media files (retrieve-content-from-media-libraries.md). However, there is no page explaining how to retrieve content across multiple content types using the RetrieveContentOfContentTypes and RetrieveContentOfReusableSchemas API methods.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Create a new documentation page under the content retrieval section (src/_documentation/_documentation/developers-and-admins/development/content-retrieval/) that covers cross-type content retrieval. The page should:",
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Explain when developers need to retrieve content across multiple types — for example, a news feed that mixes Articles, PressReleases, and BlogPosts, or a search results page that returns items of any type implementing a shared schema.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Document the RetrieveContentOfContentTypes method: show how to query items of multiple content types in a single call, how the results are typed when the types have different fields, and how to filter/sort across types.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Document the RetrieveContentOfReusableSchemas method: show how schema-based retrieval works, when to use it instead of multi-type retrieval, and how the returned items relate to the schema interface.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Include a comparison section explaining the tradeoffs: RetrieveContent (strongly typed, single type) vs RetrieveContentOfContentTypes (multiple types, need to handle heterogeneous results) vs RetrieveContentOfReusableSchemas (unified interface via schema, but limited to schema fields).",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Provide at least two complete code examples with different scenarios." },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Research the Xperience source code to find the actual method signatures, parameter classes, and return types for both methods. Pay attention to how results handle type heterogeneity — the documentation should accurately describe the actual types developers will work with.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "After creating the new page, update these existing pages with cross-references:",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "retrieve-content-items.md — where both methods are mentioned as bullet points, add links to the new detailed page",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "The parent content-retrieval.md index page — add the new page to the topic list",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "reusable-field-schemas.md (in the content-types section) — if it does not already mention schema-based retrieval, add a 'See also' note linking to the new page",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const HARD_ADMIN_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The admin UI customization section documents UI form component visibility conditions (ui-form-component-visibility-conditions.md) in detail, covering conditions with and without field dependencies, registration, and attribute assignment. However, unlike form components — which have a dedicated 'Example - Color selector UI form component' walkthrough — visibility conditions have no end-to-end example page showing a complete custom implementation.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Create a new example page under the UI form components section (src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/) titled 'Example - Role-based visibility condition' that demonstrates a complete custom visibility condition. The page should:",
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Explain the scenario: an admin form has fields that should only be visible to users with specific roles (e.g., an 'Advanced settings' section visible only to administrators). This is a condition without field dependencies — it evaluates based on the current user's role rather than other form field values.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Show the complete back-end implementation: a C# visibility condition class inheriting from VisibilityConditionDefinition, implementing the Evaluate method, with a configurable Role property. Include the registration attribute (RegisterFormVisibilityCondition) and the condition attribute class for assigning it to properties.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Show how to assign the condition to a model property using attribute notation, and demonstrate configuring the required role via the attribute's constructor parameters.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Include a note explaining when to use a contextual visibility condition (like this role-based example) vs a field-dependency visibility condition (that evaluates based on other form values), linking to the relevant sections of the visibility conditions reference page.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Research the Xperience source code to find the VisibilityConditionDefinition base class, the Evaluate method signature, and the RegisterFormVisibilityCondition attribute. Use the actual parameter names, return types, and namespace from the source code.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "After creating the example page, add a cross-reference from the existing visibility conditions page (ui-form-component-visibility-conditions.md) — in the section about conditions without field dependencies — linking to the new example page as a practical walkthrough.",
        },
      ],
    },
  ],
};

const HARD_CICD_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The 'Enable CI/CD for object types' page (enable-ci-cd-for-object-types.md in customization/object-types/object-type-configuration/) documents ContinuousIntegrationSettings properties in a reference table, but the practical guidance is limited to setting 'Enabled = true'. Several advanced serialization features lack practical examples or explanations of when and how to use them.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Add new sections to the existing enable-ci-cd-for-object-types.md page covering the following advanced CI/CD patterns:",
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "A 'Separated fields' section explaining when and how to use the SeparatedFields property. This feature stores large field data (such as HTML content or XML configuration) in individual files instead of inline in the main XML. Show a code example using the SeparatedField class with field name and binary flag. Explain why this matters for source control (diff readability, merge conflict reduction).",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "A 'Custom file name transformers' section showing how ObjectFileNameFieldTransformers works. The FileNameFieldTransformer class has a FieldName (string) and Action (Func<object, string>) — show a practical example of transforming a numeric identifier into a human-readable file name, and explain how this interacts with ObjectFileNameFields.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "A 'Filtered CI/CD serialization' section explaining how FilterCondition, FilterColumn, FilterDependencies, and UsesCustomFiltering work together. Give a practical scenario: an object type where only objects with a specific status or belonging to a specific parent should be serialized. Show how the filtering properties cooperate to achieve conditional serialization.",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Research the Xperience source code to find the SeparatedField class, FileNameFieldTransformer class, and the filtering property implementations. Use the actual class names, property types, and constructor signatures from the source code. Look in the DataEngine/Data/Types/TypeInfo/Settings/ directory.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "After updating the page, add a cross-reference from the Reference - ObjectTypeInfo page (reference-objecttypeinfo.md) to the new sections where the ContinuousIntegrationSettings properties are mentioned.",
        },
      ],
    },
  ],
};

const VERY_HARD_ADMIN_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The admin UI customization documentation covers PageExtender<T> for extending UI pages but is completely missing documentation for the parallel FormComponentExtender<T> system — a public API that allows developers to extend form components with custom commands and configuration logic. The source code in Admin/Kentico.Xperience.Admin.Base/Forms/Form/Extenders/ contains the full public API (FormComponentExtender<T> base class, FormComponentExtenderAttribute registration, IFormComponentExtender interface) but none of it appears in the documentation.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Create a new documentation page under the UI form components section (src/_documentation/_documentation/developers-and-admins/customization/extend-the-administration-interface/ui-form-components/) titled 'Form component extenders' that covers this extensibility system. The page should:",
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Explain the concept: form component extenders modify the behavior of existing form components, analogous to how PageExtender<T> extends UI pages. They can override ConfigureComponent() to modify component state and define custom commands via the [FormComponentCommand] attribute.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Document the FormComponentExtender<T> base class: the generic type parameter constrained to IFormComponent, the FormComponent property for accessing the extended component, the ConfigureComponent() override for modifying component state, and ResponseFrom<T>() for returning command responses.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Document the registration pattern: the FormComponentExtenderAttribute assembly-level attribute (from Kentico.Xperience.Admin.Base.Forms namespace). Show how to register an extender with [assembly: FormComponentExtender(typeof(MyExtender))].",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Provide at least two code examples: (1) an extender that overrides ConfigureComponent() to modify a form component's client properties or validation, and (2) an extender with a custom [FormComponentCommand] that adds server-side logic invokable from the form component's client template.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Include a comparison note explaining when to use a FormComponentExtender (modify existing components without subclassing) vs creating a custom FormComponent (full control over new component behavior) vs using a FormComponentConfigurator (dynamic property configuration at runtime).",
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Research the Xperience source code to find the FormComponentExtender<T> class, IFormComponentExtender interface, and FormComponentExtenderAttribute in Admin/Kentico.Xperience.Admin.Base/Forms/Form/Extenders/. Also examine the built-in extenders (AssetSelectorFormComponentExtender, RichTextEditorFormComponentExtender) as implementation references. Use the actual namespaces, method signatures, and type constraints from the source code.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "After creating the new page, update these existing pages with cross-references:",
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "editing-components.md — in the 'Configure components dynamically' section, add a note mentioning form component extenders as an alternative approach, with a link to the new page",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "configure-editing-component-state.md — add a 'See also' section or note mentioning that form component extenders offer an alternative to configurators for modifying component behavior",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "The parent UI form components landing page (if one exists) or the admin UI model overview page — add the new page to the navigation/topic list",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const MEDIUM_DESCRIPTION = {
  version: 1,
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "The data caching page (src/_documentation/_documentation/developers-and-admins/development/caching/data-caching.md) documents basic IProgressiveCache usage but lacks guidance on production-ready caching patterns.",
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Add the following to the existing data-caching.md page:",
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { order: 1 },
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "A new section titled 'Cache expiration strategies' (after the existing cache examples) that explains the difference between sliding and absolute expiration in IProgressiveCache. Include a code example showing how to set absolute expiration for time-sensitive data (e.g., content that should refresh every 10 minutes regardless of access patterns).",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "A warning callout somewhere appropriate noting that cache keys must be unique across the entire application — if two different components use the same cache key string, they will silently share cached data, leading to type mismatches or incorrect results.",
                },
              ],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Research the Xperience source code to verify the IProgressiveCache.LoadAsync method signature and the CacheSettings class properties. Make sure any parameter names, defaults, or configuration options mentioned in your additions match the actual source code.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function getDescription(difficulty: TaskDifficulty) {
  if (difficulty === "very-hard-admin") return VERY_HARD_ADMIN_DESCRIPTION;
  if (difficulty === "very-hard") return VERY_HARD_DESCRIPTION;
  if (difficulty === "hard-cicd") return HARD_CICD_DESCRIPTION;
  if (difficulty === "hard-admin") return HARD_ADMIN_DESCRIPTION;
  if (difficulty === "hard") return HARD_DESCRIPTION;
  if (difficulty === "medium") return MEDIUM_DESCRIPTION;
  return EASY_DESCRIPTION;
}

function makeClient(env: JiraEnv) {
  const base = `https://api.atlassian.com/ex/jira/${env.cloudId}/rest/api/3`;
  const auth = "Basic " + Buffer.from(`${env.email}:${env.apiToken}`).toString("base64");

  return async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const url = path.startsWith("http") ? path : `${base}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: auth,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(`${method} ${path} → ${res.status}: ${text}`);
    }
    return res;
  };
}

export async function fetchIssue(issueKey: string, env: JiraEnv) {
  const request = makeClient(env);
  const res = await request("GET", `/issue/${issueKey}?fields=status,comment,attachment,summary`);
  return res.json();
}

export async function deleteComments(issueKey: string, issue: any, env: JiraEnv) {
  const request = makeClient(env);
  const comments = issue.fields?.comment?.comments ?? [];
  if (comments.length === 0) {
    console.log("  ✓ No comments to delete");
    return;
  }
  console.log(`  Deleting ${comments.length} comments...`);
  for (const c of comments) {
    await request("DELETE", `/issue/${issueKey}/comment/${c.id}`);
    process.stdout.write(".");
  }
  console.log(" done");
}

export async function deleteAttachments(issueKey: string, issue: any, env: JiraEnv) {
  const request = makeClient(env);
  const attachments: any[] = issue.fields?.attachment ?? [];
  if (attachments.length === 0) {
    console.log("  ✓ No attachments to delete");
    return;
  }
  console.log(`  Deleting ${attachments.length} attachments...`);
  for (const a of attachments) {
    await request("DELETE", `/attachment/${a.id}`);
    process.stdout.write(".");
  }
  console.log(" done");
}

export async function resetFields(issueKey: string, env: JiraEnv, difficulty: TaskDifficulty) {
  const request = makeClient(env);
  const suffix = difficulty === "easy" ? "(easy)" : `(${difficulty})`;
  console.log(`  Setting summary and description ${suffix}...`);
  await request("PUT", `/issue/${issueKey}`, {
    fields: {
      summary: `[Test] Ralph sandbox issue — ${issueKey}`,
      description: getDescription(difficulty),
    },
  });
  console.log("  ✓ Fields updated");
}

export async function postComment(issueKey: string, comment: string, env: JiraEnv) {
  const request = makeClient(env);
  await request("POST", `/issue/${issueKey}/comment`, {
    body: {
      version: 1,
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: comment }] }],
    },
  });
  console.log(`  ✓ Posted comment: ${comment}`);
}

export async function transitionToToDo(issueKey: string, env: JiraEnv) {
  const request = makeClient(env);
  const res = await request("GET", `/issue/${issueKey}/transitions`);
  const data = (await res.json()) as { transitions: { id: string; name: string }[] };
  const todo = data.transitions.find((t) => t.name.toLowerCase() === "to do");

  if (!todo) {
    const available = data.transitions.map((t) => `${t.name} (${t.id})`).join(", ");
    console.log(`  ⚠ No "To Do" transition found. Available: ${available}`);
    console.log('  Issue may already be in "To Do" or the workflow doesn\'t allow this transition.');
    return;
  }

  console.log(`  Transitioning to "To Do" (id=${todo.id})...`);
  await request("POST", `/issue/${issueKey}/transitions`, { transition: { id: todo.id } });
  console.log("  ✓ Transitioned to To Do");
}
