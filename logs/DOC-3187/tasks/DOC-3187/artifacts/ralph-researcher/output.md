## Research Report: DOC-3187

### Task Understanding

Migrate ~20 inline code blocks from 4 registration/authentication documentation pages into compilable C# files in the CodeSamples project. Unlike the prior DOC-3186 approach (which put everything in `StandaloneSamples/`), this task requires:

1. **Reusing existing `AccountController.cs`** with `//Include:`/`//EndInclude:` markers and the `exclude` parameter to hide the `ShoppingCartService` dependency from documentation readers
2. **Creating new controllers** for password reset, email confirmation, external auth, and custom fields — integrated into the webapp's MVC structure where possible
3. **Creating standalone samples** only for code that requires external configuration (e.g., external auth providers)
4. **Replacing inline `{% code %}` blocks** with `{% code_link %}` tags pointing to the new files
5. **Fixing the `ApplicationUserManager<TUser>` → `UserManager<TUser>` doc comment error** (2 occurrences)
6. **Fixing the `NoOpRoleStore` → `NoOpApplicationRoleStore` doc error** (2 occurrences, discovered during research)

### Prior Knowledge (Ralphchives)

**DOC-3186** (topic #28): Prior attempt put everything in `Membership/StandaloneSamples/` — 19 files, PR #3033. Key observations:
- `ApplicationUserManager<TUser>` does not exist in Xperience source — confirmed documentation error in 2 places
- Existing `AccountController.cs` has `ShoppingCartService` coupling from commerce
- Used `Codesamples.Membership.Standalone` namespace matching `Codesamples.Commerce.Standalone` convention
- All 3 reviewers approved on first pass

DOC-3187 supersedes DOC-3186: integrate into webapp with proper MVC structure, reuse AccountController.cs via selective `//Include:` markers. The `StandaloneSamples/` directory does **not exist** on the current branch — DOC-3186's work was either reverted or never merged to main.

### Existing Documentation

#### Target Pages

1. **`src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication.md`**
   - Identifier: `tYouCw`, order: 500, persona: developer
   - Parent page for the registration/authentication section
   - Contains: Identity setup, middleware config, member retrieval pattern, Identity architecture overview, ApplicationUser.Enabled remarks, SecurityStampValidator config, preview mode info
   - **Currently zero `code_link` tags** — all inline `{% code %}` blocks

2. **`src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/forms-authentication.md`**
   - Identifier: `t4ouCw`, order: 100, persona: developer
   - Contains: Registration actions, RegisterViewModel, Register.cshtml view, Sign-in actions, SignInViewModel, SignIn.cshtml view, password policy, password reset controller+models, email confirmation controller+model
   - **Currently zero `code_link` tags** — all inline `{% code %}` blocks

3. **`src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/external-authentication.md`**
   - Identifier: `uIouCw`, order: 200, persona: developer
   - Contains: Google auth config, external sign-in view, full external auth controller flow, scope config, claims mapping, cookie config, secrets management
   - **Currently zero `code_link` tags** — all inline `{% code %}` blocks

4. **`src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/add-fields-to-member-objects.md`**
   - Identifier: `uoouCw`, order: 300, persona: developer
   - Contains: ExtendedApplicationUser class, Identity config with extended class, MemberListExtender
   - **Currently zero `code_link` tags** — all inline `{% code %}` blocks

#### Sibling Pages

- `src/_documentation/_documentation/developers-and-admins/development/registration-and-authentication/` also contains children visible via frontmatter order values

### Existing Code Samples

#### Current Membership folder structure
```
src/_code/src/CodeSamples/Membership/
├── Controllers/
│   └── AccountController.cs          ← Has ShoppingCartService dependency
├── Models/
│   └── Account/
│       ├── RegisterViewModel.cs
│       └── SignInViewModel.cs
```

No `StandaloneSamples/` directory exists (DOC-3186 work was not merged).

#### Views
```
src/_code/src/CodeSamples/Views/Account/
├── SignIn.cshtml
├── Register.cshtml
└── MyAccount.cshtml
```

#### AccountController.cs — Full Content (the reuse target)

```csharp
using System;
using System.Net;
using System.Threading;
using System.Threading.Tasks;

using CMS.Core;

using Codesamples.Commerce;               // ← ShoppingCartService import
using Codesamples.Membership.Models;

using Kentico.Membership;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;

using SignInResult = Microsoft.AspNetCore.Identity.SignInResult;

namespace Codesamples.Controllers;

public class AccountController : Controller
{
    private readonly IEventLogService eventLogService;
    private readonly UserManager<ApplicationUser> userManager;
    private readonly SignInManager<ApplicationUser> signInManager;
    private readonly ShoppingCartService shoppingCartService;       // ← Commerce coupling

    public AccountController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IEventLogService eventLogService,
        ShoppingCartService shoppingCartService)                    // ← Commerce coupling
    {
        this.userManager = userManager;
        this.signInManager = signInManager;
        this.eventLogService = eventLogService;
        this.shoppingCartService = shoppingCartService;             // ← Commerce coupling
    }

    // GET: Account/SignIn
    [HttpGet]
    [AllowAnonymous]
    public ActionResult SignIn()
    {
        return View();
    }

    // POST: Account/SignIn
    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult> SignIn(SignInViewModel model, CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return View(model);
        }

        var signInResult = SignInResult.Failed;

        try
        {
            signInResult = await signInManager.PasswordSignInAsync(model.UserName, model.Password, model.StaySignedIn, false);
        }
        catch (Exception ex)
        {
            eventLogService.LogException("AccountController", "Login", ex);
        }

        if (signInResult.Succeeded)
        {
            // Transfer anonymous cart to member on sign-in
            var user = await userManager.FindByNameAsync(model.UserName);
            if (user is not null)
            {
                var memberName = user.UserName is not null ? user.UserName : "";
                await shoppingCartService.HandleMemberSignIn(memberName, cancellationToken);   // ← Commerce coupling
            }

            return RedirectToAction(nameof(MyAccount));
        }

        ModelState.AddModelError(string.Empty, "Your sign-in attempt was not successful. Please try again.");

        return View(model);
    }

    // POST: Account/SingOut
    [Authorize]
    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult> Logout()
    {
        await signInManager.SignOutAsync();
        return RedirectToAction("Index", "Home");
    }

    // GET: Account/Register
    [HttpGet]
    [AllowAnonymous]
    public ActionResult Register()
    {
        return View();
    }

    // POST: Account/Register
    [HttpPost]
    [AllowAnonymous]
    [ValidateAntiForgeryToken]
    public async Task<ActionResult> Register(RegisterViewModel model)
    {
        if (!ModelState.IsValid)
        {
            return View(model);
        }

        var member = new ApplicationUser
        {
            UserName = model.UserName,
            Email = model.Email,
            Enabled = true
        };

        var registerResult = new IdentityResult();

        try
        {
            registerResult = await userManager.CreateAsync(member, model.Password);
        }
        catch (Exception ex)
        {
            eventLogService.LogException("AccountController", "Register", ex);
            ModelState.AddModelError(string.Empty, "Your registration was not successful.");
        }

        if (registerResult.Succeeded)
        {
            var signInResult = await signInManager.PasswordSignInAsync(member, model.Password, true, false);

            if (signInResult.Succeeded)
            {
                return RedirectToAction("Index", "Home");
            }
        }

        foreach (var error in registerResult.Errors)
        {
            ModelState.AddModelError(string.Empty, error.Description);
        }

        return View(model);
    }

    // GET: Account/MyAccount
    [Authorize]
    [HttpGet]
    public async Task<ActionResult> MyAccount()
    {
        var user = await userManager.GetUserAsync(User);
        return View(user);
    }
}
```

**Key challenge for `//Include:` markers**: The `ShoppingCartService` dependency appears in:
1. Using directive (line 8): `using Codesamples.Commerce;`
2. Field declaration (line 26): `private readonly ShoppingCartService shoppingCartService;`
3. Constructor parameter (line 32): `ShoppingCartService shoppingCartService`
4. Constructor assignment (line 37): `this.shoppingCartService = shoppingCartService;`
5. SignIn POST action (lines 72-78): Cart transfer logic after successful sign-in

**Strategy for markers**: Use `//Include:` regions that:
- Wrap each action individually (signin-get, signin-post, signout, register-get, register-post)
- In `signin-post`, use a nested exclude region around the cart transfer logic
- Do NOT include the constructor/field declarations in any marker (they contain ShoppingCartService); instead show them in a separate marker that excludes commerce fields, OR let the docs keep a small inline snippet for the controller class declaration

Actually, looking at the JIRA description more carefully, the `exclude` approach is designed for `signin-post`:
- Wrap the entire `SignIn` POST action with `//Include:signin-post`
- Wrap the cart transfer portion with a nested `//Include:commerce-cart-transfer`
- Use `{% code_link ... id="signin-post" exclude="commerce-cart-transfer" %}` to show the action without the cart logic

For the class declaration + constructor, we need a separate approach since the constructor itself has ShoppingCartService. Options:
1. Create a separate marker for the class header/constructor that excludes commerce services
2. Leave the class declaration inline in the docs (as currently done)

The JIRA says: "Reuse existing AccountController.cs (hiding DigitalCommerce coupling via selective //Include: markers) for basic sign-in/register" — so the intent is to use markers that select only the action method regions, which already don't reference ShoppingCartService (except signin-post's cart transfer block).

