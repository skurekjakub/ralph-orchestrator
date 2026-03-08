## Validation: PASS

### Phase 1 — Markers on Existing Files

**MODIFY-1: AccountController.cs** ✅
- `//Include:signin-get` / `//EndInclude:signin-get` — present (lines 40-48), wraps GET action
- `//Include:signin-post` / `//EndInclude:signin-post` — present (lines 50-92), wraps POST action
- `//Include:commerce-cart-transfer` / `//EndInclude:commerce-cart-transfer` — present (lines 75-84), nested inside signin-post
- `//Include:signout` / `//EndInclude:signout` — present (lines 94-104)
- `//Include:register-get` / `//EndInclude:register-get` — present (lines 106-114)
- `//Include:register-post` / `//EndInclude:register-post` — present (lines 116-164)

**MODIFY-2: RegisterViewModel.cs** ✅
- `//Include:registerviewmodel` / `//EndInclude:registerviewmodel` — present (lines 6-36), wraps full class

**MODIFY-3: SignInViewModel.cs** ✅
- `//Include:signinviewmodel` / `//EndInclude:signinviewmodel` — present (lines 6-22), wraps full class

**MODIFY-4: Register.cshtml** ✅
- `@*Include:register-view*@` / `@*EndInclude:register-view*@` — present (lines 6-47), uses Razor comment syntax

**MODIFY-5: SignIn.cshtml** ✅
- `@*Include:signin-view*@` / `@*EndInclude:signin-view*@` — present (lines 6-40), uses Razor comment syntax

**MODIFY-6: Website/Program.cs** ✅
- `//Include:identity-setup` / `//EndInclude:identity-setup` — present (lines 31-50), wraps full AddIdentity chain
- `//Include:middleware-setup` / `//EndInclude:middleware-setup` — present (lines 72-82), wraps UseAuthentication through UseAuthorization

**MODIFY-7: Views/_ViewImports.cshtml** ✅
- Contains `@using Kentico.Membership` (line 2)
- Contains `@using Microsoft.AspNetCore.Identity` (line 3)

### Phase 2 — New Files

**CREATE-1: PasswordResetController.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/Controllers/PasswordResetController.cs`
- Namespace: `Codesamples.Controllers` ✅
- `//Include:passwordreset-controller` / `//EndInclude:passwordreset-controller` — present (lines 16-162), wraps full class
- Uses `WebUtility.UrlEncode`/`UrlDecode` (modern .NET API, not `System.Web.HttpUtility`) ✅
- Uses `IEmailService` from `CMS.EmailEngine` ✅
- Uses `UserManager<ApplicationUser>` (not the non-existent `ApplicationUserManager`) ✅

**CREATE-2: PasswordResetViewModels.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/Models/Account/PasswordResetViewModels.cs`
- `//Include:passwordreset-request-model` (lines 6-16) ✅
- `//Include:passwordreset-model` (lines 18-37) ✅

**CREATE-3: EmailConfirmationController.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/Controllers/EmailConfirmationController.cs`
- Namespace: `Codesamples.Controllers` ✅
- `//Include:emailconfirmation-register` (lines 45-119) — wraps POST Register action ✅
- `//Include:emailconfirmation-confirm` (lines 121-149) — wraps ConfirmEmail action ✅

**CREATE-4: EmailConfirmationRegisterViewModel.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/Models/Account/EmailConfirmationRegisterViewModel.cs`
- `//Include:emailconfirmation-registermodel` (lines 6-33) ✅

**CREATE-5: ExternalAuthController.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExternalAuthController.cs`
- Namespace: `Codesamples.Membership.Standalone` ✅
- `//Include:external-challenge` (lines 32-49) ✅
- `//Include:external-callback` (lines 51-70) ✅
- `//Include:external-sync` (lines 72-149) ✅

**CREATE-6: ExternalSignInView.cshtml** ✅
- File exists at `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExternalSignInView.cshtml`
- `@*Include:external-signin-view*@` / `@*EndInclude:external-signin-view*@` (lines 7-23) ✅
- Uses `SignInManager.GetExternalAuthenticationSchemesAsync()` ✅

