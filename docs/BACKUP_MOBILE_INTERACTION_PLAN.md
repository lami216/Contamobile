# Backup navigation cleanup

The Android runtime remains the reference. Reuse its existing list rows, sheets,
buttons, spacing and colors; no stylesheet or financial schema changes.

- The backup page offers three clear tasks: save a file, restore a file, or open
  server backups. Saving a file remains one tap and works offline.
- Restore accepts the existing mobile/desktop JSON formats through one picker,
  retains desktop-import permission checks, and always previews before replacing.
  The dated previous safety copy appears here only when it exists.
- Import and merge stays a separate advanced task. Resume appears inside its
  entry only when a durable import preview exists; users and activation survive.
- Server backups use a focused overview for status, save now, available copies
  and scheduling. Refresh remotely once on entry/reconnection with throttling;
  periodic visible updates remain local and never rebuild an edited form.
- Show time only for timed schedules and weekday only for weekly schedules.
  Hiding a field never discards its saved or unsaved value. Stored copies remain
  accessible without upload consent and during the server's download grace.
- The exit reminder explicitly concerns an external backup file, independently
  of server copies. Test Arabic RTL and French LTR at 360/393px, missing/available
  safety/import state, permission denial, offline use and grace-period download.
