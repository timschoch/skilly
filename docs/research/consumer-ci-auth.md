# Consumer CI auth for private skill sources

How should ~14 consumer repos authenticate in GitHub Actions to read private skill-source repos owned by three separate personal accounts (`timschoch`, `habits`, `admin-laicadev`) on GitHub Free?

Verified 2026-08-31 against docs.github.com, GitHub Changelog, community discussions, and the `actions/create-github-app-token` and `vercel-labs/skills` repositories.

## Baseline constraints

- `GITHUB_TOKEN` is scoped to the workflow's own repository. Cross-repo private reads need a PAT, an App installation token, a deploy key, or an SSH machine credential.
- Actions secrets exist at three levels only: repository, environment, organization ([Use secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)). No account/user level.
- "Organization-level secrets and variables are not accessible by private repositories for GitHub Free" ([Use secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)).
- "Organizations with GitHub Team and users with GitHub Pro can configure environments for private repositories" ([Manage environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)). GitHub Free private repo → environment secrets unavailable.

Net: on GitHub Free, every secret must be set per consumer repository. 14 repos = 14 `gh secret set` calls per secret name.

## 1. Exact setup steps

### 1a. Fine-grained PAT

Per owner account, signed in as that account:

1. Settings → Developer settings → Personal access tokens → Fine-grained tokens → **Generate new token** ([Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token)).
2. **Resource owner**: "select a resource owner. The token will only be able to access resources owned by the selected resource owner." Exactly one owner per token ([same page](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)).
3. **Expiration**: "Infinite lifetimes are allowed but may be blocked by a maximum lifetime policy set by your organization or enterprise owner." No-expiration shipped 2024-10-18 ([PAT rotation policies changelog](https://github.blog/changelog/2024-10-18-new-pat-rotation-policies-preview-and-optional-expiration-for-fine-grained-pats/)). No org/enterprise here → infinite lifetime is selectable. The 366-day cap is the default *organization/enterprise* policy, not a personal-account cap.
4. **Repository access**: "Only select repositories" → pick the skill-source repos.
5. **Permissions**: Repository permissions → `Contents: Read-only`.
6. Copy the token once. The owner of each account must do this themselves, because token minting is browser-only (see §6).

Limit: 50 fine-grained tokens per account ([Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)).

### 1b. GitHub App owned by a user account

Register once, under any one of the three accounts:

1. Settings → Developer settings → GitHub Apps → **New GitHub App** ([Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)).
2. Required fields: **App name** (unique across GitHub, max 34 chars) and **Homepage URL** ("Type the full URL to your app's website"). Any valid URL works, the repo URL is fine.
3. Webhook: deselect the **Active** checkbox. "If you do not want your app to receive webhook events, deselect **Active**." No webhook URL then needed.
4. **Repository permissions** → `Contents: Read-only`.
5. **Where can this GitHub App be installed?** → exactly two options: **"Only on this account"** and **"Any account"** ([Registering a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app)). Choose **Any account**.
6. Create app → note the **App ID** and **Client ID** → **Generate a private key** (downloads a `.pem`).
7. Install on all three accounts: App settings → **Install App** → pick the account → **Only select repositories** → the skill-source repos ([Installing your own GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)).

**"Any account" for a personal-account-owned app is available and is the same thing as making the app public.** "If you set your GitHub App registration to private, it can only be installed on the account that owns the app." "If you set your GitHub App registration to public, any user on GitHub can install it and authorize it." ([Making a GitHub App public or private](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/making-a-github-app-public-or-private)). "If your app is public, the GitHub App can also be installed on other accounts" ([Installing your own GitHub App](https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app)). No personal-account-specific restriction is documented.

Side effect of "Any account": the app is publicly listed and installable by strangers. A stranger's installation only grants the app access to *their* repos, not yours, so blast radius on the three accounts is nil. What becomes public is the app's name and existence.

### 1c. Getting an App token in the workflow

`actions/create-github-app-token@v3` is the current major ([README](https://github.com/actions/create-github-app-token)).

Inputs: `client-id` (preferred) or legacy `app-id`; `private-key`; `owner`; `repositories`; `enterprise`; `permission-<name>`; `skip-token-revoke`; `github-api-url`. Outputs: `token`, `installation-id`, `app-slug`.

**One token cannot span multiple owners.** Repository entries "may include owners… the owner portion must match the `owner` input, or the current repository owner if `owner` is unset" ([README](https://github.com/actions/create-github-app-token)). The maintainers state the action's tokens "only grant permissions to a single provided owner space" ([discussion #83](https://github.com/actions/create-github-app-token/discussions/83), [issue #45](https://github.com/actions/create-github-app-token/issues/45)). Root cause is the API: a token is minted at `POST /app/installations/{installation_id}/access_tokens` and "the installation access token cannot be granted access to repositories that the installation was not granted access to" ([Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)). One installation = one account.

So: three `create-github-app-token` steps in each workflow, one per `owner`.

## 2. Spanning across three owners

| | Spans owners? | Credentials needed for 3 accounts |
|---|---|---|
| Fine-grained PAT | No. "Each token is limited to access resources owned by a single user or organization" ([docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)) | 3 tokens |
| GitHub App | Registration spans; tokens do not | 1 App ID + 1 private key, 3 installations, 3 token mint steps |
| Classic PAT | Yes. One token covers every repo the user can reach | 1 token |

Collaborator workaround does **not** rescue fine-grained PATs: "Fine-grained personal access tokens cannot be used to contribute to repositories where the user is an outside or repository collaborator" ([Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens), [community #85661](https://github.com/orgs/community/discussions/85661)). Adding `timschoch` as collaborator on the other accounts' repos still does not let a `timschoch`-owned fine-grained PAT read them.

A classic PAT does span, but its only private-repo scope is `repo`, which "Grants full access to public and private repositories including read and write access to code, commit statuses, repository invitations, collaborators, deployment statuses, and repository webhooks" ([OAuth scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)). There is no read-only private scope. One leaked classic PAT = full write on every repo of all three accounts.

## 3. Secrets per consumer repo and distribution

| Path | Secrets per consumer repo | `gh secret set` calls for 14 repos |
|---|---|---|
| Fine-grained PAT | 3 (`SKILLS_TOKEN_TIMSCHOCH`, `_HABITS`, `_ADMIN_LAICADEV`) | 42 |
| GitHub App | 2 (`SKILLS_APP_ID`, `SKILLS_APP_PRIVATE_KEY`) | 28 |
| Classic PAT | 1 | 14 |
| Deploy keys | 1 per source repo | 14 × N source repos |

App path confirmed: the same App ID and private key mint tokens for every installation, so the secret count is independent of the number of accounts. Only the number of in-workflow mint steps grows.

### Routing different tokens to different owners in one job

Git can bind a credential per URL prefix. Two mechanisms, both standard:

```bash
git config --global url."https://x-access-token:$T_TIMSCHOCH@github.com/timschoch/".insteadOf "https://github.com/timschoch/"
git config --global url."https://x-access-token:$T_HABITS@github.com/habits/".insteadOf "https://github.com/habits/"
```

or the credential-context form, which requires path matching to be on: "By default, Git does not consider the 'path' component of an http URL to be worth matching via external helpers… If you do want to distinguish these cases, set this option to `true`" (`credential.useHttpPath`, [gitcredentials](https://git-scm.com/docs/gitcredentials)). Prefix matching: "the context `https://example.com/bar` will match a config entry for `https://example.com/bar/baz.git`".

`x-access-token` is the documented username for App installation tokens over HTTPS: `git clone https://x-access-token:TOKEN@github.com/owner/repo.git` ([Authenticating as a GitHub App installation](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation)). Fine-grained PATs work as the password with any username.

**Mechanism caveat. `npx skills` is not purely git.** Its README: "`GITHUB_TOKEN` or `GH_TOKEN` can be set explicitly for GitHub API access, including private repository downloads and update checks", with an ordered fallback of git credential helper → GitHub CLI → SSH for clones, and anonymous API → env token → `gh api` for GitHub tree lookups ([vercel-labs/skills README](https://github.com/vercel-labs/skills/blob/main/README.md)). The `insteadOf` trick covers the clone leg per owner. The **API leg reads a single `GH_TOKEN` env var**, which cannot be per-owner. This affects the PAT path and the App path equally, since both produce owner-scoped tokens.

Related open bug: `skillFolderHash` is empty for private-repo skills because the Trees API call is unauthenticated, so `skills check` / `skills update` report "skipped (reinstall needed)". Open as of 2026-01-27 ([vercel-labs/skills#162](https://github.com/vercel-labs/skills/issues/162), [#436](https://github.com/vercel-labs/skills/issues/436)). `UNVERIFIED`: whether a current `skills` release resolves the env token for the Trees API in practice, and whether per-owner invocation (`npx skills update <name>` grouped by owner, each with its own `GH_TOKEN`) is needed. Test before committing to either credential design.

## 4. Rotation and leak behaviour

**Fine-grained PAT**
- Lifetime: selectable, infinite allowed on a personal account ([changelog 2024-10-18](https://github.blog/changelog/2024-10-18-new-pat-rotation-policies-preview-and-optional-expiration-for-fine-grained-pats/)). Default 30 days if unconfigured.
- "GitHub will send you an email when it's time to renew a token that's about to expire" ([changelog 2021-07-26](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/)).
- Response header `GitHub-Authentication-Token-Expiration` still exists, name unchanged ([same changelog](https://github.blog/changelog/2021-07-26-expiration-options-for-personal-access-tokens/)). Known defect: for fine-grained PATs it returns current server time instead of the real expiry ([google/go-github#3708](https://github.com/google/go-github/issues/3708)). Do not build rotation alarms on it.
- On expiry: every nightly workflow in all 14 repos fails at once, silently until someone reads a run log.
- On leak: valid until manually revoked or until expiry. If set to infinite, a leaked token is valid forever.
- Rotation cost: mint 3 new tokens in the browser, then 42 `gh secret set` calls.

**GitHub App**
- "Private keys do not expire and instead need to be manually revoked." Up to 25 keys per app. "You should use multiple keys in order to rotate keys without downtime in the event of a key compromise." "You can remove a lost or compromised private key by deleting it, but you must regenerate a new key before you can delete the existing key." ([Managing private keys](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps)).
- "The installation access token will expire after 1 hour" ([Generating an installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)). The action also revokes the token in its `post` step unless `skip-token-revoke: true` ([README](https://github.com/actions/create-github-app-token)).
- Leaked *installation token* → self-expires within 1 hour, read-only, scoped to listed repos. Effectively harmless.
- Leaked *private key* → valid forever until deleted; can mint tokens for all three installations. Revocation is one UI action plus 14 `gh secret set` calls (one secret name, not three).
- Nothing expires on a schedule → no surprise nightly-workflow breakage.

**Fails safer**: the App. The credential that appears in CI logs and runner memory (the installation token) is the short-lived, read-only, revoked-on-job-end one. The long-lived credential (private key) never leaves the secret store and is used only to sign a JWT.

## 5. Minimal read-only permission set

**Fine-grained PAT**: Repository permissions → `Contents: Read-only`. Contents is the permission covering git blobs, refs, and file reads ([Permissions required for fine-grained PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)).

**GitHub App**: same. "If you want your app to use an installation or user access token to authenticate for HTTP-based Git access, you should request the 'Contents' repository permission" ([Choosing permissions for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)).

Neither needs `workflow`, `actions`, `pull_requests`, `administration`, or any write permission.

`Metadata: Read-only` is `UNVERIFIED` as *documented*. The permission exists and gates `GET /repos/{owner}/{repo}` ([Permissions required for fine-grained PATs](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens)), and the token-creation UI auto-selects and locks it as mandatory once any repository permission is chosen, but I found no sentence on [that page](https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens), [Choosing permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app), or [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) stating it. Practical guidance repeats "Contents: Read. Metadata: Read" ([community #133558](https://github.com/orgs/community/discussions/133558)). Treat it as auto-added; do not fight the UI.

## 6. Minting a fine-grained PAT via API: still browser-only

**No.** There is no endpoint that creates a personal access token, fine-grained or classic, as of 2026-08-31.

- [REST API endpoints for personal access tokens](https://docs.github.com/en/rest/orgs/personal-access-tokens) documents eight endpoints, all under `/orgs/{org}/`, all list / review-request / revoke. None creates a token. All are org-scoped and marked "Only GitHub Apps can use this endpoint", so they are unusable here, since none of the three accounts is an organization.
- [community #120437](https://github.com/orgs/community/discussions/120437) (opened 2024-04-20) asks for programmatic fine-grained PAT creation. Still unanswered, no GitHub staff response, no shipped feature.
- [community #148626](https://github.com/orgs/community/discussions/148626), "Unable to create a Personal Access Token via API", reaches the same conclusion.
- `gh` CLI cannot mint one either: [cli/cli#6680](https://github.com/cli/cli/issues/6680) tracks fine-grained PAT support and notes GitHub has no creation API to wrap. Third-party tools exist only by scripting the web UI ([github-fine-grained-token-client](https://pypi.org/project/github-fine-grained-token-client/)).

Consequence: three separate browser sessions, one per account, every rotation. This is the single largest recurring cost of the PAT path.

## Alternatives

### 7. Deploy keys

Deploy keys are per-repository SSH keys, read-only by default. "Deploy keys only grant access to a single repository." "You can't reuse a deploy key for multiple repositories." ([Managing deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)).

For N source repos that means N keypairs, each public half registered on its source repo and each private half stored as a secret in all 14 consumer repos, so N × 14 secret writes, plus SSH agent setup and a `url.insteadOf` rewrite so `npx skills` uses SSH rather than HTTPS. That same page recommends the alternatives instead: GitHub Apps with installation tokens ("tightly-scoped, time-limited"), or machine users. Deploy keys are the right tool for one server pulling one repo; they scale worst of all options here and add an SSH transport that the skills CLI only reaches as its last fallback. Not recommended.

A machine user (a fourth GitHub account added as collaborator everywhere, holding one classic PAT) collapses to one secret, but "personal repositories always grant read/write access regardless of intended restrictions" ([same page](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)). There is no read-only mode for user-owned repos, so the blast radius matches a classic PAT.

### 8. Make the source repos public

Public repos need no credential at all: zero secrets, zero rotation, zero per-account setup. Fine-grained tokens even get "automatic read-only access" to public repos regardless of settings ([Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)). If the skill content is not sensitive, this deletes the entire problem.

## Recommendation

| Option | Setup effort | Rotation | Blast radius | Per-account hassle | Secrets per consumer repo |
|---|---|---|---|---|---|
| Public source repos | None | None | None | None | 0 |
| GitHub App ("Any account") | High once: 1 registration, 3 installs, 3 mint steps per workflow | Delete + regenerate key in UI, 14 secret writes; installation tokens self-expire in 1h | Smallest. Leaked CI token is read-only and dead in 1h | Install click per account, once | 2 |
| Fine-grained PAT ×3 | Medium: 3 browser mintings | Browser-only, 3 accounts, 42 secret writes; infinite lifetime tempting and dangerous | Read-only, scoped to listed repos; leaked token lives until revoked | Browser session per account, every rotation | 3 |
| Classic PAT ×1 | Low: 1 minting, collaborator invites | 1 browser minting, 14 secret writes | Worst. `repo` scope is full write on every repo of all three accounts | Collaborator invite per account, once | 1 |
| Deploy keys | High: N keypairs, SSH transport | N keypairs × 14 repos | Read-only, per repo | Per source repo, not per account | N |

### KISS call

Make the skill-source repos public if their content is not secret. That is one setting per repo, no credentials, no rotation, no expiry, and it removes every row above.

If they must stay private: the GitHub App. It is the only option where the credential that touches CI is read-only and expires in an hour, and it is the only private option whose secret count does not grow with the number of accounts (2 secrets, forever, versus 3 PATs re-minted through three browser sessions with no API to automate it).
