// Setup interview logic, shared by page.html and server.js.
// Plain script: the browser loads it with <script src>, Node imports it for its globals.
// Our standard tools. Each one maps to the skilly Bundle that gets installed.
// deploy: the output group can wire it up (all others: Bundle only, no wiring).
const TOOLS = [
  { id: 'tanstack', label: 'TanStack Start', cat: 'Framework', bundle: 'tech-tanstack', framework: true },
  { id: 'nextjs', label: 'Next.js', cat: 'Framework', bundle: 'tech-nextjs', framework: true },
  { id: 'typescript', label: 'TypeScript', cat: 'Language', bundle: 'tech-typescript' },
  { id: 'react', label: 'React', cat: 'UI', bundle: 'tech-react' },
  { id: 'shadcn', label: 'shadcn/ui', cat: 'UI', bundle: 'tech-shadcn' },
  { id: 'neon', label: 'Neon Postgres', cat: 'Data', bundle: 'tech-neon', deploy: true },
  { id: 'drizzle', label: 'Drizzle', cat: 'Data', bundle: 'tech-drizzle' },
  { id: 'powersync', label: 'PowerSync', cat: 'Data', bundle: 'tech-powersync' },
  { id: 'payload', label: 'Payload CMS', cat: 'Content', bundle: 'tech-payload' },
  { id: 'betterAuth', label: 'Better Auth', cat: 'Auth', bundle: 'tech-better-auth' },
  { id: 'posthog', label: 'PostHog', cat: 'Analytics', bundle: 'tech-posthog' },
  { id: 'langfuse', label: 'Langfuse', cat: 'AI', bundle: 'tech-langfuse' },
  { id: 'trigger', label: 'Trigger.dev', cat: 'Jobs', bundle: 'tech-trigger-dev' },
  { id: 'n8n', label: 'n8n', cat: 'Jobs', bundle: 'tech-n8n' },
  { id: 'vercel', label: 'Vercel', cat: 'Hosting', bundle: 'tech-vercel', deploy: true },
  { id: 'npm', label: 'npm publishing', cat: 'Release', bundle: 'npmjs' },
];

// Draft of stacks.json: which tools a kind of app starts with.
const STACKS = [
  {
    id: 'web-app',
    label: 'web app with accounts and data',
    hints: ['app', 'dashboard', 'tracker', 'saas', 'login', 'users'],
    tools: ['tanstack', 'typescript', 'react', 'shadcn', 'neon', 'drizzle', 'betterAuth', 'posthog', 'vercel'],
  },
  {
    id: 'offline-app',
    label: 'offline-first app',
    hints: ['offline', 'mobile', 'sync', 'local-first'],
    tools: ['tanstack', 'typescript', 'react', 'powersync', 'neon', 'drizzle', 'betterAuth', 'vercel'],
  },
  {
    id: 'website',
    label: 'website with CMS',
    hints: ['website', 'site', 'landing', 'blog', 'cms', 'marketing'],
    tools: ['nextjs', 'typescript', 'shadcn', 'payload', 'posthog', 'vercel'],
  },
  {
    id: 'ai-app',
    label: 'AI / LLM app',
    hints: ['ai', 'llm', 'agent', 'chat', 'gpt', 'claude'],
    tools: ['tanstack', 'typescript', 'react', 'trigger', 'langfuse', 'neon', 'vercel'],
  },
  {
    id: 'automation',
    label: 'background jobs',
    hints: ['automation', 'cron', 'job', 'workflow', 'scrape'],
    tools: ['typescript', 'trigger', 'n8n'],
  },
  {
    id: 'library',
    label: 'npm library',
    hints: ['library', 'package', 'npm', 'sdk', 'cli'],
    tools: ['typescript', 'npm'],
  },
];

const ACCOUNTS = ['timschoch', 'admin-laicadev', 'swissdesign-md'];

// Where production comes from, per tier. PRs always get a Vercel preview.
const DEPLOY_FLOW = {
  sandbox: 'main → production',
  tool: 'release → production',
  product: 'main → preview · release → production',
};

// What each tier turns on. Tiers are nested; source: docs/dev-process.md#tiers.
const TIER_EFFECTS = {
  sandbox: 'PR gate (lint, typecheck, unit, build) · no release-please · no AI review',
  tool: 'sandbox + release-please · AI PR review · required checks on main · Dependabot + npm audit',
  product: 'tool + e2e smoke in the PR gate · nightly e2e, drift and security scan · /security-review before release',
};