#### RegisterViewModel.cs — Full Content
```csharp
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace Codesamples.Membership.Models;

public class RegisterViewModel
{
    [DataType(DataType.Text)]
    [Required(ErrorMessage = "Please enter your username")]
    [DisplayName("User name")]
    [RegularExpression("^[a-zA-Z0-9_\\-\\.]+$", ErrorMessage = "Please enter a valid username")]
    [MaxLength(100, ErrorMessage = "Maximum allowed length of the input text is {1}")]
    public required string UserName { get; set; }

    [DataType(DataType.EmailAddress)]
    [Required(ErrorMessage = "Please enter your email")]
    [DisplayName("Email")]
    [EmailAddress(ErrorMessage = "Please enter a valid email address")]
    [MaxLength(100, ErrorMessage = "Maximum allowed length of the input text is {1}")]
    public required string Email { get; set; }

    [DataType(DataType.Password)]
    [DisplayName("Password")]
    [Required(ErrorMessage = "Please enter your password")]
    [MaxLength(100, ErrorMessage = "Maximum allowed length of the input text is {1}")]
    public required string Password { get; set; }

    [DataType(DataType.Password)]
    [DisplayName("Confirm your password")]
    [Required(ErrorMessage = "Please confirm your password")]
    [MaxLength(100, ErrorMessage = "Maximum allowed length of the input text is {1}")]
    [Compare("Password", ErrorMessage = "Password does not match the confirmation password")]
    public required string PasswordConfirmation { get; set; }
}
```

#### SignInViewModel.cs — Full Content
```csharp
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;

namespace Codesamples.Membership.Models;

public class SignInViewModel
{
    [Required(ErrorMessage = "Please enter your user name")]
    [DisplayName("User name")]
    [MaxLength(100, ErrorMessage = "Maximum allowed length of the input text is {1}")]
    public required string UserName { get; set; }

    [DataType(DataType.Password)]
    [DisplayName("Password")]
    [MaxLength(100, ErrorMessage = "Maximum allowed length of the input text is {1}")]
    public required string Password { get; set; }

    [DisplayName("Stay signed in")]
    public bool StaySignedIn { get; set; }
}
```

