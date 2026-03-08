---
name: ralph-codesamples-verification
description: "Functionally verify the ASP.NET Core codesamples application after implementing changes. Start the server, use playwright-cli to exercise the routes and interactions you implemented — browse pages, submit forms, trigger controller actions — and confirm the application behaves as expected. Use this skill whenever you modified controllers, services, views, or models in src/_code/src/."
---

# Code Samples Functional Verification

After implementing changes to the codesamples ASP.NET Core project, verify that the application **works as expected** — routes respond, pages render, forms submit, services return correct data. Use `playwright-cli` to interact with the running application the way a user would.

## Prerequisites

- `playwright-cli` must be available (run `playwright-cli open` to verify; if unavailable, use `npx playwright-cli`).
- Build must pass before verification:

```bash
npm run codesamples:build
```

- Start the application if not already running:

```bash
npm run codesamples:serve
```

Wait for the startup log confirming the server is ready before proceeding.

## What to Verify

Focus on the **features you implemented or modified**. Walk through them as a user would:

- If you added a **controller action** — navigate to its route and confirm it returns the expected page or redirect
- If you added a **form** — fill it out and submit it, verify the response (success page, validation errors for bad input, redirect)
- If you added a **service** — exercise it through the controller that consumes it, verify the data appears correctly on the page
- If you modified **views** — navigate to the page and verify the UI reflects your changes (elements present, data displayed, layout correct)
- If you added **DI registrations** — verify the application starts without dependency injection errors

## Verification Workflow

### 1. Open the application

```bash
playwright-cli open http://localhost:666
playwright-cli resize 1366 900
```

### 2. Exercise the routes you implemented

Navigate to each route your changes affect:

```bash
playwright-cli goto http://localhost:666/<route>
playwright-cli snapshot
```

For each page, use `snapshot` to inspect the DOM. Verify:
- The page loads (no 500 error page, no blank response)
- Expected content is present (headings, data, form fields)
- Dynamic data renders correctly (lists populated, values calculated)

### 6. Check for application errors

```bash
# Check browser console for .NET errors
playwright-cli console error

# Look for error pages in the DOM
playwright-cli eval "document.title.includes('Error') || document.body.innerText.includes('An error occurred')"

# Check for unhandled exception details (dev mode)
playwright-cli eval "document.querySelector('.error-page, [class*=\"exception\"]') !== null"
```

### Registration

```bash
playwright-cli goto http://localhost:666/account/register
playwright-cli snapshot
# Verify: registration form renders with all required fields
# Test validation
playwright-cli click <register-ref>  # Submit empty form
playwright-cli snapshot
# Verify: validation errors appear for required fields
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| 500 error page | Runtime exception in controller/service | Check `playwright-cli console error` for stack trace; fix the code |
| Blank page | View not found or rendering error | Verify view file exists at the correct path and `AddCodeSamplesViews()` discovers it |
| DI error on startup | Missing service registration | Check that new services are registered in the appropriate `IServiceCollection` extension method |
| Form submits but nothing happens | Missing `[HttpPost]` attribute or wrong route | Verify controller action attributes and form `asp-action` match |
| Data not appearing | Service returns empty/null | Debug the service — check database content, query filters, null checks |
| Redirect loop | Authentication required but not signed in | Sign in first, or add `[AllowAnonymous]` to the action |

## Cleanup

Stop the browser when verification is complete:

```bash
playwright-cli close
```

## Cleanup

Close the browser when done:

```bash
playwright-cli close
```