**CREATE-7: ExtendedApplicationUser.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExtendedApplicationUser.cs`
- Namespace: `Codesamples.Membership.Standalone` ✅
- `//Include:extended-user` (lines 7-45) ✅
- FIX-1 applied: Comment says "Microsoft.AspNetCore.Identity.UserManager<TUser>" (line 18) ✅
- FIX-2 applied: Comment says "Microsoft.AspNetCore.Identity.UserManager<TUser>" (line 32) ✅

**CREATE-8: MemberListExtender.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/StandaloneSamples/MemberListExtender.cs`
- Namespace: `Codesamples.Membership.Standalone` ✅
- `//Include:member-list-extender` (lines 8-22) ✅
- Uses `PageExtender<MemberList>` with correct imports ✅

**MemberRetrievalExample.cs** ✅
- File exists at `src/_code/src/CodeSamples/Membership/StandaloneSamples/MemberRetrievalExample.cs`
- `//Include:member-retrieval` (lines 13-27) ✅

### Phase 3 — Doc Pages Use code_link Tags

**registration-and-authentication.md** ✅
- 3 code_link tags: `identity-setup` (line 29), `middleware-setup` (line 42), `member-retrieval` (line 92)
- 4 inline blocks remain: RequireConfirmedAccount config, SecurityStampValidatorOptions, IVirtualContextDecorationArbiter, Not previewable authorization
- All source paths resolve to existing files ✅

**forms-authentication.md** ✅
- 13 code_link tags found covering: register-get, register-post, registerviewmodel, register-view, signin-get, signin-post (with exclude="commerce-cart-transfer"), signout, signinviewmodel, signin-view, passwordreset-controller, passwordreset-request-model, passwordreset-model, emailconfirmation-register, emailconfirmation-confirm, emailconfirmation-registermodel
- 3 inline blocks remain: Password policy config (line 112), AddDefaultTokenProviders (line 131), Email confirmation config (line 189)
- signin-post tag correctly uses `exclude="commerce-cart-transfer"` ✅
- All source paths resolve to existing files ✅

**external-authentication.md** ✅
- 4 code_link tags: external-signin-view (line 81), external-challenge (line 93), external-callback (line 95), external-sync (line 97)
- Remaining inline blocks: Google auth config, scope config, map claims snippet, cookie config, user-secrets commands, read stored secret
- All source paths resolve to existing files ✅

**add-fields-to-member-objects.md** ✅
- 2 code_link tags: extended-user (line 53), member-list-extender (line 98)
- 2 inline blocks remain: Identity config with extended class (line 61), AccountController constructor snippet (line 76)
- All source paths resolve to existing files ✅

### Phase 4 — API Discrepancies Fixed

**FIX-1/2: ApplicationUserManager → UserManager** ✅
- ExtendedApplicationUser.cs line 18: `// Called when retrieving member from Xperience via Microsoft.AspNetCore.Identity.UserManager<TUser>` — CORRECT
- ExtendedApplicationUser.cs line 32: `// Called when creating or updating members using Microsoft.AspNetCore.Identity.UserManager<TUser>` — CORRECT
- No remaining occurrences of `ApplicationUserManager` in any doc page ✅

**FIX-3/4: NoOpRoleStore → NoOpApplicationRole** ✅
- Zero occurrences of `NoOpRoleStore` in any doc page under `registration-and-authentication/` — FIXED
- All inline Identity config snippets correctly use `NoOpApplicationRole` ✅

### Build Verification

- `npm run codesamples:build`: **Build succeeded** (exit code 0, warnings only from NuGet vulnerabilities) ✅
- `npm run build` (docs site): **Build succeeded** (exit code 0) ✅

### Code Samples Convention Checks

- Namespace convention: Integrated code uses `Codesamples.Controllers` / `Codesamples.Membership.Models`; standalone code uses `Codesamples.Membership.Standalone` ✅
- Include/EndInclude markers correctly paired in all files ✅
- No `var` usage in code samples — explicit types used throughout ✅
- No edits to `Generated/` folder ✅
