# IPC contract

The only interface between `src-tauri/` (rust-dev) and the frontend (frontend-dev).
**Only the `lead` edits this file.** Workers report contract problems instead of working around them.

## Conventions

- Command names are `snake_case`. JS calls them via `invoke('<name>', { camelCaseArgs })`, and Rust receives `snake_case` params.
- Every command returns `Result<T, AppError>`. On error, the JS promise rejects with the serialized `AppError`.
- Types are given on the TS side. Rust types must serialize to the same JSON shape.

## Error type

```ts
// AppError: filled in by the lead
```

## Commands

| Command | Args (JS) | Returns | Errors | Replaces (Electron channel) |
| ------- | --------- | ------- | ------ | --------------------------- |

## Events

| Event | Payload | Emitted when |
| ----- | ------- | ------------ |

## Changelog

<!-- Date - change - affected tasks. -->
