##############################################################
# providers.tf
##############################################################
terraform {
  required_version = ">= 1.5"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

provider "github" {
  token = var.github_token
  owner = var.github_owner   # org name or personal account
}


##############################################################
# variables.tf
##############################################################
variable "github_token" {
  description = "GitHub Personal Access Token (or GitHub App token) with repo/admin:org scopes"
  type        = string
  sensitive   = true
}

variable "github_owner" {
  description = "GitHub organisation or user namespace"
  type        = string
}

variable "repo_name" {
  description = "Name of the repository to secure"
  type        = string
}

variable "required_reviewers" {
  description = "GitHub usernames required to approve PRs"
  type        = list(string)
  default     = []
}

variable "required_teams" {
  description = "GitHub team slugs required to approve PRs"
  type        = list(string)
  default     = []
}

variable "required_status_checks" {
  description = "CI check names that must pass before merge"
  type        = list(string)
  default     = ["ci / build", "ci / test"]
}


##############################################################
# main.tf — Repository baseline hardening
##############################################################

# ── Core repository settings ────────────────────────────────
resource "github_repository" "repo" {
  name       = var.repo_name
  visibility = "private"          # change to "public" if needed

  # Disable dangerous merge strategies
  allow_rebase_merge  = false     # keeps history linear without rebasing
  allow_squash_merge  = true      # squash for clean history
  allow_merge_commit  = false     # no merge commits on main

  # Tidy up merged branches automatically
  delete_branch_on_merge = true

  # Dependency graph + Dependabot alerts
  has_vulnerability_alerts = true

  # Disable unused features that expand the attack surface
  has_wiki     = false
  has_projects = false

  security_and_analysis {
    secret_scanning {
      status = "enabled"
    }
    secret_scanning_push_protection {
      status = "enabled"          # blocks pushes containing secrets
    }
  }
}


# ── Branch protection — main ────────────────────────────────
resource "github_branch_protection" "main" {
  repository_id = github_repository.repo.node_id
  pattern       = "main"

  # ── Enforce rules on admins too ──
  enforce_admins = true

  # ── Require PRs; no direct commits ──
  required_pull_request_reviews {
    dismiss_stale_reviews           = true   # re-review after new pushes
    require_code_owner_reviews      = true   # CODEOWNERS must approve
    required_approving_review_count = 1      # raise to 2 for critical repos
    restrict_dismissals             = true   # only specific people can dismiss
    dismissal_restrictions          = var.required_reviewers
    pull_request_bypassers          = []     # nobody bypasses — add break-glass accounts if needed
  }

  # ── Require CI to pass ──
  required_status_checks {
    strict   = true                          # branch must be up-to-date before merge
    contexts = var.required_status_checks
  }

  # ── Commit signing ──
  require_signed_commits = true

  # ── Linear history (no merge commits directly to main) ──
  required_linear_history = true

  # ── Conversation resolution before merge ──
  require_conversation_resolution = true

  # ── Restrict who can push/merge to main ──
  restrict_pushes {
    push_allowances = var.required_teams   # e.g. ["my-org/release-team"]
  }

  # ── Prevent force-pushes and branch deletion ──
  allows_force_pushes = false
  allows_deletions    = false

  # ── Lock branch (truly read-only for non-PRs) ──
  lock_branch = false   # set to true only if you want a completely frozen branch
}


# ── Branch protection — release/* ───────────────────────────
resource "github_branch_protection" "release" {
  repository_id = github_repository.repo.node_id
  pattern       = "release/*"

  enforce_admins = true

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = true
    required_approving_review_count = 1
  }

  required_status_checks {
    strict   = true
    contexts = var.required_status_checks
  }

  require_signed_commits  = true
  required_linear_history = true
  allows_force_pushes     = false
  allows_deletions        = false
}


# ── CODEOWNERS file (committed separately, managed here) ────
# This resource ensures a CODEOWNERS file exists; populate it
# in your repo or via a separate null_resource / local-exec.
# Example content:  * @my-org/platform-team


# ── Dependabot security updates ─────────────────────────────
resource "github_repository_dependabot_security_updates" "this" {
  repository = github_repository.repo.name
  enabled    = true
}


# ── Actions permissions ──────────────────────────────────────
resource "github_actions_repository_permissions" "this" {
  repository      = github_repository.repo.name
  enabled         = true
  allowed_actions = "selected"   # only explicitly listed actions can run

  allowed_actions_config {
    github_owned_allowed = true    # actions/checkout, actions/setup-node, etc.
    verified_allowed     = false   # only GitHub-owned actions; flip if needed
    patterns_allowed     = []      # e.g. ["aws-actions/*", "docker/*"]
  }
}


# ── Block outside collaborators from forking (org-level) ────
# Uncomment if managing an org repo:
#
# resource "github_organization_settings" "org" {
#   billing_email                                          = "ops@example.com"
#   members_can_create_repositories                        = false
#   members_can_create_public_repositories                 = false
#   members_can_fork_private_repositories                  = false
#   dependency_graph_enabled_for_new_repositories          = true
#   dependabot_alerts_enabled_for_new_repositories         = true
#   dependabot_security_updates_enabled_for_new_repositories = true
#   secret_scanning_enabled_for_new_repositories           = true
#   secret_scanning_push_protection_enabled_for_new_repositories = true
# }


##############################################################
# outputs.tf
##############################################################
output "repo_full_name" {
  value = github_repository.repo.full_name
}

output "repo_html_url" {
  value = github_repository.repo.html_url
}
