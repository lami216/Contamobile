# Backup navigation cleanup

## Owner-approved device lifecycle update, 2026-11-05

- Save now performs a single cloud backup independently of the automatic schedule.
  The first manual upload asks for upload consent without offering scheduling
  fields. Subsequent explicit Save now actions reuse that permission for the same
  local business. Turning automatic backup off does not enable a schedule through
  a manual action.
- A replacement phone can enroll before local owner creation. Contatools verifies
  the customer, links the new installation and authorizes a particular cloud
  version. The phone verifies the signed approval and offers an explicit preview
  before atomic local restoration. Empty phones do not require a local file.
- Direct activation and renewal use the same existing customer record and an
  append-only issuance history. An existing valid offline license survives an
  unavailable service or incomplete online action.
- Reuse existing settings, approval sheets, inputs, typography and colors in both
  Arabic/RTL and French/LTR. Preserve data and activation during signed upgrades.

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
