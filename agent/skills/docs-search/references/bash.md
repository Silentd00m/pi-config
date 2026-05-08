# Bash / Shell — Local Documentation

## Lookup

### External commands — `man`

```bash
man <command>             # full manual page
man curl                  # example
man 2 open                # section 2 = system calls
man 3 printf              # section 3 = C library functions
```

### Shell builtins — `help`

`man` does not cover bash builtins. Use `help` instead:

```bash
help <builtin>            # builtin documentation
help if                   # example
help for                  # example
help [[ ]]                # example: conditional expression
help                      # list all builtins
```

---

## Search — `apropos` / `man -k`

Both commands search man page names and one-line descriptions:

```bash
apropos <keyword>          # search man page summaries
man -k <keyword>           # identical to apropos
apropos "network socket"   # example: multi-word search
apropos -e <exact>         # exact word match only
```

This is genuine search across all installed man pages. Try it before reaching
for qi.

**Limitation**: searches names and one-line summaries only — not full man page
text. Update the man database first if results seem stale: `sudo mandb`.

### Full-text search within a man page

```bash
man <command> | grep -i <term>
```

---

## qi fallback

For full-text search across man page content, the Dash `bash` collection
(indexed via the main skill workflow) contains rendered man pages suitable for
BM25 search:

```bash
qi search "process substitution" -c bash -n 5
```

---

## Workflow

1. Know the command → `man <command>` or `help <builtin>`
2. Searching for a command → `apropos <keyword>`
3. Searching within a page → `man <command> | grep -i <term>`
4. Need full-text search → `qi search "<term>" -c bash`
5. Collection not indexed → follow Dash workflow in main skill
