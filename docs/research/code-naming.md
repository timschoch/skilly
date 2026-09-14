# Code naming: research

Input for `bundles/workflow/rules/workflow-naming.md` (not yet written). Researched 2026-09-14.

## Question

How should agents name variables, functions, files and enum values? Which rules have primary-source backing, where do sources disagree, and what does a ~10-line rule need to say that this repo does not already say?

Source grading: **P** = primary page fetched and quoted. **S** = secondary (search index, abstract aggregator, third-party summary); verify before relying on it.

## Is there a Conventional-Commits-like standard?

**No.** No single short, named, tool-enforced, cross-language naming spec exists. Naming conventions are per language (PEP 8, Rust RFC 430, Go style) or per org (Google, Microsoft, Google AIP-190), enforced by configurable lint rules, not by one spec.

| Candidate | What it is | Adoption evidence | Verdict |
| --- | --- | --- | --- |
| [PEP 8 naming](https://peps.python.org/pep-0008/#naming-conventions) + [ruff `N` rules](https://docs.astral.sh/ruff/rules/) / [pep8-naming](https://pypi.org/project/pep8-naming/) | Python's official style; ruff ships N801 `invalid-class-name`, N802 `invalid-function-name` ... (P) | pep8-naming ~432k PyPI downloads/week ([pypistats](https://pypistats.org/packages/pep8-naming), 2026-09) | Closest to a de-facto standard, but Python only |
| [typescript-eslint `naming-convention`](https://typescript-eslint.io/rules/naming-convention/) | Configurable casing/prefix rule. Not in recommended config; "requires type information"; "currently frozen and is not accepting feature requests" (P) | Plugin 96.5M npm downloads/week, 16.4k stars; rule usage unknown (opt-in) | Tool, not a standard |
| [Biome `useNamingConvention`](https://biomejs.dev/linter/rules/use-naming-convention/) | Style group, not recommended by default; `strictCase` default forbids consecutive capitals (`HTTPServer`) (P) | `@biomejs/biome` 11.0M/week, 25.8k stars | Tool with opinionated defaults |
| [Biome `useFilenamingConvention`](https://biomejs.dev/linter/rules/use-filenaming-convention/) | Default accepts camelCase, kebab-case, snake_case, or the name of an export (P) | same package | Permissive default |
| [unicorn `filename-case`](https://github.com/sindresorhus/eslint-plugin-unicorn/blob/main/docs/rules/filename-case.md) | "The default is `kebabCase`"; enabled in `recommended` (P) | 5.2M/week, 5.2k stars | Nearest to a JS file-name default |
| [eslint-plugin-check-file](https://www.npmjs.com/package/eslint-plugin-check-file) | File/folder naming patterns | 785k/week | Niche |
| [ls-lint](https://ls-lint.org/) | One `.ls-lint.yml` for file and directory names, any language (P) | 135k/week, 2.4k stars | Niche |
| [Google AIP-190](https://google.aip.dev/190) | Naming for Google APIs: American English, "same name or term for the same concept", `VerbNoun` methods (P) | Google Cloud APIs | API surfaces only |
| BEM, JSON:API/OpenAPI casing | CSS classes / wire formats | not checked in depth | Out of scope for code identifiers |

Comparison: `@commitlint/cli` 7.2M/week, [conventionalcommits.org](https://github.com/conventional-commits/conventionalcommits.org) 9.2k stars. Naming has lint tools with more downloads, but no spec they all implement.

## Findings

### General principles

- Clarity at the point of use is the top goal; "Entities such as methods and properties are declared only once but used repeatedly." ([Swift API Design Guidelines](https://www.swift.org/documentation/api-design-guidelines/), P)
- "Include all the words needed to avoid ambiguity" and "Omit needless words. Every word in a name should convey salient information at the use site." (Swift, P)
- "Name variables, parameters, and associated types according to their roles, rather than their type constraints." (Swift, P). Pragmatic Programmer Topic 44 also says to name by the role a thing plays (S, [O'Reilly TOC excerpt via search](https://www.oreilly.com/library/view/the-pragmatic-programmer/9780135956977/f_0068.xhtml); full text 403).
- "TypeScript expresses information in types, so names should not be decorated with information that is included in the type." ([Google TS Style Guide, Naming style](https://google.github.io/styleguide/tsguide.html#naming-style), P)
- "Pick one word for one abstract function and stick with it ... confusing to have fetch, retrieve and get as same-acting methods"; "Don't use the same word for two purposes"; "Avoid Encodings"; "Don't add Artificial Context"; "No Disambiguation without Differentiation". ([Ottinger's Rules for Variable and Class Naming](https://exelearning.org/wiki/OttingersNaming/), mirror of the [Object Mentor original](https://objectmentor.com/resources/articles/naming.htm), P). Ottinger rule 10: "most important names should be in a glossary".
- "Use the same name or term for the same concept, including for concepts shared across APIs." ([AIP-190](https://google.aip.dev/190), P). AIP-190 also names overly general words as past problems: "Instance, info, and service".
- Pragmatic Programmer Tip 74: "Name Well; Rename When Needed. Name to express your intent to readers, and rename as soon as that intent shifts." ([pragprog.com tips](https://pragprog.com/tips/), P). Topic 44 opens with "The beginning of wisdom is to call things by their proper name" (S, search snippet).
- "There are only two hard things in Computer Science: cache invalidation and naming things." Phil Karlton, via [Fowler, TwoHardThings](https://martinfowler.com/bliki/TwoHardThings.html) (P). Fowler's catalog files renaming under [Change Function Declaration](https://refactoring.com/catalog/changeFunctionDeclaration.html) (aliases Rename Function/Method; example `circum` to `circumference`) (P).
- Kent Beck: "extract the sub-expression into a variable named after the intention of the expression." ([Explaining Variable, Tidy First?](https://tidyfirst.substack.com/p/explaining-variable), P, paywalled after intro). Implementation Patterns' "Intention-Revealing Name" text not reachable; no quote.
- Clean Code ch. 2 "Meaningful Names": no primary text reachable. Secondary sources say it builds on Ottinger's rules (S, [parallelcross.com](https://parallelcross.com/post/36861185276/naming-strategies-uncle-bob-and-ottinger)); cite Ottinger instead.
- Research: developers rarely agree on a name. "In the 47 instances in our experiments the median probability was only 6.9%." Names built with a three-step model (pick concepts, pick words, construct) "were judged ... superior ... by a ratio of two-to-one" and were longer. ([Feitelson, Mizrahi, Noy, How Developers Choose Names, TSE 48(1), arXiv:2103.07487](https://arxiv.org/abs/2103.07487), DOI [10.1109/TSE.2020.2976920](https://doi.org/10.1109/TSE.2020.2976920), P abstract)
- Research: flawed identifiers in Java classes and methods associate with low quality per static analysis. ([Butler, Wermelinger, Yu, Sharp, CSMR 2010](https://doi.org/10.1109/CSMR.2010.27), S abstract)
- Research: 17 "linguistic antipatterns" where name, type and behavior disagree. ([Arnaoudova, Di Penta, Antoniol, EMSE 21, 2016](https://doi.org/10.1007/s10664-014-9350-8); catalog on [author's LAPD page](https://www.veneraarnaoudova.com/linguistic-anti-pattern-detector-lapd/), P). Examples: A1 "Method get does more than returning the corresponding attribute", A2 "Method name is predicate but return type is not Boolean", A3 "Method set returns", A4/B6/D1/E1 singular vs plural mismatch, C1 "Method name and type use antonyms".

### Variables

- Descriptive over short. Google TS disallows `n`, `nErr`, `cstmrId`; "do not abbreviate by deleting letters within a word"; short names acceptable only in scopes of ≤10 lines. ([Google TS](https://google.github.io/styleguide/tsguide.html#descriptive-names), P)
- Go: "the length of a name should be proportional to the size of its scope and inversely proportional to the number of times that it is used within that scope." ([Google Go Style Decisions](https://google.github.io/styleguide/go/decisions.html#variable-names), P)
- Go on repetition: evaluate names "in the context of the user of the symbol"; `db.UserCount()` returning `userCount` is flagged as redundant. (Go Decisions, P). Swift "omit needless words" agrees.
- Abbreviations: "Abbreviations, especially non-standard ones, are effectively terms-of-art ... The intended meaning for any abbreviation you use should be easily found by a web search." (Swift, P). AIP-190: "Commonly accepted short forms ... may be used" (P). Ottinger: "Use Pronounceable names" (P).
- Research: word names beat letters and abbreviations. 72 professional C# developers found defects ~19% faster with words. ([Hofmeister, Siegmund, Holt, SANER 2017](https://doi.org/10.1109/SANER.2017.7884623); extended in [EMSE 2019](https://doi.org/10.1007/s10664-018-9621-x), S abstract). Over 100 programmers: "full word identifiers lead to the best comprehension; however, in many cases, there is no statistical difference between full words and abbreviations." ([Lawrie, Morrell, Feild, Binkley, ICPC 2006](https://doi.org/10.1109/ICPC.2006.51), S abstract)
- Beck: variable named after the intention of the expression (see General).
- **Disagreement, name length.** Go/Google TS allow one-letter names in tiny scopes; Go receivers "usually one or two letters" (P). Research favors words; Lawrie finds common abbreviations often no worse. Reconcile: length scales with scope; abbreviate only what a web search resolves.

### Booleans

- "Uses of Boolean methods and properties should read as assertions about the receiver when the use is nonmutating, e.g. `x.isEmpty`, `line1.intersects(line2)`." (Swift, P)
- "DO name Boolean properties with an affirmative phrase (`CanSeek` instead of `CantSeek`). Optionally ... prefix ... with "Is", "Can", or "Has", but only where it adds value." ([.NET, Names of Type Members](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/names-of-type-members), P)
- McConnell, Code Complete 2 ch. 11: names that imply true/false (`statusOK`, `sourceFileFound`, not `status`), positive names over `notFound`/`notDone`. (S, [chapter summary](https://nikola-breznjak.com/blog/books/programming/code-complete-2-steve-mcconnell-power-variable-names/); [O'Reilly ch11](https://www.oreilly.com/library/view/code-complete-2nd/0735619670/ch11s02.html) 403)
- `is*` names must be boolean: Arnaoudova A2 (method) and D2 (attribute) (P).
- typescript-eslint docs example prefixes: `is`, `should`, `has`, `can`, `did`, `will` (P).
- poteto: "A state machine instead of scattered booleans"; red flag is "a second boolean that must stay in sync with the first" ([principle-model-the-domain](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-model-the-domain/SKILL.md), P). Type guards: "Name them `isX` or `hasX`" and a guard "Must verify the claim" ([typescript-best-practices](https://github.com/cursor/plugins/blob/main/pstack/skills/typescript-best-practices/SKILL.md), P).

### Functions

- "DO give methods names that are verbs or verb phrases." Properties: noun, noun phrase or adjective. Events: present/past tense (`Closing`/`Closed`), no `Before`/`After`. (.NET, P)
- Ottinger rule 6: accessors "can and probably should have noun names" (`person.name()`), other methods verb phrases (P).
- Swift: mutating = imperative verb (`sort`, `append`); nonmutating = `-ed`/`-ing` (`sorted`, `appending`) or noun; factories start with `make`. (P)
- Rust C-GETTER: omit `get_` except when "there is a single and obvious thing that could reasonably be gotten" (`Cell::get`). C-CONV: `as_` free borrowed view, `to_` expensive/new owned, `into_` consumes. C-WORD-ORDER: consistent order (`ParseIntError`). ([Rust API Guidelines, Naming](https://rust-lang.github.io/api-guidelines/naming.html), P)
- AIP-190: methods `VerbNoun`; prefer familiar terms ("delete is preferred over erase") (P).
- Opposite pairs used consistently (add/remove, begin/end, create/destroy): McConnell ch. 11 (S, same summary). Arnaoudova C1 flags antonym contradictions (P).
- Arnaoudova A1/B7 (`get` that does more or returns something else), A3 (`set` returns), B3 (name promises a return, `void`), B5 (transform does not return result) (P).
- poteto: parse external data "where data crosses in, into a named domain type"; "Pass objects, not positional, so argument order is self-documenting" (typescript-best-practices, P).
- **Disagreement, `get` prefix.** Rust and Swift drop it; .NET forbids a property and a `GetX` method with the same name; Java/JS codebases commonly use `getX`. Arnaoudova's point holds for all: if you use `get`, it only gets.

### Files

- Google JS: "File names must be all lowercase and may include underscores ( _ ) or dashes ( - ), but no additional punctuation. Follow the convention that your project uses." ([Google JS Style Guide 2.1](https://google.github.io/styleguide/jsguide.html#file-name), P). Google TS guide has no file-name rule (searched, P).
- PEP 8: "Modules should have short, all-lowercase names." (P)
- unicorn `filename-case` default `kebabCase`, in `recommended` (P). Biome default accepts camel/kebab/snake or an export's name (P).
- This repo: every tracked `.js/.mjs/.sh` file is kebab-case, mostly verb-noun (`lib/ensure-branch.js`, `scripts/render-pr-body.mjs`, `check-commit-msg.mjs`) (`git ls-files`).
- **Disagreement.** kebab (unicorn, this repo) vs "any case or export name" (Biome) vs snake (Python, Go files). Only consistent rule: lowercase, match the project.

### Enums and union types

- .NET: "DO use a singular type name for an enumeration unless its values are bit fields." "DO use a plural type name for an enumeration with bit fields." No `Enum`/`Flag(s)` suffix; "DO NOT use a prefix on enumeration value names". ([.NET, Names of Classes...](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/names-of-classes-structs-and-interfaces#naming-enumerations), P)
- Google JS 6.2.4: enum names "UpperCamelCase ... should generally be singular nouns. Individual items within the enum are named in CONSTANT_CASE." (P). Google TS: `CONSTANT_CASE` for "global constant values, including enum values" (P).
- Biome `useNamingConvention`: enum members default `PascalCase` (P). Rust: variants `UpperCamelCase` (C-CASE, P). Swift: cases lowerCamelCase ("Everything else is lowerCamelCase", P).
- Go (samber skill, community): type-name prefix on iota constants, zero value = unknown (`StatusUnknown`) ([golang-naming SKILL.md](https://github.com/samber/cc-skills-golang/blob/main/skills/golang-naming/SKILL.md), S). Conflicts with .NET "no prefix on values" across languages; each is idiomatic in its own.
- Matt Pocock: "Never pluralize: Unless your type is an array type, you should make it singular - even if it's a union of members." ([How to Name your Types](https://www.totaltypescript.com/tips/how-to-name-your-types), P). On TS enums: "I wouldn't add an enum to a fresh codebase"; prefers `as const` objects; if forced, string enums only ([Why I don't like TypeScript enums](https://www.totaltypescript.com/why-i-dont-like-typescript-enums), P).
- poteto: "Model variants with a `kind` literal discriminant"; "Pick one discriminant name (`kind`, `type`, `tag`) and stick to it." ([patterns.md](https://github.com/cursor/plugins/blob/main/pstack/skills/typescript-best-practices/references/patterns.md), P)
- Arnaoudova A4/B6/D1/E1: plural name for single value or singular name for collection is an antipattern (P). .NET: collection properties plural, not `List`/`Collection` suffix (P).
- **Disagreement, singular vs plural.** Singular type everywhere (.NET non-flags, Google JS, Matt). Plural only for .NET flags enums; Matt has no flags exception. **Disagreement, value casing.** CONSTANT_CASE (Google JS/TS), PascalCase (.NET, Biome default, Rust), lowerCamelCase (Swift). No cross-language answer; follow the language guide or the project linter.

### Casing and acronyms

- Google TS table: `UpperCamelCase` classes/interfaces/types/enums/type params; `lowerCamelCase` variables/params/functions/methods/properties; `CONSTANT_CASE` global constants and enum values. No `_` prefix/suffix; no `I` prefix on interfaces. (P)
- PEP 8: `lower_case_with_underscores` functions/variables, `UPPER_CASE` constants, CapWords classes; never `l`, `O`, `I` as single-char names. Overriding principle: public names "should follow conventions that reflect usage rather than implementation." (P)
- Rust C-CASE: `UpperCamelCase` types, `snake_case` values (P).
- Matt Pocock: "Choose a different casing between your values and your types"; "Prefixes like IUser and TOrganization ... are mostly just holdovers from the Java days"; generic params prefixed `T`, bare `T` if only one (P, How to Name your Types).
- Research: camelCase vs under_score is unsettled. Binkley et al. (135 subjects): "camel casing leads to higher accuracy among all subjects regardless of training, and those trained in camel casing are able to recognize identifiers in the camel case style faster" ([ICPC 2009 PDF](https://www.cs.loyola.edu/~binkley/papers/icpc09-clouds.pdf), DOI [10.1109/ICPC.2009.5090039](https://doi.org/10.1109/ICPC.2009.5090039), P). Sharif and Maletic eye tracking: "no difference in accuracy between the two styles, but subjects recognize identifiers in the underscore style more quickly" (subjects trained mainly in underscore) ([ICPC 2010 PDF](https://www.cs.kent.edu/~jmaletic/papers/ICPC2010-CamelCaseUnderScoreClouds.pdf), DOI [10.1109/ICPC.2010.41](https://doi.org/10.1109/ICPC.2010.41), P). Takeaway: training dominates; follow the language convention.
- **Disagreement, acronyms.** As words: Google TS `loadHttpUrl` (P), Rust `Uuid` not `UUID` (P), Biome `strictCase` default (P). Uniform caps: PEP 8 "HTTPServerError is better than HttpServerError" (P), Go "URL should appear as URL or url ... never as Url" (P), Swift uniform case for common acronyms (`utf8Bytes`, `userSMTPServer`) (P).
- **Disagreement, interface prefix.** .NET: "DO prefix interface names with the letter I" (P). Google TS and Matt: no `I` prefix (P).

## Existing skills and rules survey

| # | Name | Link | What it says | Reuse? |
| --- | --- | --- | --- | --- |
| 1 | golang-naming (38.4k installs) | [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang/blob/main/skills/golang-naming/SKILL.md) | Full Go table: MixedCaps, `Err` prefix, `-er` interfaces, `is/has/can` booleans, iota enums with unknown zero value | No; Go-only, too long for a rule. Link from a tech bundle if Go appears |
| 2 | naming-analyzer (3.8k) | [softaworks/agent-toolkit](https://github.com/softaworks/agent-toolkit/blob/main/skills/naming-analyzer/SKILL.md) | Generic audit checklist plus per-language casing table; recommends `_prefixUnderscore` for TS privates | No; generic, contradicts Google TS on `_` |
| 3 | naming-format (323) | [tartinerlabs/skills](https://github.com/tartinerlabs/skills/blob/main/skills/naming-format/SKILL.md) | File-name casing, suffixes (`.test` vs `.spec`), export naming; audit-then-fix with `git mv` | Idea only: "detect dominant casing, follow it" |
| 4 | domain-modeling / grill-with-docs | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling) | Challenge terms against `CONTEXT.md`, propose one canonical term, `_Avoid_` synonyms | Already here as `.agents/skills/domain-modeling`; link |
| 5 | codebase-design | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/engineering/codebase-design) | Fixed glossary (module, interface, seam, adapter) with `_Avoid_` lists | Already here; its vocabulary is a naming source for design terms |
| 6 | typescript-best-practices | [cursor/plugins pstack](https://github.com/cursor/plugins/blob/main/pstack/skills/typescript-best-practices/SKILL.md) | `kind` discriminant, `isX`/`hasX` guards, object args, parse into named domain types | Partial; lines feed the draft |
| 7 | principle-model-the-domain | [cursor/plugins pstack](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-model-the-domain/SKILL.md) | Structure over scattered booleans | Not in this repo's router table; link or add |
| 8 | awesome-cursorrules `typescript.mdc` | [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/typescript.mdc) (40.8k stars) | PascalCase types, camelCase vars, UPPER_CASE constants, "auxiliary verbs (e.g., isLoading, hasError)", `ButtonProps` | No; casing a linter already enforces |
| 9 | awesome-cursorrules `clean-code.mdc` | [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/clean-code.mdc) | "Use consistent file and folder naming conventions" | No; too vague |
| 10 | anthropics/skills | [github.com/anthropics/skills](https://github.com/anthropics/skills) | No naming skill in tree (path grep for `nam`/`convention`) | n/a |

Most other skills.sh hits for "naming" are brand, product or baby naming ([skills.sh search API](https://skills.sh/api/search?q=naming)).

## mattpocock and poteto

### Identity

- **mattpocock**: Matt Pocock, Total TypeScript author; skills at [github.com/mattpocock/skills](https://github.com/mattpocock/skills). This repo vendors his `domain-modeling`, `codebase-design`, `grilling`, `tdd`, `research` and others under `.agents/skills/`.
- **"potetos"**: identified as **poteto**, GitHub [@poteto](https://github.com/poteto): display name "Lauren Poteto", bio "Software Engineer @xai-org & @react compiler core team", X [@poteto](https://x.com/poteto). The [pstack README](https://github.com/cursor/plugins/blob/main/pstack/README.md) opens "i'm poteto" and calls the skills "the same skills i use everyday to ship high quality code at Cursor". Confidence high that the handle is poteto: this repo's router ([.claude/rules/workflow-invoke-cursor-skills.md](../../.claude/rules/workflow-invoke-cursor-skills.md)) already applies pstack's `principle-*` skills. No GitHub or X account named "potetos" was checked or found. Surname not verified from a primary source in this session; not stated.

### Matt Pocock on naming

- Shared language first. README #2: agents "use 20 words where 1 will do"; fix is a `CONTEXT.md` glossary; benefit "**Variables, functions and files are named consistently**, using the shared language" ([README](https://github.com/mattpocock/skills/blob/main/README.md), P). Example: "a lesson inside a section of a course is made 'real'" becomes "the materialization cascade".
- Type names ([How to Name your Types](https://www.totaltypescript.com/tips/how-to-name-your-types), P): never pluralize unless an array type, even for unions; different casing for values and types; `T` prefix on type params, bare `T` if single; no `I`/`T` prefixes on types.
- Enums: none in fresh code; `as const` objects or unions; string enums if forced ([enums article](https://www.totaltypescript.com/why-i-dont-like-typescript-enums), P).
- Quotes The Pragmatic Programmer twice in the README ("No-one knows exactly what they want", "Always take small, deliberate steps") (P). Its naming tip is Tip 74 above.
- Generic params on X: "default to T + prefix" (S, [search snippet of x.com post](https://x.com/mattpocockuk/status/1906054903669092506); x.com returned 402).
- No Matt source on file names found.

### poteto on naming

- No dedicated naming skill in [pstack](https://github.com/cursor/plugins/tree/main/pstack/skills). Naming shows up as structure:
  - "Any code → name the data shape first" ([poteto-mode](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md), P).
  - State machine or discriminated union over scattered booleans (principle-model-the-domain, P).
  - One discriminant name, `kind`; guards `isX`/`hasX` that verify their claim; parse into a named domain type at the boundary (typescript-best-practices + patterns.md, P).
  - "Name the invariant at the boundary, not in every consumer, so the reader learns it once." ([principle-minimize-reader-load](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-minimize-reader-load/SKILL.md), S via WebFetch summary).
  - unslop rule 11 "Synonym cycling ... Pick one, repeat it" applies to prose, same rule as Ottinger 4 for code ([unslop](https://github.com/cursor/plugins/blob/main/pstack/skills/unslop/SKILL.md), P).

### Conflicts with primary style guides

| Point | mattpocock / poteto | Primary guide | Draft choice |
| --- | --- | --- | --- |
| Interface prefix | Matt: no `IUser` | .NET: `I` prefix required; Google TS: no prefix | No prefix (TS repo; Google TS agrees) |
| Enum type plural | Matt: never, even unions | .NET: plural for flags enums | Singular; flags enums are rare in TS |
| TS `enum` | Matt: avoid, use unions/`as const` | Google TS allows enums, values CONSTANT_CASE | Unions/`as const`; value casing left to linter |
| Type param names | Matt: `T` prefix (`TItem`) | Google TS: `T` or UpperCamelCase; .NET: `T` prefix | Matt's form, no conflict |
| Boolean flags | poteto: collapse synced booleans into `kind` union | Swift/.NET only cover naming the boolean | Both: name booleans as assertions, replace coupled booleans |

## Overlap with this repo

| Existing file | Already covers | New rule should |
| --- | --- | --- |
| [writing-rules/rules/all.md](../../bundles/workflow/skills/writing-rules/rules/all.md) | 201 "Use the repo's `CONTEXT.md` term, never a synonym"; 204 rename everywhere in the same PR, `git grep` the old word | Link 201/204; do not restate for prose. Extend to identifiers in one line |
| [docs/agents/domain.md](../agents/domain.md) | Use glossary vocabulary for domain concepts; missing term is a signal for `/domain-modeling` | Link as the source of domain words |
| [.agents/skills/domain-modeling](../../.agents/skills/domain-modeling/SKILL.md) | Resolving and recording canonical terms in `CONTEXT.md` | Link: "new domain word → domain-modeling" |
| [bundles/workflow/skills/term-check](../../bundles/workflow/skills/term-check/SKILL.md) | Probing competing candidate names (field, enum value, table) with three models | Link: "two or more candidates → term-check" |
| [.agents/skills/codebase-design](../../.agents/skills/codebase-design/SKILL.md) | Fixed design vocabulary (module, seam, adapter) | Link only if the rule mentions design terms |
| [.claude/rules/workflow-invoke-cursor-skills.md](../../.claude/rules/workflow-invoke-cursor-skills.md) | Routes to pstack principle skills; `principle-model-the-domain` not listed | Optional: add model-the-domain row instead of repeating its boolean rule |
| Lint config: this repo has Prettier only (`.prettierrc`, no ESLint/Biome config); consumers often run Biome ([lib/formatter-ignores.js](../../lib/formatter-ignores.js)) | Nothing lints names here. In Biome repos, `useNamingConvention` / `useFilenamingConvention` can | Rule should defer casing to the consumer's linter (principle-encode-lessons-in-structure) rather than list a casing table |

## User-supplied articles

Two secondary sources. Medium blocks fetches (HTTP 403); the article text was read in full from a copy, 2026-09-14. It restates Clean Code ch. 2, so it counts as **S**. dev.to article fetched in full: **P**.

1. [32 Golden Rules for Meaningful Naming in Code](https://medium.com/@mateeb.ce41ceme/32-golden-rules-for-meaningful-naming-in-code-73b4e52c2577) (Ateeb Taseer, Medium, S)
2. [How do you name things?](https://dev.to/pacheco/how-do-you-name-things-3jae) (dev.to, P)

Neither article names a linter that enforces Pragmatic-Programmer-style naming.

| Rule (grouped) | Article | Traces to | Verdict |
| --- | --- | --- | --- |
| Avoid arbitrary/number-series/noise-word names (`a1`, `data`, `info`) | 1 | Ottinger 4/9 "No Disambiguation without Differentiation", AIP-190 "Instance, info, service" (already P in doc) | Dup |
| Pronounceable names | 1 | Ottinger "Use Pronounceable names" (P, already in doc) | Dup |
| Avoid complex/confusing abbreviations | 1, 2 ("Avoid abbreviations") | Swift web-search-resolvable rule, AIP-190 (P, already in doc) | Dup |
| Short names only in small/local scope | 1, 2 ("Keep it short but meaningful") | Go/Google TS scope-proportional length (P, already in doc) | Dup |
| Searchable names; avoid single letters and bare numeric constants | 1 (via search snippet) | Not explicit in doc (Clean Code "Use Searchable Names", unreachable primary) | New — sharpens DRAFT line 3 |
| Verbs for function names | 2 | .NET "verbs or verb phrases", Ottinger 6 (P, already in doc) | Dup |
| One single action per function | 2 | Not in doc (adjacent to Ottinger "pick one word per function" but about responsibility, not word choice) | New candidate |
| Long prefix menu for functions: get, find, show, list, insert, add, update, change, set, fetch, retrieve | 2 | Conflicts with doc's Ottinger quote: "confusing to have fetch, retrieve, get as same-acting methods" — pick one, don't offer ~11 near-synonyms | Conflict |
| DTO / object for multi-parameter functions | 2 | Reinforces poteto "pass objects, not positional" (P, already in doc, function section) but names the DTO mechanism explicitly | New candidate |
| Type hints on parameters | 2 | Google TS "names should not be decorated with information in the type" — dev.to's framing (add hints) is milder, not contradictory since it means language-level typing, not name decoration | Dup (different mechanism, same goal) |
| Class/property naming: nouns, CamelCase, avoid acronyms | 2 | .NET properties noun/adjective, Swift/PEP 8/Rust acronym rules (P, already in doc) | Dup |
| Explicit "Abstract" prefix/suffix on interface names (e.g. `AbstractDBSession`) | 2 | Doc already logs an interface-prefix disagreement (.NET `I` vs Google TS/Matt no-prefix); this is a third convention | New — extends the interface-prefix disagreement to three positions |
| Enums: singular noun, must have 2+ values | 2 | .NET singular enum type name, Ottinger (P, already in doc) | Dup |
| Group related functionality into modules; enable readable full-path imports (cites Google Python style guide) | 2 | Not covered in doc's Files/Casing sections (doc covers file names, not module/package grouping) | New candidate |

### Medium article, all 32 rules (full text)

| Rules | Verdict |
| --- | --- |
| 1–4, 7–9, 11, 13–17, 19–21, 25, 28, 31–32 | Dup of findings already in doc: intention-revealing, no disinformation, no `I` prefix, no Hungarian/member prefixes, verbs for methods, one word per concept, scope-proportional length, no gratuitous context |
| 5, 8, 20 | Sharpen: no data-structure word in a name (`accountList` → `accounts`); ban noise words `Data`, `Info`, `Manager`, `Processor` (add `Helper`, `Util`) |
| 12 | New, lintable: no magic numbers (Biome `noMagicNumbers`) |
| 22 | New: named static factories over overloaded constructors → adds `fromX` to the prefix list |
| 26 | New: one role word per role (`Controller`, not `Manager` next to `Controller`) → the schema's `role` part is a fixed list per repo |
| 27 | Conflict: recommends `insert` for collections, `add` for arithmetic. Rejected: rule 25 (one word per concept) and Ottinger weigh more; `add`/`remove` stays for collections |
| 18 | Conflict: `ShapeFactoryImp` suffix. Rejected: neither Matt nor poteto encode implementations; no interface-vs-impl split in the TS repos in scope |
| 23, 24, 29, 30 | Doc-only, LLM judgement: no clever names, no slang, solution-domain terms first, problem-domain terms second |

### Genuinely new candidates (not in Findings/DRAFT)

- **Noise-word ban** (Medium 5/8/20): `Data`, `Info`, `Manager`, `Processor`, `Helper`, `Util`, and collection-type words (`List`, `Map`) in names. Greppable → gate.
- **No magic numbers** (Medium 12): Biome `noMagicNumbers`.
- **`fromX` factories** (Medium 22): add `from` to the encouraged prefixes.
- **Fixed role vocabulary** (Medium 26): the schema's `role` part is a closed list per repo.

- **Searchable names** (Medium 12): ban bare single letters and magic numeric constants outside tiny scopes. Sharper than DRAFT line 3's scope-length rule.
- **One action per function name**: a function name promising "and" (e.g. `saveAndNotify`) signals it should split. Not in current Functions findings; complements DRAFT line 7.
- **DTO/object param over positional args, explicitly named**: dev.to's framing gives poteto's existing "pass objects, not positional" a concrete mechanism name worth citing in the Functions section.
- **Three-way interface-prefix split**: `I`-prefix (.NET) vs no-prefix (Google TS/Matt) vs explicit `Abstract`-affix (dev.to). Doc's Casing disagreement table should note the third option, still resolved as "no prefix" for this TS repo.
- **Module/package grouping + readable full-path imports**: dev.to cites Google's Python style guide for this; doc's Files section covers file *names* but not module grouping. Out of scope for a 10-line identifier-naming rule, worth a one-line note if module structure is ever covered.

## Observed in code: mattpocock & poteto

### Sample

| Person | Repo | Range | Scope |
| --- | --- | --- | --- |
| Matt | [mattpocock/course-video-manager](https://github.com/mattpocock/course-video-manager/tree/a20151178e) | since 2025-09-10 .. `a201511` (2026-09-10) | all TS/JS |
| Matt | [mattpocock/sandcastle](https://github.com/mattpocock/sandcastle/tree/e99f832f26) | `7ca1a9d` (2026-03-17) .. `e99f832` | all TS/JS |
| Matt | [mattpocock/ai-hero-cli](https://github.com/mattpocock/ai-hero-cli/tree/7e32796547) | since 2025-09-01 .. `7e32796` | all TS/JS |
| Matt | [mattpocock/evalite](https://github.com/mattpocock/evalite/tree/e18a793789) | since 2025-09-30 .. `e18a793` | all TS/JS |
| poteto | [cursor/plugins](https://github.com/cursor/plugins/tree/5bf2b1544d/pstack/skills/poteto-mode/scripts) | `99559f2` (2026-08-02) .. `5bf2b15` | `pstack/skills/poteto-mode/scripts` |
| poteto | [poteto/no.lol](https://github.com/poteto/no.lol/tree/324147b321) | `92ee00f` (2026-08-25) .. `324147b` | `src/` |
| poteto | [facebook/react](https://github.com/facebook/react/commits?author=poteto) | 63 poteto commits, 2025-07-01 .. 2026-07-08 | added TS/JS lines; fixtures, Rust excluded |

- Size: Matt 276k lines, 1,489 files, 12,233 unique identifiers. poteto 13.6k lines, 42 files, 1,080 unique identifiers.
- Method: regex over declarations (`function`, arrow `const`, `const`/`let`, `type`/`interface`/`class`/`enum`, `x: boolean`, string-literal unions, `kind|type|tag|state|status|mode: '...'` pairs). Unique names per person. Heuristic, not a TS parser: read percentages as +-5 points.
- Caveats: Matt's history is ~85% Matt-authored commits, the rest bots and agents (claude-code[bot], RALPH, sandcastle-agent[bot]); course-video-manager is 79% of his files. poteto's sample is small: boolean and generic rows have n < 20. no.lol code predates the upgrade commit. Both likely write through agents; this measures what they ship under their name.

### Measured patterns

| Pattern | Matt | poteto | Examples |
| --- | --- | --- | --- |
| `I`/`T` prefix on type names | 0% (0/1,167) | 0% (0/140) | none found |
| Type kind: `type` / `interface` / `class` / `enum` | 57 / 28 / 15 / 0% | 42 / 52 / 5 / 1% (n=140) | poteto's one enum extends React's existing [`CompilerError.ts`](https://github.com/facebook/react/blob/3e1b34dc51/compiler/packages/babel-plugin-react-compiler/src/CompilerError.ts) |
| `as const` per 1k lines | 1.34 | 1.32 | Matt `STATUSES`, `OVERLAY_KINDS` |
| Plural type name | 4.3% | 2.1% | records of many, never unions: Matt `PitchFields`, `CliServices` ([pitch.ts](https://github.com/mattpocock/course-video-manager/blob/a20151178e/apps/local/app/cli/commands/pitch.ts)); poteto `RunDependencies`, `PullRequestFacts` ([types.ts](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/watch-pr/types.ts)) |
| Type suffix `Props` / `Options` / `Params` / `Opts` | 96 / 62 / 19 / 7 | 8 / 16 / 10 / 0 | Matt `RunnerOpts` ([evalite types.ts](https://github.com/mattpocock/evalite/blob/e18a793789/packages/evalite/src/types.ts)); poteto `UnitAddOptions` ([orch.ts](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/orch/orch.ts)) |
| Generic params at declaration: single letter / `TFoo` / bare `T` | 11 / 7 / 1 (n=24) | 3 / 0 / 1 (n=5) | Matt `TInput`, `TOutput` ([create-scorer.ts](https://github.com/mattpocock/evalite/blob/e18a793789/packages/evalite/src/create-scorer.ts)), Effect-style `A, E, R` |
| Discriminant key (unique key:value pairs) | `type` 73%, `kind` 8%, `tag`/`_tag` 10% (n=698) | `kind` 78%, `state` 13%, `type` 3% (n=78) | poteto `readonly kind: "open"` ([store.ts#L61](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/orch/store.ts#L61)) |
| Discriminant value casing: lower one-word / kebab / camel / SCREAMING | 28 / 43 / 16 / 3% | 38 / 32 / 0 / 25% | Matt `type: "rename-beat"`; SCREAMING only for reducer actions `START_UPLOAD` ([upload-context.tsx](https://github.com/mattpocock/course-video-manager/blob/a20151178e/apps/local/app/features/upload-manager/upload-context.tsx)); poteto own values `failing-checks`, SCREAMING only mirroring GitHub API `MERGED`, `OPEN` |
| Union literal casing: lower / kebab / camel / SCREAMING | 58 / 19 / 11 / 2% (n=363) | 24 / 25 / 0 / 38% (n=55) | poteto `live-ui-verified`, `type-check-only` ([store.ts](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/orch/store.ts)) |
| Boolean `is`/`has`/`can`/`should` prefix (props + vars) | 39% (160/410) | 11% (2/19) | Matt `isPending`, `hasScript` ([copy-video-modal.tsx](https://github.com/mattpocock/course-video-manager/blob/a20151178e/apps/local/app/components/copy-video-modal.tsx)); poteto `isDraft` |
| Boolean unprefixed adjective or flag | 56% | 84% | Matt `open`, `enabled`, `archived`; poteto `json`, `force`, `peek` ([orch.ts#L38](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/orch/orch.ts#L38)) |
| Negative boolean (`not`/`no`/`disable`/`skip`) | 1.5% | 0% | Matt `disableExitAnimation`, `skipWhileStreaming` |
| camelCase function starts with a verb | 70% (1,114/1,582) | 55% (109/198) | poteto noun phrases for pure derivations: `branchSha` ([store.ts#L1134](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/orch/store.ts#L1134)), `errorMessage` ([store.ts#L250](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/orch/store.ts#L250)), `gateReason` ([policy.ts#L156](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/watch-pr/policy.ts#L156)) |
| Prefix share: `get` / `create` / `make`+`build` / `parse` / `to` / `as` | 5.8 / 4.8 / 6.1 / 2.4 / 1.2 / 0.3% | 0 / 1.0 / 1.5 / 7.6 / 0.5 / 0% | Matt `getFileType`, `toSlimVideo`, `asString` ([common.ts](https://github.com/mattpocock/sandcastle/blob/e99f832f26/.sandcastle/agent-workflows/shared/common.ts)); poteto `parsePullRequest`, `parseVerdict` ([store.ts](https://github.com/cursor/plugins/blob/5bf2b1544d/pstack/skills/poteto-mode/scripts/orch/store.ts)) |
| Abbreviated share of token pairs: `opts`:`options`, `ctx`:`context`, `msg`:`message`, `err`+`e`:`error` | 68, 51, 12, 52% | 4, 0, 0, 3% | Matt `opts` 1,850 uses vs `options` 862; poteto `options` 151 vs `opts` 6 |
| SCREAMING_CASE `const` | 8.9% | 5.9% | Matt `MAX_ITERATIONS`; poteto `DISPLAY_LIMIT` |
| Mean name length: function / top-level var / local var | 14.5 / 15.7 / 11.0 | 12.0 / 11.9 / 7.8 | locals ~30% shorter for both |
| File name: kebab / one word / PascalCase / camelCase | 66 / 26 / 4 / 2% | 17 / 76 / 5 / 2% (n=42) | Matt `beat-description-editor.tsx`; poteto `orch.ts`, `policy.ts`, `render.ts` |
| Files per repo, Matt | course-video-manager kebab 75%; evalite one-word 61%; sandcastle PascalCase 35%, camelCase 23%, kebab 14% | n/a | sandcastle `WorktreeManager.ts`, `resolveCwd.ts` ([src/](https://github.com/mattpocock/sandcastle/tree/e99f832f26/src)); poteto follows React's `ValidateNoVoidUseMemo.ts` ([c60eebf](https://github.com/facebook/react/blob/c60eebffea/compiler/packages/babel-plugin-react-compiler/src/Validation/ValidateNoVoidUseMemo.ts)) |
| Directory name lowercase | 97% | 90% | poteto exceptions are React's `Validation/`, `Utils/` |

### Agreement and difference

- Agree: no `I`/`T` type prefixes, no fresh `enum`, same `as const` rate, singular union types, lowercase files and directories, local names shorter than module names, `parse` at input boundaries.
- Differ: discriminant key (`type` for Matt, `kind` for poteto). Abbreviation (Matt writes `opts`, `ctx`, `e`; poteto spells words out). `get` (Matt 91 functions, poteto 0). File names (Matt kebab, poteto one word). Both follow the host repo when it has a convention (sandcastle PascalCase, React compiler PascalCase).

### Against the DRAFT and their written advice

| DRAFT line | Code says |
| --- | --- |
| 2 No `I`/`T` prefixes | Confirmed: 0 of 1,307 types |
| 3 Full words, length by scope | Length by scope confirmed (both). Full words: poteto confirms, Matt contradicts (`opts` 68%, `ctx` 51%) |
| 5 Booleans as `is`/`has`/`can` | Contradicted: most booleans are bare adjectives or flags (Matt 56%, poteto 84%). Prefixes appear on derived state (`isPending`, `hasScript`). `never notX` confirmed (1.5%, 0%) |
| 6 `kind` discriminant | poteto confirms (78%); Matt uses `type` (73%). Code supports one key per codebase, not `kind` everywhere |
| 7 Verb for actions, noun for pure accessors; `get` only gets | poteto confirms (noun phrases, zero `get`). Matt uses `get` for computations (`getFileType`, `getRuleOfThirdsLines`) |
| 8 `asX` / `toX` / `parseX` | `parseX` confirmed (poteto's top prefix, 7.6%). `toX` builds new values in Matt (`toSlimVideo`). `asX` rare, and Matt's `asString` coerces rather than views |
| 9 Singular types, plural collections | Confirmed for unions. Plural types exist (2-4%) and all name records of many fields (`PitchFields`, `RunDependencies`) |
| 10 Union or `as const` over `enum` | Confirmed; matches [Matt's enums article](https://www.totaltypescript.com/why-i-dont-like-typescript-enums) |
| 11 Files lowercase kebab-case | Lowercase confirmed (92%, 93%). Kebab only for Matt; poteto prefers one word. Host repo convention wins in both |

- Matt's [How to Name your Types](https://www.totaltypescript.com/tips/how-to-name-your-types) says `T` prefix on type params. His code uses single letters more often (11 vs 7), mostly Effect's `A, E, R`.
- poteto's written rule "one discriminant, `kind`" holds in his own code (61 of 78 pairs).

### Interpolated rules

1. Types: no `I`/`T` prefix, no `enum`; plural only for a record of many (`PitchFields`), never a union.
2. Spell out `options`, `context`, `error`, `message`; short names only in local scope.
3. Stored boolean state may be a bare adjective (`open`, `archived`, `force`); derived checks and guards take `is`/`has`.
4. One discriminant key per codebase, `kind` by default; own values lowercase kebab-case, external API values verbatim.
5. Actions start with a verb; untrusted input goes through `parseX`; pure derivations may be noun phrases (`branchSha`).
6. Files and directories lowercase, kebab-case or one word; an established repo convention wins.

## DRAFT candidate rule (not final)

Traceability tag after each line points at the finding sections above.

```md
# Naming

1. Domain words come from `CONTEXT.md`; one word per concept, no synonyms. New word → domain-modeling; 2+ candidates → term-check. [General: Ottinger 4, AIP-190, Matt README; overlap all.md 201]
2. Name by role, not type. No type encodings: no `I`/`T` type prefixes, no Hungarian, no `_private`. [General: Swift, Google TS; Casing: Matt]
3. Full words. Length scales with scope; single letters only in ≤10-line scopes. Abbreviate only if a web search resolves it. [Variables: Google TS, Go, Swift, Hofmeister, Lawrie]
4. Drop words the call site already says: `user.name`, not `user.userName`. [Variables: Swift, Go repetition; Ottinger 13]
5. Booleans read as affirmative assertions: `isEmpty`, `hasError`, `canRetry`; never `notX`. `is/has/can` names return boolean. [Booleans: Swift, .NET, McConnell, Arnaoudova A2/D2]
6. Two booleans that must stay in sync → one union with a `kind` discriminant. [Booleans/Enums: poteto]
7. Functions: verb phrase for actions, noun for pure accessors. `get`/`set` only get/set; opposites in pairs (`add`/`remove`, `open`/`close`). [Functions: .NET, Ottinger 6, Rust C-GETTER, Arnaoudova A1/A3/C1, McConnell]
8. Conversions say cost: `asX` view, `toX` new value, `parseX` untrusted input → named domain type. [Functions: Rust C-CONV, poteto boundary]
9. Plural only for collections (`users`). Types and enum-like types singular, even unions: `Status`, not `Statuses`; no `List`/`Array` suffix. [Enums: Matt, .NET, Google JS, Arnaoudova A4/D1]
10. TypeScript: string-literal union or `as const` object over `enum`. [Enums: Matt]
11. Casing and acronyms follow the language guide and the project linter; do not hand-enforce. Files: lowercase kebab-case, verb-noun for scripts (`render-pr-body.mjs`). [Casing: Google TS, PEP 8, Rust; Files: unicorn, Google JS, repo evidence; Overlap: Biome]
12. Meaning shifted → rename now, everywhere, same change. [General: PragProg Tip 74, Fowler; overlap all.md 204]
```

Open questions for the rule author:

- Line 1 and 12 partly repeat [all.md](../../bundles/workflow/skills/writing-rules/rules/all.md) 201/204; keep as a link or accept the repeat for code identifiers.
- Line 11: the rule ships to consumers; casing is enforced only where a consumer enables a naming lint (Biome `useNamingConvention` / `useFilenamingConvention`, unicorn `filename-case`). Decide whether setup-repo should turn one on.
- Enum value casing left open on purpose; sources split three ways.
