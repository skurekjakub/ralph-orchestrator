## Source Code References in Comments

When citing Xperience source code in JIRA comments or handoff files, include navigable links to the source browser so reviewers can click through and verify.

### URL format

```
https://app-xbyk-source-prod.azurewebsites.net/#<Namespace/Path/ClassName.cs>,<LineNumber>
```

The URL path uses the **fully-qualified .NET namespace** from the source file's `namespace` declaration, not the filesystem path. The line number is optional but recommended. **Critical:** The namespace almost always starts with `CMS.`

Example:
- File on disk: `CMSSolution/DbDataManager/Installation/SqlInstallationHelper.cs`
- Namespace in file: `namespace CMS.DbDataManager.Installation`
- Correct URL: `https://app-xbyk-source-prod.azurewebsites.net/#CMS.DbDataManager/Installation/SqlInstallationHelper.cs,222`
- Wrong URL: `https://app-xbyk-source-prod.azurewebsites.net/#DbDataManager/Installation/SqlInstallationHelper.cs,222` (missing `CMS.` prefix)

Post as a JIRA link: `[ClassName.cs:L222|<url>]`