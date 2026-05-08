# Puppet Reference

## Workflow

Run these steps in order. All must pass cleanly before declaring a task done.
If a step fails, fix it and re-run before moving on.

- [ ] Step 1 — Validate (lint + syntax): `pdk validate --parallel`
- [ ] Step 2 — Test: `pdk test unit`

---

## Creating files with `pdk new`

Always use `pdk new` to scaffold Puppet objects — never create manifests, spec
files, or task files by hand. PDK generates the source file and its matching
spec file together, keeping them in sync with the module structure.

| What to create | Command |
|---|---|
| New module (run outside any module) | `pdk new module <module_name>` |
| Class | `pdk new class <class_name>` |
| Defined type | `pdk new defined_type <name>` |
| Task | `pdk new task <name>` |
| Provider | `pdk new provider <name>` |
| Function (Puppet language) | `pdk new function <name>` |
| Transport | `pdk new transport <name>` |
| Spec test for an existing object | `pdk new test <object_name>` |

For a class or defined type inside a module namespace, use the double-colon
form: `pdk new class mymodule::config`. PDK will place the manifest at
`manifests/config.pp` and the spec at `spec/classes/config_spec.rb`.

`pdk new module` runs an interactive metadata interview by default. Use
`--skip-interview` to accept defaults, or `--full-interview` for the extended
set of questions.

---

## Validation — `pdk validate`

```bash
pdk validate                        # all validations
pdk validate --parallel             # faster, runs checks concurrently
pdk validate puppet                 # Puppet syntax and style only
pdk validate ruby                   # Ruby (spec) syntax and style only
pdk validate metadata               # metadata.json only
pdk validate --auto-correct         # fix auto-correctable style issues
pdk validate --puppet-version=8     # validate against a specific Puppet version
```

`pdk validate` runs puppet-lint, Puppet syntax checking, and Ruby/RuboCop in
one pass. Fix all reported issues at the source — do not suppress puppet-lint
warnings with `# lint:ignore` unless it is a confirmed false positive, and if
you do, add a comment explaining why.

---

## Testing — `pdk test unit`

```bash
pdk test unit                              # full unit test suite
pdk test unit --tests=<test_list>          # comma-separated list of specific tests
pdk test unit --format=documentation      # verbose per-test output (RSpec doc format)
pdk test unit --puppet-version=8          # run against a specific Puppet version
```

Tests live under `spec/`. The layout mirrors the module structure:

| Object type | Source | Spec location |
|---|---|---|
| Class | `manifests/<name>.pp` | `spec/classes/<name>_spec.rb` |
| Defined type | `manifests/<name>.pp` | `spec/defines/<name>_spec.rb` |
| Function | `functions/<name>.pp` | `spec/functions/<name>_spec.rb` |
| Task | `tasks/<name>.<ext>` | `spec/tasks/<name>_spec.rb` |
| Provider | `lib/puppet/provider/…` | `spec/unit/puppet/provider/…` |

Shared configuration goes in `spec/spec_helper.rb`. External module
dependencies used in tests are declared in `.fixtures.yml`.

### Writing rspec-puppet tests

Every class and defined type spec must cover at minimum:

- That the catalog compiles without errors (`is_expected.to compile`)
- That key resources are present with the correct attributes
- Behaviour under relevant parameter combinations

```ruby
require 'spec_helper'

describe 'mymodule::config' do
  on_supported_os.each do |os, os_facts|
    context "on #{os}" do
      let(:facts) { os_facts }

      it { is_expected.to compile.with_all_deps }

      it { is_expected.to contain_file('/etc/mymodule/config.conf')
        .with_owner('root')
        .with_mode('0644') }
    end
  end
end
```

Use `on_supported_os` (provided by `rspec-puppet-facts`) to run every test
against all OS/architecture combinations declared in `metadata.json`.

---

## Module structure

```
mymodule/
├── manifests/          # Puppet classes and defined types (.pp)
├── tasks/              # Bolt tasks
├── functions/          # Puppet language functions
├── lib/                # Ruby plugins (providers, facts, functions)
├── templates/          # EPP / ERB templates
├── files/              # Static files served to agents
├── hiera/              # Module-level Hiera data
├── spec/
│   ├── spec_helper.rb
│   ├── classes/        # Class specs
│   ├── defines/        # Defined type specs
│   └── fixtures/       # Fixture modules (via .fixtures.yml)
├── .fixtures.yml       # External module dependencies for tests
├── metadata.json       # Module metadata
└── REFERENCE.md        # Auto-generated; do not edit by hand
```

---

## Gotchas

- Always use `pdk new <type>` — manually created files won't have matching spec stubs and may not follow the expected naming conventions.
- `pdk validate` without `--parallel` can be slow on large modules — use `--parallel` by default.
- `on_supported_os` requires `metadata.json` to list `operatingsystem_support` — keep it accurate or tests will silently run against fewer platforms.
- `.fixtures.yml` must declare all external module dependencies; missing fixtures cause catalog compilation failures in tests that are hard to diagnose.
- `REFERENCE.md` is generated by Puppet Strings (`puppet strings generate --format markdown`) — do not edit it by hand.
- `pdk test unit --tests=` accepts RSpec example descriptions, not file paths — use `--format=documentation` to see the exact strings to pass.