const titleCase = (kebab) =>
  (kebab || '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

const GROUPS = [
  ['concept', 'App concept'],
  ['repo', 'Repo'],
  ['stack', 'Stack'],
  ['output', 'Output / deployment'],
  ['misc', 'Misc'],
];

function matchStack(goal) {
  const text = (goal || '').toLowerCase();
  let best = null,
    bestScore = 0;
  for (const stack of STACKS) {
    const score = stack.hints.filter((hint) => text.includes(hint)).length;
    if (score > bestScore) {
      best = stack;
      bestScore = score;
    }
  }
  return best;
}

const setupPlan = {
  detect(sit) {
    const needsReadme = sit.readme !== 'real';
    const needsStack = sit.stack !== 'deps';
    return { needsReadme, needsStack, looksNew: needsReadme && needsStack, hasRemote: sit.remote === 'github' };
  },

  readmeDraft(name, goal, url) {
    if (!goal) return '';
    return `# ${name}\n\n${goal.trim().replace(/\.?$/, '.')}\n` + (url ? `\n${url}\n` : '');
  },

  // Every question the whole setup needs, grouped. Order inside a group =
  // impact, high to low; a question that depends on another sits below it.
  // kind: one | text | multi | info (info = shown, not asked).
  questions(sit, a) {
    const detected = setupPlan.detect(sit);
    const questions = [];
    const add = (group, id, kind, text, why, extra = {}) => questions.push({ group, id, kind, text, why, ...extra });

    // App concept
    if (detected.looksNew)
      add(
        'concept',
        'newRepoHelp',
        'one',
        'This repo looks new. Want help setting it up?',
        'no README text and no stack found',
        { options: ['yes', 'no'], def: 'yes' },
      );
    const helping = detected.looksNew && (a.newRepoHelp ?? 'yes') === 'yes';
    if (helping && detected.needsReadme) {
      add('concept', 'appName', 'text', 'App name', 'the README title; prefilled from the folder name', {
        def: titleCase(sit.folder),
      });
      add(
        'concept',
        'goal',
        'text',
        'What is the app concept? (1–2 sentences)',
        'becomes the README and preselects the stack',
        { def: '' },
      );
    }
    add(
      'concept',
      'tier',
      'one',
      'Scope',
      'sandbox = demos · tool = others use it · product = deployed, people depend on it',
      { options: ['sandbox', 'tool', 'product'], def: helping ? 'sandbox' : 'tool' },
    );
    const tierNow = a.tier ?? (helping ? 'sandbox' : 'tool');
    add(
      'concept',
      'tierInfo',
      'info',
      `<b>${tierNow}</b> turns on: ${TIER_EFFECTS[tierNow]} · deploy: ${DEPLOY_FLOW[tierNow]}`,
      '',
    );
    add(
      'concept',
      'wayfinder',
      'one',
      'Wayfinder (GitHub issues, triage labels, domain docs)?',
      'setup-matt-pocock-skills, with its defaults',
      { options: ['yes', 'no'], def: 'yes' },
    );
    add('concept', 'url', 'text', 'Production URL (optional)', 'goes into the README and the Vercel domain', {
      def: '',
      optional: true,
    });

    // Repo
    if (detected.hasRemote) {
      add('repo', 'repoInfo', 'info', `GitHub repo: <b>${sit.remoteName}</b>`, 'exists already');
    } else {
      add('repo', 'account', 'one', 'Which GitHub account owns the repo?', 'hard to change later', {
        options: ACCOUNTS,
        def: 'timschoch',
      });
      add('repo', 'repoName', 'text', 'Repo name', 'prefilled with the folder name', { def: sit.folder });
    }
    add('repo', 'layout', 'one', 'One app, or a monorepo?', 'monorepo = several apps/packages in one repo', {
      options: ['one app', 'monorepo'],
      def: 'one app',
    });
    if (!detected.hasRemote)
      add('repo', 'visibility', 'one', 'Private or public?', '', { options: ['private', 'public'], def: 'private' });
    add(
      'repo',
      'githubScaffolding',
      'one',
      'GitHub scaffolding (conventional commits/branches, trunk ruleset, CLAUDE.md)?',
      'setup-repo',
      { options: ['yes', 'no'], def: 'yes' },
    );
    add('repo', 'preCommit', 'one', 'Pre-commit hooks (Husky, lint-staged, Prettier)?', 'setup-pre-commit', {
      options: ['yes', 'no'],
      def: 'yes',
    });

    // Stack
    const match = matchStack(a.goal);
    const stackDefault = detected.needsStack ? (match ? match.tools : []) : sit.detectedTools;
    const why = detected.needsStack
      ? match
        ? `preselected for a ${match.label}`
        : 'nothing preselected — the app concept fits no stack'
      : 'preselected from package.json';
    add('stack', 'tools', 'multi', 'Tools (each one installs its skilly Bundle)', why, { def: stackDefault });
    const tools = a.tools ?? stackDefault;
    const hasFramework = tools.some((id) => TOOLS.find((tool) => tool.id === id)?.framework);
    if (detected.needsStack && hasFramework)
      add('stack', 'scaffold', 'one', 'Create the starter app for this stack?', 'Vercel needs an app to deploy', {
        options: ['yes', 'no'],
        def: 'yes',
      });
    add(
      'stack',
      'otherTools',
      'text',
      'Other tools',
      'not in the list above, e.g. "Stripe, Resend"; no skilly Bundle, no wiring',
      { def: '', optional: true },
    );

    // Output / deployment
    const tier = a.tier ?? (helping ? 'sandbox' : 'tool');
    // Something to deploy: existing code, or a starter app we create.
    const canDeploy =
      tools.includes('vercel') && (!detected.needsStack || (hasFramework && (a.scaffold ?? 'yes') === 'yes'));
    if ((a.githubScaffolding ?? 'yes') === 'yes')
      add('output', 'ciInfo', 'info', 'CI: <b>GitHub Actions</b> (lint, test, PR gate)', 'from setup-repo');
    if (canDeploy) {
      add('output', 'vercel', 'one', 'Deploy on Vercel?', `${tier}: ${DEPLOY_FLOW[tier]} · PRs get a preview`, {
        options: ['yes', 'no'],
        def: 'yes',
      });
      if ((a.vercel ?? 'yes') === 'yes') {
        add('output', 'vercelScope', 'one', 'Which Vercel team?', 'the project is created there', {
          options: ['personal', 'laica', 'swissdesign'],
          def: 'personal',
        });
        if (tools.includes('neon'))
          add(
            'output',
            'neon',
            'one',
            'Create the Neon database and connect it to Vercel?',
            'one database branch per preview',
            { options: ['yes', 'no'], def: 'yes' },
          );
      }
    } else {
      add(
        'output',
        'noDeployInfo',
        'info',
        tools.includes('vercel')
          ? 'No deployment: no app to deploy (pick a framework and create the starter app)'
          : 'No deployment: Vercel is not in the stack',
        '',
      );
    }
    const bundleOnly = tools
      .filter((id) => !TOOLS.find((tool) => tool.id === id)?.deploy)
      .map((id) => TOOLS.find((tool) => tool.id === id).label);
    if (bundleOnly.length)
      add(
        'output',
        'bundleOnlyInfo',
        'info',
        `Bundle only, no wiring: <b>${bundleOnly.join(', ')}</b>`,
        'out of scope for now',
      );

    // Misc
    add('misc', 'marketing', 'one', 'Will this repo produce marketing content?', 'adds the marketing Bundle', {
      options: ['yes', 'no'],
      def: match?.id === 'website' ? 'yes' : 'no',
    });

    return questions;
  },

  // Answers with defaults filled in; defaults depend on earlier answers, so settle.
  resolve(sit, a) {
    let out = {},
      prev;
    for (let attempt = 0; attempt < 6; attempt++) {
      const next = {};
      for (const question of setupPlan.questions(sit, { ...out, ...a }))
        if (question.kind !== 'info') next[question.id] = a[question.id] ?? question.def;
      const key = JSON.stringify(next);
      out = next;
      if (key === prev) break;
      prev = key;
    }
    out.name = out.repoName || sit.remoteName?.split('/')[1] || sit.folder;
    out.releasePlease = out.tier === 'sandbox' ? 'no' : 'yes';
    return out;
  },

  countAsked(qs) {
    return qs.filter((question) => question.kind !== 'info').length;
  },

  // Things only a human can do, all BEFORE the user leaves.
  beforeYouGo(sit, a) {
    const list = [];
    if (!sit.ghLogin)
      list.push({ id: 'ghLogin', text: `Log in to GitHub as ${a.account ?? 'the repo owner'}`, cmd: 'gh auth login' });
    if (sit.remote !== 'github')
      list.push({
        id: 'repoCreated',
        auto: true,
        text: 'Agent creates the GitHub repo now (the token below needs it)',
        cmd: `gh repo create ${a.account}/${a.name} --${a.visibility} --source . --push`,
      });
    if (a.githubScaffolding === 'yes' && a.tier !== 'sandbox' && !sit.claudeToken)
      list.push({
        id: 'claudeToken',
        text: 'Make the AI-review token, save it as a repo secret (the agent never sees it)',
        cmd: 'claude setup-token  →  gh secret set CLAUDE_CODE_OAUTH_TOKEN',
      });
    if (a.vercel === 'yes' && !sit.vercelLogin)
      list.push({ id: 'vercelLogin', text: `Log in to Vercel (team: ${a.vercelScope})`, cmd: 'vercel login' });
    if (a.neon === 'yes' && !sit.neonLogin) list.push({ id: 'neonLogin', text: 'Log in to Neon', cmd: 'neonctl auth' });
    return list;
  },

  steps(sit, a) {
    const steps = [];
    const add = (id, text, needs = []) => steps.push({ id, text, needs });
    if (a.goal) add('readme', 'Write README.md from the app concept');
    if (a.scaffold === 'yes') {
      const fw = TOOLS.find((tool) => tool.framework && a.tools.includes(tool.id));
      add(
        'scaffold',
        `Create the ${fw.label} starter app${a.layout === 'monorepo' ? ' in apps/web (monorepo)' : ''}, install, build once`,
      );
    }
    add('skilly', 'skilly setup: App secrets, .skilly/config.json, caller workflow');
    if (a.preCommit === 'yes') add('preCommit', 'setup-pre-commit');
    if (a.githubScaffolding === 'yes')
      add('repo', `setup-repo (tier: ${a.tier}): hooks, verify.json, CI, ruleset, CLAUDE.md`);
    if (a.releasePlease === 'yes') add('release', 'setup-release-please + merge settings');
    if (a.wayfinder === 'yes') add('wayfinder', 'setup-matt-pocock-skills with defaults');
    const bundles = [
      'workflow',
      ...a.tools.map((id) => TOOLS.find((tool) => tool.id === id).bundle),
      ...(a.marketing === 'yes' ? ['marketing'] : []),
    ];
    add('bundles', `skilly add ${bundles.join(' ')}`);
    add('update', 'skilly update');
    if (a.vercel === 'yes') {
      const needs = a.scaffold === 'yes' ? ['scaffold'] : [];
      add('vercelLink', `vercel link + git connect (team: ${a.vercelScope})`, needs);
      if (a.neon === 'yes') add('neon', 'Neon project + Vercel integration (DB branch per preview)', ['vercelLink']);
      add('deployFlow', `Deploy flow for ${a.tier}: ${DEPLOY_FLOW[a.tier]}`, ['vercelLink']);
      if (a.url) add('domain', `Add domain ${a.url} to the Vercel project`, ['vercelLink']);
      add('deploy', 'Test the flow: open a PR, wait for its preview deploy READY', ['deployFlow']);
    }
    add('audit', 'audit-skilly-workflow → HTML report (fixes wait for you)');
    add('pr', 'Push branch, open ONE setup PR (not merged)');
    return steps;
  },

  run(steps, faults) {
    const status = {};
    return steps.map((st) => {
      const blocked = st.needs.find((need) => status[need] === 'fail' || status[need] === 'blocked');
      const result = blocked ? 'blocked' : (faults[st.id] ?? 'ok');
      status[st.id] = result;
      return { ...st, status: result, note: blocked ? `needs "${blocked}"` : (NOTES[st.id]?.[result] ?? '') };
    });
  },

  whenBack(results) {
    const out = [];
    if (results.find((result) => result.id === 'pr')?.status === 'ok') out.push('Review and merge the setup PR');
    if (results.find((result) => result.id === 'deploy')?.status === 'ok')
      out.push('Open the Vercel preview URL (in the PR)');
    out.push('Read the audit report, pick the fixes you want');
    for (const result of results)
      if (result.status === 'fail' || result.status === 'blocked') out.push(`Fix: ${result.text} — ${result.note}`);
    for (const result of results) if (result.status === 'warn') out.push(`Note: ${result.text} — ${result.note}`);
    return out;
  },
};

const NOTES = {
  repo: { warn: 'rulesets gave 403 (free private repo) — trunk protection stays local, pre-push hook only' },
  deploy: { fail: 'preview build failed on Vercel — log saved to .temp/vercel-build.log' },
  scaffold: { fail: 'npm install failed' },
};

// Sections are filled in order: done (confirmed), current (the first unconfirmed), locked (after current).
// Sections without questions are skipped.
function sections(sit, answers, confirmed) {
  const qs = setupPlan.questions(sit, answers);
  let currentSeen = false;
  return GROUPS.map(([id, title]) => ({ id, title, questions: qs.filter((question) => question.group === id) }))
    .filter((section) => section.questions.length)
    .map((section) => {
      if (confirmed.includes(section.id)) return { ...section, status: 'done' };
      const status = currentSeen ? 'locked' : 'current';
      currentSeen = true;
      return { ...section, status };
    });
}

Object.assign(globalThis, {
  TOOLS,
  STACKS,
  ACCOUNTS,
  DEPLOY_FLOW,
  TIER_EFFECTS,
  GROUPS,
  titleCase,
  matchStack,
  setupPlan,
  sections,
});
