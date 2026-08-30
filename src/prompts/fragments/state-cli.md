Resolve `sddkit-state` before the first checkpoint, then use that path for every `init` / `patch` / `show` / `validate`:

1. `<repo>/.agents/bin/sddkit-state` if it exists and is executable
2. `$HOME/.agents/bin/sddkit-state` if it exists and is executable

Never edit `state.yaml` or `journal.ndjson` directly.
