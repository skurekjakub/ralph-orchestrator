Here's a breakdown of every security control applied and why it matters:

**Branch protection on `main`**

| Control | What it does |
|---|---|
| `enforce_admins = true` | Admins can't bypass rules — closes a common backdoor |
| `required_approving_review_count` | No code reaches main without human review |
| `dismiss_stale_reviews = true` | New commits void old approvals, preventing sneak changes |
| `require_code_owner_reviews = true` | Domain owners must sign off on changes to their areas |
| `require_signed_commits = true` | Commits must be GPG/SSH signed — prevents impersonation |
| `required_linear_history = true` | Enforces squash/rebase — easier auditing, no merge commits |
| `restrict_pushes` | Only designated teams can merge to main |
| `allows_force_pushes = false` | History can never be rewritten on main |
| `allows_deletions = false` | Branch can't be deleted |
| `require_conversation_resolution` | All PR comments must be resolved before merge |

**Repository-level hardening**

- **Secret scanning + push protection** — GitHub scans commits for credentials and *blocks the push* before it lands
- **Dependabot security updates** — automatically opens PRs for vulnerable dependencies
- **`delete_branch_on_merge`** — removes stale branches that could be used for sneaky rebases
- **Merge strategy restrictions** — only squash merges allowed; keeps the audit trail clean
- **Actions `allowed_actions = "selected"`** — prevents arbitrary third-party Actions from running in your CI (supply-chain protection)

**Usage**

```bash
# Create a terraform.tfvars
cat > terraform.tfvars <<EOF
github_token           = "ghp_xxxxxxxxxxxx"
github_owner           = "my-org"
repo_name              = "my-ecommerce-app"
required_reviewers     = ["alice", "bob"]
required_teams         = ["my-org/release-team"]
required_status_checks = ["ci / build", "ci / test", "security / snyk"]
EOF

terraform init
terraform plan
terraform apply
```

> **Tip:** Store `github_token` in a secrets manager (e.g. AWS SSM, Vault) and pass it via `TF_VAR_github_token` rather than a `.tfvars` file.