#### Views/Account/SignIn.cshtml — Full Content
```cshtml
@model Codesamples.Membership.Models.SignInViewModel
@{
    ViewData["Title"] = "Sign In";
}

<div class="form-container">
    <h1>Sign In</h1>

    @if (!ViewData.ModelState.IsValid)
    {
        <div asp-validation-summary="All" class="form-validation-summary"></div>
    }

    <form asp-action="SignIn" method="post">
        <div class="form-group">
            <label asp-for="UserName" class="form-label"></label>
            <input asp-for="UserName" class="form-input" />
            <span asp-validation-for="UserName" class="form-error"></span>
        </div>

        <div class="form-group">
            <label asp-for="Password" class="form-label"></label>
            <input asp-for="Password" class="form-input" />
            <span asp-validation-for="Password" class="form-error"></span>
        </div>

        <div class="form-group form-checkbox-group">
            <input asp-for="StaySignedIn" class="form-checkbox" />
            <label asp-for="StaySignedIn" class="form-label" style="margin-bottom: 0;"></label>
        </div>

        <button type="submit" class="btn btn-primary btn-block">Sign In</button>
    </form>

    <div class="form-helper-text">
        Don't have an account? <a asp-action="Register">Register here</a>
    </div>
</div>
```

#### Views/Account/Register.cshtml — Full Content
```cshtml
@model Codesamples.Membership.Models.RegisterViewModel
@{
    ViewData["Title"] = "Register";
}

<div class="form-container">
    <h1>Register</h1>

    @if (!ViewData.ModelState.IsValid)
    {
        <div asp-validation-summary="All" class="form-validation-summary"></div>
    }

    <form asp-action="Register" method="post">
        <div class="form-group">
            <label asp-for="UserName" class="form-label"></label>
            <input asp-for="UserName" class="form-input" />
            <span asp-validation-for="UserName" class="form-error"></span>
        </div>

        <div class="form-group">
            <label asp-for="Email" class="form-label"></label>
            <input asp-for="Email" class="form-input" />
            <span asp-validation-for="Email" class="form-error"></span>
        </div>

        <div class="form-group">
            <label asp-for="Password" class="form-label"></label>
            <input asp-for="Password" class="form-input" />
            <span asp-validation-for="Password" class="form-error"></span>
        </div>

        <div class="form-group">
            <label asp-for="PasswordConfirmation" class="form-label"></label>
            <input asp-for="PasswordConfirmation" class="form-input" />
            <span asp-validation-for="PasswordConfirmation" class="form-error"></span>
        </div>

        <button type="submit" class="btn btn-primary btn-block">Register</button>
    </form>

    <div class="form-helper-text">
        Already have an account? <a asp-action="SignIn">Sign in here</a>
    </div>
</div>
```

#### Website/Program.cs — Current Identity Configuration
```csharp
// Adds and configures ASP.NET Identity for the application
builder.Services.AddIdentity<ApplicationUser, NoOpApplicationRole>(options =>
{
    // Ensures that disabled member accounts cannot sign in
    options.SignIn.RequireConfirmedAccount = true;
    // Ensures unique emails for registered accounts
    options.User.RequireUniqueEmail = true;

    options.Password.RequireDigit = false;
    options.Password.RequireNonAlphanumeric = false;
    options.Password.RequiredLength = 4;
    options.Password.RequireUppercase = false;
    options.Password.RequireLowercase = false;
})
    .AddUserStore<ApplicationUserStore<ApplicationUser>>()
    .AddRoleStore<NoOpApplicationRoleStore>()
    .AddUserManager<UserManager<ApplicationUser>>()
    .AddSignInManager<SignInManager<ApplicationUser>>();
```

### Source Code Findings

#### Kentico.Membership.ApplicationUser
- **File**: `resources/repositories/xperience/CMSSolution/Mvc/Kentico.Membership/Stores/Channels/ApplicationUser.cs`
- **Namespace**: `Kentico.Membership`
- **Declaration**: `public class ApplicationUser : IdentityUser<int>`
- **Key Properties**: `Enabled` (bool), `IsExternal` (bool), `Email` (inherited), `UserName` (inherited)
- **MapFromMemberInfo**:
  ```csharp
  public virtual void MapFromMemberInfo(MemberInfo source)
  {
      if (source == null) throw new ArgumentNullException(nameof(source));
      Id = source.MemberID;
      UserName = source.MemberName;
      Email = source.MemberEmail;
      Enabled = source.MemberEnabled;
      SecurityStamp = source.MemberSecurityStamp;
      IsExternal = source.MemberIsExternal;
      PasswordHash = source.MemberPassword;
      NormalizedUserName = null;
      NormalizedEmail = null;
  }
  ```
- **MapToMemberInfo**:
  ```csharp
  public virtual void MapToMemberInfo(MemberInfo target)
  {
      if (target == null) throw new ArgumentNullException(nameof(target));
      target.MemberName = UserName;
      target.MemberEmail = Email;
      target.MemberEnabled = Enabled;
      target.MemberSecurityStamp = SecurityStamp;
      target.MemberIsExternal = IsExternal;
      target.MemberPassword = PasswordHash;
  }
  ```

#### Kentico.Membership.ApplicationUserStore<TUser>
- **File**: `resources/repositories/xperience/CMSSolution/Mvc/Kentico.Membership/Stores/Channels/ApplicationUserStore.cs`
- **Namespace**: `Kentico.Membership`
- **Declaration**: `public class ApplicationUserStore<TUser> : IUserPasswordStore<TUser>, IUserEmailStore<TUser>, IUserLoginStore<TUser>, IUserSecurityStampStore<TUser> where TUser : ApplicationUser, new()`

#### CMS.Membership.MemberInfo
- **File**: `resources/repositories/xperience/CMSSolution/Membership/Members/MemberInfo.cs`
- **Namespace**: `CMS.Membership`
- **Key Properties**: `MemberID` (int), `MemberEmail` (string), `MemberName` (string), `MemberPassword` (string), `MemberEnabled` (bool), `MemberIsExternal` (bool), `MemberSecurityStamp` (string)

#### Kentico.Membership.NoOpApplicationRole
- **File**: `resources/repositories/xperience/CMSSolution/Mvc/Kentico.Membership/Stores/Channels/NoOpApplicationRole.cs`
- **Namespace**: `Kentico.Membership`
- **Declaration**: `public sealed class NoOpApplicationRole : IdentityRole<int>`

