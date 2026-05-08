# Puppet — Local Documentation

## Lookup — `puppet describe`

Built into the Puppet agent. Documents built-in resource types and their
parameters. No install beyond Puppet itself.

```bash
puppet describe <type>             # full resource type documentation
puppet describe file               # example: file resource
puppet describe package            # example: package resource
puppet describe service            # example: service resource
puppet describe exec               # example: exec resource
```

---

## Search — `puppet describe --list`

List all available resource types, then grep for a term:

```bash
puppet describe --list             # list all built-in resource types
puppet describe --list | grep -i <term>   # search type names
```

For searching parameter names or descriptions within types:

```bash
puppet describe <type> | grep -i <term>
```

---

## qi fallback

`puppet describe` only covers core built-in types. For module-provided types,
custom functions, Hiera documentation, or language reference material, use qi
with the Dash `puppet` collection (indexed via the main skill workflow):

```bash
qi search "hiera lookup merge strategy" -c puppet -n 5
qi search "custom fact" -c puppet -n 5
```

---

## Workflow

1. Looking up a core resource type → `puppet describe <type>`
2. Searching for a resource type by name → `puppet describe --list | grep -i <term>`
3. Searching parameter docs → `puppet describe <type> | grep -i <term>`
4. Module types, functions, language reference → `qi search "<term>" -c puppet`
5. Collection not indexed → follow Dash workflow in main skill
