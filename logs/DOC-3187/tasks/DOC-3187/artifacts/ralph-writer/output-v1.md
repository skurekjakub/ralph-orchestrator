## Documentation Changes: DOC-3187 (iteration 1)

### Files Modified
- `src/_code/src/CodeSamples/Membership/Controllers/AccountController.cs` — Added `//Include:` / `//EndInclude:` markers for signin-get, signin-post, signout, register-get, register-post actions; added nested `commerce-cart-transfer` exclude region around ShoppingCartService coupling in signin-post
- `src/_code/src/CodeSamples/Membership/Models/Account/RegisterViewModel.cs` — Added `//Include:registerviewmodel` / `//EndInclude:registerviewmodel` markers
- `src/_code/src/CodeSamples/Membership/Models/Account/SignInViewModel.cs` — Added `//Include:signinviewmodel` / `//EndInclude:signinviewmodel` markers
- `src/_code/src/CodeSamples/Views/Account/SignIn.cshtml` — Added `@*Include:signin-view*@` / `@*EndInclude:signin-view*@` Razor comment markers
- `src/_code/src/CodeSamples/Views/Account/Register.cshtml` — Added `@*Include:register-view*@` / `@*EndInclude:register-view*@` Razor comment markers
- `src/_code/src/CodeSamples/Views/_ViewImports.cshtml` — Added `@using Kentico.Membership` and `@using Microsoft.AspNetCore.Identity` imports
- `src/_code/src/Website/Program.cs` — Added `//Include:identity-setup` / `//EndInclude:identity-setup` and `//Include:middleware-setup` / `//EndInclude:middleware-setup` markers
- `src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication.md` — Replaced 3 inline code blocks with `code_link` tags (identity-setup, middleware-setup, member-retrieval); 4 small config snippets kept inline
- `src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/forms-authentication.md` — Replaced ~10 inline code blocks with `code_link` tags; 3 small Program.cs config snippets kept inline; fixed 2 occurrences of `NoOpRoleStore` → `NoOpApplicationRole`
- `src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/external-authentication.md` — Replaced 2 inline code blocks with `code_link` tags (external sign-in view, external auth controller split into 3 marker regions); 5 small config/command snippets kept inline
- `src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md` — Replaced 2 inline code blocks with `code_link` tags (ExtendedApplicationUser, MemberListExtender); 2 small inline snippets kept

### Files Created
- `src/_code/src/CodeSamples/Membership/Controllers/PasswordResetController.cs` — Full password reset flow controller (Codesamples.Controllers namespace), marker: passwordreset-controller; uses `System.Net.WebUtility` instead of `System.Web.HttpUtility` (modern .NET)
- `src/_code/src/CodeSamples/Membership/Controllers/EmailConfirmationController.cs` — Email confirmation registration flow controller (Codesamples.Controllers namespace), markers: emailconfirmation-register, emailconfirmation-confirm
- `src/_code/src/CodeSamples/Membership/Models/Account/PasswordResetViewModels.cs` — PasswordResetRequestViewModel + ResetPasswordViewModel (Codesamples.Membership.Models namespace), markers: passwordreset-request-model, passwordreset-model
- `src/_code/src/CodeSamples/Membership/Models/Account/EmailConfirmationRegisterViewModel.cs` — Registration view model for email confirmation (Codesamples.Membership.Models namespace), marker: emailconfirmation-registermodel
- `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExternalAuthController.cs` — External authentication controller (Codesamples.Membership.Standalone namespace), markers: external-challenge, external-callback, external-sync; standalone because it requires external provider config
- `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExternalSignInView.cshtml` — Razor view listing external auth providers, marker: external-signin-view
- `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExtendedApplicationUser.cs` — Extended ApplicationUser with custom fields (Codesamples.Membership.Standalone namespace), marker: extended-user; fixed doc comments: `ApplicationUserManager<TUser>` → `UserManager<TUser>`
- `src/_code/src/CodeSamples/Membership/StandaloneSamples/MemberListExtender.cs` — PageExtender for MemberList admin page (Codesamples.Membership.Standalone namespace), marker: member-list-extender
- `src/_code/src/CodeSamples/Membership/StandaloneSamples/MemberRetrievalExample.cs` — Member retrieval pattern example (Codesamples.Membership.Standalone namespace), marker: member-retrieval

### Validation
- Codesamples Build: PASS (`npm run codesamples:build`)
- Docs Build: PASS (`npm run build`)
- Validator: PASS (all subtasks verified)

### Notes
- **`System.Web.HttpUtility` → `System.Net.WebUtility`**: The inline doc code used `System.Web.HttpUtility.UrlEncode`/`UrlDecode` which is a .NET Framework namespace. For modern .NET 8+, the PasswordResetController uses `System.Net.WebUtility` instead.
- **`ResetPasswordViewModel` property modifiers**: The `Password` and `PasswordConfirmation` properties use `string` (not `required string`) to allow object initializer usage in the controller without setting these values at construction time.
- **ExternalAuthController uses `IEventLogService`** instead of `ILogger` for consistency with the existing AccountController pattern in the codesamples project. The doc's inline code used `ILogger` but the codesamples project convention uses Xperience's `IEventLogService`.
- **ExternalSignInView.cshtml includes explicit `@using` directives** because it lives in `StandaloneSamples/` outside the `Views/` directory tree where `_ViewImports.cshtml` applies.
- **Razor comment markers** (`@*Include:id*@` / `@*EndInclude:id*@`) used for `.cshtml` files, matching the pattern discovered in `DigitalCommerce/ProductStock/StandaloneSamples/Views/ProductStockUsageExamples.cshtml`.
- **4 API discrepancies fixed**: 2x `ApplicationUserManager<TUser>` → `UserManager<TUser>` (in ExtendedApplicationUser.cs code file comments), 2x `NoOpRoleStore` → `NoOpApplicationRole` (inline in forms-authentication.md).