#### Kentico.Membership.NoOpApplicationRoleStore
- **File**: `resources/repositories/xperience/CMSSolution/Mvc/Kentico.Membership/Stores/Channels/NoOpApplicationRoleStore.cs`
- **Namespace**: `Kentico.Membership`
- **Declaration**: `public sealed class NoOpApplicationRoleStore : IRoleStore<NoOpApplicationRole>`

#### ApplicationUserManager — DOES NOT EXIST
- **Searched**: entire `resources/repositories/xperience/` directory for `ApplicationUserManager`
- **Result**: No matches found. This is a confirmed documentation error.
- **Correct class**: `Microsoft.AspNetCore.Identity.UserManager<TUser>`

#### NoOpRoleStore — DOES NOT EXIST
- **Searched**: entire `resources/repositories/xperience/` directory
- **Result**: Only `NoOpApplicationRoleStore` exists. The docs reference `NoOpRoleStore` in two places in forms-authentication.md (lines 368, 653).

#### Kentico.Xperience.Admin.Base.PageExtender<TPage>
- **File**: `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Base/UIFramework/PageHandling/Extenders/PageExtender.cs`
- **Namespace**: `Kentico.Xperience.Admin.Base`
- **Declaration**: `public abstract class PageExtender<TPage> : IExtender where TPage : class, IPage`
- **ConfigurePage**: `public virtual Task ConfigurePage() => Task.CompletedTask;`

#### Kentico.Xperience.Admin.Base.UIPages.MemberList
- **File**: `resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.Base/UIPages/Members/MemberList.cs`
- **Namespace**: `Kentico.Xperience.Admin.Base.UIPages`
- **Declaration**: `public sealed class MemberList : ListingPage`

#### CMS.EmailEngine.IEmailService
- **File**: `resources/repositories/xperience/CMSSolution/EmailEngine/Services/Abstraction/IEmailService.cs`
- **Namespace**: `CMS.EmailEngine`
- **Method**: `Task SendEmail(EmailMessage message);`

#### CMS.EmailEngine.EmailMessage
- **File**: `resources/repositories/xperience/CMSSolution/EmailEngine/Emails/EmailMessage.cs`
- **Namespace**: `CMS.EmailEngine`
- **Key Properties**: `From` (string), `Recipients` (string), `Subject` (string), `Body` (string), `PlainTextBody` (string)

### Discrepancies

1. **`ApplicationUserManager<TUser>`** — Referenced in doc comments in `add-fields-to-member-objects.md` lines 79, 93. This class does not exist. Should be `UserManager<TUser>` (from `Microsoft.AspNetCore.Identity`).

2. **`NoOpRoleStore`** — Referenced in `forms-authentication.md` lines 368, 653. This class does not exist. Should be `NoOpApplicationRoleStore` (from `Kentico.Membership`).

### Code Samples Analysis

#### Namespace Conventions
- Integrated code: `Codesamples.Controllers`, `Codesamples.Membership.Models`, `Codesamples.Commerce`
- Standalone code: `Codesamples.Commerce.Standalone`
- For new membership standalone: `Codesamples.Membership.Standalone`

#### Include/EndInclude Pattern Reference
From `ShoppingCartService.cs` — nested markers example:
```csharp
//Include:shoppingcartservice
public class ShoppingCartService
{
    //Include:constructor
    ... constructor code ...
    //EndInclude:constructor

    //Include:getorcreatecart
    ... method code ...
    //EndInclude:getorcreatecart
}
//EndInclude:shoppingcartservice
```

#### Exclude Pattern Reference
From `customization.md`:
```liquid
{% code_link source="CodeSamples/DigitalCommerce/PriceCalculation/StandaloneSamples/CustomCalculationStepsProvider.cs" lang="csharp" title="Custom calculation steps provider" id="customstepsprovider" exclude="getmethod" %}
```

### Recommended Changes

#### Phase 1: Add Markers to Existing Files

**MODIFY-1**: `src/_code/src/CodeSamples/Membership/Controllers/AccountController.cs`
- Add `//Include:signin-get` / `//EndInclude:signin-get` around the SignIn GET action (lines 40-46)
- Add `//Include:signin-post` / `//EndInclude:signin-post` around the SignIn POST action (lines 48-86)
- Add `//Include:commerce-cart-transfer` / `//EndInclude:commerce-cart-transfer` around the cart transfer block (lines 72-78) — this is the nested region to exclude
- Add `//Include:signout` / `//EndInclude:signout` around the Logout action (lines 88-96)
- Add `//Include:register-get` / `//EndInclude:register-get` around the Register GET action (lines 98-104)
- Add `//Include:register-post` / `//EndInclude:register-post` around the Register POST action (lines 106-152)

**MODIFY-2**: `src/_code/src/CodeSamples/Membership/Models/Account/RegisterViewModel.cs`
- Add `//Include:registerviewmodel` / `//EndInclude:registerviewmodel` around the entire class (lines 6-34)

**MODIFY-3**: `src/_code/src/CodeSamples/Membership/Models/Account/SignInViewModel.cs`
- Add `//Include:signinviewmodel` / `//EndInclude:signinviewmodel` around the entire class (lines 6-20)

**MODIFY-4**: `src/_code/src/CodeSamples/Views/Account/Register.cshtml`
- Add `@* Include:register-view *@` / `@* EndInclude:register-view *@` markers (verify Razor comment marker syntax for code_link)
- NOTE: Investigate whether code_link supports Razor comment-style markers; if not, the view file content may need an alternate approach

**MODIFY-5**: `src/_code/src/CodeSamples/Views/Account/SignIn.cshtml`
- Add `@* Include:signin-view *@` / `@* EndInclude:signin-view *@` markers

#### Phase 2: Create New Files

**CREATE-1**: `src/_code/src/CodeSamples/Membership/Controllers/PasswordResetController.cs`
- Namespace: `Codesamples.Controllers`
- Full password reset flow: `PasswordResetRequest` (GET), `RequestPasswordReset` (POST), `CheckYourEmail`, `PasswordReset`, `ResetPasswordResult`
- Uses `IEmailService`, `UserManager<ApplicationUser>`, `GeneratePasswordResetTokenAsync`
- Markers: `//Include:passwordreset-controller` (whole class)
- This integrates into the webapp since it uses standard ASP.NET Identity + Xperience email service

**CREATE-2**: `src/_code/src/CodeSamples/Membership/Models/Account/PasswordResetViewModels.cs`
- Namespace: `Codesamples.Membership.Models`
- Contains `PasswordResetRequestViewModel` + `ResetPasswordViewModel`
- Markers: `//Include:passwordreset-request-model`, `//Include:passwordreset-model`

**CREATE-3**: `src/_code/src/CodeSamples/Membership/Controllers/EmailConfirmationController.cs`
- Namespace: `Codesamples.Controllers`
- Email confirmation registration flow: `Register` (GET+POST), `ConfirmEmail`, `VerifyEmail`, `EmailConfirmed`, `EmailConfirmationFailed`
- Uses `IEmailService`, `UserManager<ApplicationUser>`, `SignInManager<ApplicationUser>`
- Markers: `//Include:emailconfirmation-register` (Register POST), `//Include:emailconfirmation-confirm` (ConfirmEmail)

**CREATE-4**: `src/_code/src/CodeSamples/Membership/Models/Account/EmailConfirmationRegisterViewModel.cs`
- Namespace: `Codesamples.Membership.Models`
- `RegisterViewModel` variant for email confirmation (includes `MaxLength` annotations, slightly different from basic RegisterViewModel)
- Marker: `//Include:emailconfirmation-registermodel`

**CREATE-5**: `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExternalAuthController.cs`
- Namespace: `Codesamples.Membership.Standalone`
- External auth flow: `RequestExternalSignIn`, `ExternalSignInCallback`, `SynchronizeExternalAccount`, `SignInExternal`, `ExternalAuthenticationFailure`
- Markers: `//Include:external-challenge`, `//Include:external-callback`, `//Include:external-sync`
- Standalone because it requires external provider configuration (Google, etc.)

**CREATE-6**: `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExternalSignInView.cshtml`
- The Razor view iterating `GetExternalAuthenticationSchemesAsync()`
- Marker: `//Include:external-signin-view` (or Razor comment equivalent)
- Standalone alongside the controller

**CREATE-7**: `src/_code/src/CodeSamples/Membership/StandaloneSamples/ExtendedApplicationUser.cs`
- Namespace: `Codesamples.Membership.Standalone`
- Inherits `ApplicationUser`, adds `FirstName`, `MemberId`, overrides `MapFromMemberInfo`/`MapToMemberInfo`
- Marker: `//Include:extended-user`
- Standalone because it's a demonstration pattern, not integrated into the main auth flow

**CREATE-8**: `src/_code/src/CodeSamples/Membership/StandaloneSamples/MemberListExtender.cs`
- Namespace: `Codesamples.Membership.Standalone`
- `PageExtender<MemberList>` adding custom column
- Marker: `//Include:member-list-extender`
- Standalone since it's an admin customization example

#### Phase 3: Replace Inline Code with code_link Tags

**UPDATE-1**: `registration-and-authentication.md`
- Lines 29-51: Identity config — **KEEP INLINE** (Program.cs config snippet, 20 lines)
- Lines 64-77: Middleware setup — **KEEP INLINE** (config ordering, 12 lines)
- Lines 127-143: Retrieve current member — **KEEP INLINE** (per JIRA: ~3 substantial blocks, but this one is a pattern example showing `userManager.FindByIdAsync` usage, not tied to a specific controller; keeping inline is appropriate since it's a standalone pattern fragment)
- Lines 165-173: RequireConfirmedAccount config — **KEEP INLINE** (5 lines)
- Lines 185-189: SecurityStampValidatorOptions — **KEEP INLINE** (3 lines)
- Lines 220-233: IVirtualContextDecorationArbiter — **KEEP INLINE** (different topic)
- Lines 242-248: Not previewable authorization — **KEEP INLINE** (different topic)

Actually, re-reading the JIRA: "registration-and-authentication.md: Replace ~3 substantial blocks (identity setup, middleware, member retrieval)." So the JIRA explicitly asks to extract the identity setup, middleware, and member retrieval blocks. Let me reconsider:

- Lines 29-51: Identity config — **EXTRACT** per JIRA
- Lines 64-77: Middleware setup — **EXTRACT** per JIRA
- Lines 127-143: Retrieve current member — **EXTRACT** per JIRA
- Lines 165-173: RequireConfirmedAccount — **KEEP INLINE**
- Lines 185-189: SecurityStampValidatorOptions — **KEEP INLINE**

However, these are Program.cs config snippets, not class-based code. They can't naturally be part of a controller. Options:
- Create a standalone sample file like `Membership/StandaloneSamples/IdentityConfigurationExamples.cs` with marker regions
- Or keep them inline since they're truly config snippets

Given the JIRA says "Keep 2 small config snippets inline", the 3 extracted blocks are: identity setup, middleware, member retrieval. The identity setup and middleware are substantial (20+ lines each), and the member retrieval is a reusable pattern. These could go into standalone sample files.

**Revised plan for registration-and-authentication.md**:
- CREATE `Membership/StandaloneSamples/IdentityConfiguration.cs` with markers for identity-setup and member-retrieval code
- CREATE `Membership/StandaloneSamples/MiddlewareConfiguration.cs` with marker for middleware-setup (or combine into IdentityConfiguration.cs)
- KEEP inline: RequireConfirmedAccount (lines 165-173), SecurityStampValidatorOptions (lines 185-189)

Wait — the identity setup and middleware are `Program.cs` snippets, not valid standalone C# class files. They would need to be wrapped in a class to compile. Looking at how Commerce handles this... Let me check if there are any `Program.cs`-style samples in the existing codesamples.

Looking at the Commerce project, Program.cs config snippets aren't extracted — they stay in the actual `Website/Program.cs` or stay inline. The JIRA's "Replace ~3 substantial blocks" might mean we should put the member retrieval code into a file, but the Program.cs snippets may need to stay inline because they can't be naturally placed into a compilable class.

Let me reconsider the JIRA's intent: The "identity setup" and "middleware" blocks are genuinely just `Program.cs` top-level statements. They can't compile as standalone files without wrapping in a class. The JIRA says "Keep 2 small config snippets inline" for this page — which would be the `RequireConfirmedAccount` (5 lines) and `SecurityStampValidatorOptions` (3 lines). The 3 to extract would be: identity setup (20 lines), middleware (12 lines), member retrieval (16 lines).

For Program.cs snippets, the approach would be to either:
1. Add markers in the actual `Website/Program.cs` for the identity setup and middleware regions
2. Keep them inline (they're config, not reusable code patterns)

The `Website/Program.cs` already has the Identity configuration. We could add markers to it and reference it. The middleware ordering is also already there. This aligns perfectly — add markers to `Website/Program.cs` and reference it via `code_link`.

**Revised plan for registration-and-authentication.md**:
- ADD markers to `Website/Program.cs` for `//Include:identity-setup` and `//Include:middleware-setup`
- CREATE `Membership/StandaloneSamples/MemberRetrievalExample.cs` with marker for `//Include:member-retrieval`
- Replace 3 inline blocks with `code_link` tags
- Keep 2 small config snippets inline

**UPDATE-2**: `forms-authentication.md`
Blocks to EXTRACT (~10):
1. Registration actions (lines 40-125) → `code_link` to `AccountController.cs` `id="register-get,register-post"`
2. RegisterViewModel (lines 140-170) → `code_link` to `RegisterViewModel.cs` `id="registerviewmodel"`
3. Register.cshtml (lines 176-206) → `code_link` to `Views/Account/Register.cshtml` `id="register-view"`
4. Sign-in actions (lines 223-296) → `code_link` to `AccountController.cs` `id="signin-get,signin-post"` exclude `commerce-cart-transfer`, and separate tag for `id="signout"`
5. SignInViewModel (lines 300-319) → `code_link` to `SignInViewModel.cs` `id="signinviewmodel"`
6. SignIn.cshtml (lines 325-349) → `code_link` to `Views/Account/SignIn.cshtml` `id="signin-view"`
7. PasswordResetController (lines 408-567) → `code_link` to `PasswordResetController.cs` `id="passwordreset-controller"`
8. Password reset view models (lines 574-625) → `code_link` to `PasswordResetViewModels.cs` `id="passwordreset-request-model,passwordreset-model"`
9. Email confirmation controller (lines 664-814) → `code_link` to `EmailConfirmationController.cs` `id="emailconfirmation-register,emailconfirmation-confirm"`
10. Email confirmation RegisterViewModel (lines 818-849) → `code_link` to `EmailConfirmationRegisterViewModel.cs` `id="emailconfirmation-registermodel"`

Blocks to KEEP INLINE:
- Password policy config (lines 366-377) — small Program.cs config
- AddDefaultTokenProviders (lines 385-397) — small Program.cs config
- Email confirmation config (lines 651-660) — small Program.cs config

**UPDATE-3**: `external-authentication.md`
Blocks to EXTRACT (~3):
1. External sign-in view (lines 81-99) → `code_link` to `ExternalSignInView.cshtml` `id="external-signin-view"`
2. External auth controller (lines 111-247) → `code_link` to `ExternalAuthController.cs` `id="external-challenge,external-callback,external-sync"` (or full file)
3. Map claims to fields (lines 291-302) → This is a small snippet showing `ExtendedApplicationUser` usage; could be kept inline or extracted

Blocks to KEEP INLINE:
- Google auth config (lines 46-65) — Program.cs config
- Scope config (lines 265-276) — Program.cs config
- Cookie config (lines 316-322) — Program.cs config
- User-secrets commands (lines 342-351) — PowerShell commands
- Read stored secret (lines 354-361) — small config snippet

**UPDATE-4**: `add-fields-to-member-objects.md`
Blocks to EXTRACT (2):
1. ExtendedApplicationUser class (lines 53-108) → `code_link` to `ExtendedApplicationUser.cs` `id="extended-user"`
2. MemberListExtender (lines 153-174) → `code_link` to `MemberListExtender.cs` `id="member-list-extender"`

Blocks to KEEP INLINE:
- Identity config with extended class (lines 116-127) — small Program.cs config
- AccountController constructor snippet (lines 131-135) — one-liner

#### Phase 4: Fix API Discrepancies

**FIX-1**: `add-fields-to-member-objects.md` line 79
- Change: `// Called when retrieving member from Xperience via Kentico.Membership.ApplicationUserManager<TUser>`
- To: `// Called when retrieving member from Xperience via Microsoft.AspNetCore.Identity.UserManager<TUser>`
- NOTE: This fix will be done IN THE NEW CODE FILE (ExtendedApplicationUser.cs), not in the doc page. The doc page will reference the file via code_link.

**FIX-2**: `add-fields-to-member-objects.md` line 93
- Change: `// Called when creating or updating members using Kentico.Membership.ApplicationUserManager<TUser>`
- To: `// Called when creating or updating members using Microsoft.AspNetCore.Identity.UserManager<TUser>`
- Same as above — fixed in the code file.

**FIX-3**: `forms-authentication.md` line 368
- Change: `builder.Services.AddIdentity<ApplicationUser, NoOpRoleStore>(options =>`
- To: `builder.Services.AddIdentity<ApplicationUser, NoOpApplicationRole>(options =>`
- This is an inline snippet that stays inline, so fix directly in the doc.

**FIX-4**: `forms-authentication.md` line 653
- Change: `builder.Services.AddIdentity<ApplicationUser, NoOpRoleStore>(options =>`
- To: `builder.Services.AddIdentity<ApplicationUser, NoOpApplicationRole>(options =>`
- This is an inline snippet that stays inline, so fix directly in the doc.

#### Phase 5: Modifications to Website/Program.cs

**MODIFY-6**: `src/_code/src/Website/Program.cs`
- Add `//Include:identity-setup` / `//EndInclude:identity-setup` markers around the Identity configuration block (lines 31-48)
- Add `//Include:middleware-setup` / `//EndInclude:middleware-setup` markers around the middleware ordering block (lines 70-78)

### _ViewImports.cshtml Update

**MODIFY-7**: `src/_code/src/CodeSamples/Views/_ViewImports.cshtml`
- Current content only imports `Codesamples.Commerce`
- Add `@using Kentico.Membership` — needed for views using `ApplicationUser`, `SignInManager`, etc.
- May need `@using Microsoft.AspNetCore.Identity` for `SignInManager<ApplicationUser>` in the external sign-in view

### Reference Material

#### code_link Tag Format
```liquid
{% code_link source="CodeSamples/Membership/Controllers/AccountController.cs" lang="csharp" title="Sign-in GET action" id="signin-get" %}

{% code_link source="CodeSamples/Membership/Controllers/AccountController.cs" lang="csharp" title="Sign-in POST action" id="signin-post" exclude="commerce-cart-transfer" %}

{% code_link source="CodeSamples/Membership/Controllers/AccountController.cs" lang="csharp" title="Sign out action" id="signout" %}

{% code_link source="CodeSamples/Membership/Controllers/AccountController.cs" lang="csharp" title="Registration GET action" id="register-get" %}

{% code_link source="CodeSamples/Membership/Controllers/AccountController.cs" lang="csharp" title="Registration POST action" id="register-post" %}

{% code_link source="CodeSamples/Membership/Models/Account/RegisterViewModel.cs" lang="csharp" title="Registration view model" id="registerviewmodel" %}

{% code_link source="CodeSamples/Membership/Models/Account/SignInViewModel.cs" lang="csharp" title="Sign-in view model" id="signinviewmodel" %}

{% code_link source="CodeSamples/Views/Account/Register.cshtml" lang="cshtml" title="Example - registration form" id="register-view" %}

{% code_link source="CodeSamples/Views/Account/SignIn.cshtml" lang="cshtml" title="Example - sign-in form" id="signin-view" %}

{% code_link source="CodeSamples/Membership/Controllers/PasswordResetController.cs" lang="csharp" title="Password reset controller" id="passwordreset-controller" %}

{% code_link source="CodeSamples/Membership/Models/Account/PasswordResetViewModels.cs" lang="csharp" title="Password reset request view model" id="passwordreset-request-model" %}

{% code_link source="CodeSamples/Membership/Models/Account/PasswordResetViewModels.cs" lang="csharp" title="Reset password view model" id="passwordreset-model" %}

{% code_link source="CodeSamples/Membership/Controllers/EmailConfirmationController.cs" lang="csharp" title="Registration with email confirmation" id="emailconfirmation-register" %}

{% code_link source="CodeSamples/Membership/Controllers/EmailConfirmationController.cs" lang="csharp" title="Email confirmation handler" id="emailconfirmation-confirm" %}

{% code_link source="CodeSamples/Membership/Models/Account/EmailConfirmationRegisterViewModel.cs" lang="csharp" title="Register action view model" id="emailconfirmation-registermodel" %}

{% code_link source="CodeSamples/Membership/StandaloneSamples/ExternalAuthController.cs" lang="csharp" title="External authentication flow" id="external-challenge,external-callback,external-sync" %}

{% code_link source="CodeSamples/Membership/StandaloneSamples/ExternalSignInView.cshtml" lang="cshtml" title="External sign-in view" id="external-signin-view" %}

{% code_link source="CodeSamples/Membership/StandaloneSamples/ExtendedApplicationUser.cs" lang="csharp" title="ExtendedApplicationUser class" id="extended-user" %}

{% code_link source="CodeSamples/Membership/StandaloneSamples/MemberListExtender.cs" lang="csharp" title="Display a 'FirstName' column in the listing" id="member-list-extender" %}

{% code_link source="Website/Program.cs" lang="csharp" title="Program.cs - add Identity to the application" id="identity-setup" %}

{% code_link source="Website/Program.cs" lang="csharp" title="Program.cs - add required middleware" id="middleware-setup" %}
```

#### API Signatures for New Code

**PasswordResetController dependencies**:
```csharp
using System;
using System.Web;
using System.Threading.Tasks;

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;

using CMS.EmailEngine;
using Kentico.Membership;
```

**EmailConfirmationController dependencies**:
```csharp
using System;
using System.Threading.Tasks;

using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Identity;

using CMS.EmailEngine;
using Kentico.Membership;
```

**ExternalAuthController dependencies**:
```csharp
using System.Security.Claims;
using System.Threading.Tasks;

using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;

using Kentico.Membership;
```

**ExtendedApplicationUser dependencies**:
```csharp
using CMS.Membership;
using Kentico.Membership;
```

**MemberListExtender dependencies**:
```csharp
using System.Threading.Tasks;
using Kentico.Xperience.Admin.Base;
using Kentico.Xperience.Admin.Base.UIPages;
```

#### IEmailService.SendEmail Usage Pattern
```csharp
await emailService.SendEmail(new EmailMessage()
{
    From = "admin@localhost.local",
    Recipients = user.Email,
    Subject = "Password reset request",
    Body = $"To reset your account's password, click <a href=\"{resetUrl}\">here</a>."
});
```

#### Folder Structure After Implementation
```
src/_code/src/CodeSamples/Membership/
├── Controllers/
│   ├── AccountController.cs              ← MODIFY: add Include markers
│   ├── PasswordResetController.cs        ← CREATE
│   └── EmailConfirmationController.cs    ← CREATE
├── Models/
│   └── Account/
│       ├── RegisterViewModel.cs          ← MODIFY: add Include marker
│       ├── SignInViewModel.cs            ← MODIFY: add Include marker
│       ├── PasswordResetViewModels.cs    ← CREATE
│       └── EmailConfirmationRegisterViewModel.cs  ← CREATE
├── StandaloneSamples/
│   ├── ExternalAuthController.cs         ← CREATE
│   ├── ExternalSignInView.cshtml         ← CREATE
│   ├── ExtendedApplicationUser.cs        ← CREATE
│   └── MemberListExtender.cs            ← CREATE

src/_code/src/CodeSamples/Views/Account/
├── SignIn.cshtml                          ← MODIFY: add Include markers
├── Register.cshtml                       ← MODIFY: add Include markers
└── MyAccount.cshtml                      ← unchanged

src/_code/src/Website/
└── Program.cs                            ← MODIFY: add Include markers
```

### Inline Code Block Catalog

#### registration-and-authentication.md (7 blocks)
| Lines | Content | Action |
|-------|---------|--------|
| 29-51 | Identity setup (Program.cs) | EXTRACT → Website/Program.cs `id="identity-setup"` |
| 64-77 | Middleware ordering | EXTRACT → Website/Program.cs `id="middleware-setup"` |
| 127-143 | Member retrieval pattern | EXTRACT → new standalone file |
| 165-173 | RequireConfirmedAccount | KEEP INLINE |
| 185-189 | SecurityStampValidatorOptions | KEEP INLINE |
| 220-233 | IVirtualContextDecorationArbiter | KEEP INLINE (unrelated topic) |
| 242-248 | Not previewable authorization | KEEP INLINE (unrelated topic) |

#### forms-authentication.md (13 blocks)
| Lines | Content | Action |
|-------|---------|--------|
| 40-125 | Registration actions | EXTRACT → AccountController `id="register-get,register-post"` |
| 140-170 | RegisterViewModel | EXTRACT → RegisterViewModel.cs `id="registerviewmodel"` |
| 176-206 | Register.cshtml | EXTRACT → Views/Account/Register.cshtml |
| 223-296 | Sign-in + logout actions | EXTRACT → AccountController `id="signin-get,signin-post,signout"` |
| 300-319 | SignInViewModel | EXTRACT → SignInViewModel.cs `id="signinviewmodel"` |
| 325-349 | SignIn.cshtml | EXTRACT → Views/Account/SignIn.cshtml |
| 366-377 | Password policy config | KEEP INLINE |
| 385-397 | AddDefaultTokenProviders | KEEP INLINE |
| 408-567 | PasswordResetController | EXTRACT → new PasswordResetController.cs |
| 574-625 | Password reset view models | EXTRACT → new PasswordResetViewModels.cs |
| 651-660 | Email confirmation config | KEEP INLINE |
| 664-814 | Email confirmation controller | EXTRACT → new EmailConfirmationController.cs |
| 818-849 | Email confirmation ViewModel | EXTRACT → new EmailConfirmationRegisterViewModel.cs |

#### external-authentication.md (8 blocks)
| Lines | Content | Action |
|-------|---------|--------|
| 46-65 | Google auth + Identity config | KEEP INLINE |
| 81-99 | External SignIn.cshtml | EXTRACT → new ExternalSignInView.cshtml |
| 111-247 | External auth controller | EXTRACT → new ExternalAuthController.cs |
| 265-276 | Scope config | KEEP INLINE |
| 291-302 | Map claims to fields | KEEP INLINE (small, contextual) |
| 316-322 | Cookie config | KEEP INLINE |
| 342-351 | User-secrets commands | KEEP INLINE |
| 354-361 | Read stored secret | KEEP INLINE |

#### add-fields-to-member-objects.md (4 blocks)
| Lines | Content | Action |
|-------|---------|--------|
| 53-108 | ExtendedApplicationUser | EXTRACT → new ExtendedApplicationUser.cs |
| 116-127 | Identity config with extended class | KEEP INLINE |
| 131-135 | AccountController constructor | KEEP INLINE |
| 153-174 | MemberListExtender | EXTRACT → new MemberListExtender.cs |

### Risks & Open Questions

1. **Razor view markers**: The `//Include:` / `//EndInclude:` syntax uses C# single-line comment format. For `.cshtml` files, we need to verify whether the code_link plugin supports Razor comment markers (`@* Include:id *@` / `@* EndInclude:id *@`) or if the `//` format still works inside Razor files. Looking at the syntax docs, section markers are described with `//Include:` — it's unclear if this is C#-specific or if the plugin strips based on regex patterns regardless of comment syntax. **Test with a Razor file.**

2. **AccountController constructor exposure**: The docs currently show a clean constructor with only `UserManager`, `SignInManager`, and `ILogger`. The real AccountController has `IEventLogService` and `ShoppingCartService` instead. When using `code_link` with individual action markers, the constructor won't appear in the output. The docs will need to either:
   - Keep a brief inline snippet showing a simplified constructor declaration (as currently done)
   - Add a separate marker for the constructor that selectively includes only the auth-relevant fields (complex, fragile)

3. **View style differences**: The existing views in the codesamples use custom CSS classes (`form-container`, `form-input`, `form-error`) while the doc pages currently show Bootstrap classes (`form-group`, `form-control`, `text-danger`). When switching to `code_link`, the rendered code will show the custom CSS. This may need documentation context updates or the views may need to be adjusted.

4. **PasswordResetController `System.Web` dependency**: The inline doc code uses `System.Web.HttpUtility.UrlEncode`/`UrlDecode`. This is a .NET Framework namespace. In .NET Core/8+, use `System.Net.WebUtility` or `System.Uri.EscapeDataString` instead. The new file needs to use the correct modern API.

5. **Email confirmation RegisterViewModel vs basic RegisterViewModel**: The doc shows two different `RegisterViewModel` classes — one basic (lines 140-170) and one for email confirmation (lines 818-849) with `MaxLength` annotations. The existing `RegisterViewModel.cs` in the codesamples already has `MaxLength` and `RegularExpression` annotations. The email confirmation version needs a separate class name to avoid conflicts.

6. **Member retrieval code block** in registration-and-authentication.md: This is a standalone code pattern showing `userManager.FindByIdAsync` usage with `IHttpContextAccessor`. It doesn't naturally fit as a controller action — it might be best as a standalone sample file like `MemberRetrievalExample.cs` or kept inline since it's demonstrating a pattern, not a complete class.

7. **`NoOpRoleStore` fix**: Two occurrences in forms-authentication.md use `NoOpRoleStore` (lines 368, 653) which doesn't exist. Should be `NoOpApplicationRole` (the role type, not the store — `AddIdentity<TUser, TRole>` takes the role type, not the store). The existing correct doc examples use `NoOpApplicationRole`.
