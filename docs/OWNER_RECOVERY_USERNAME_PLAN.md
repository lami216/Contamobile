# Owner recovery: username and password

## User task and existing boundary

An owner who has forgotten both login fields must recover the same local account after the existing Contatools password-reset approval. Before approval, the recovery picker continues to show the owner's display name only. The login username is local information and does not enter registration or any server request.

## Interaction

1. Keep the existing owner picker and approval request unchanged.
2. Resolve the active owner from the approved native result's exact owner and shop IDs. Only then show the current username in an editable, labelled text field above the two existing password fields.
3. Preserve the existing recovery panel, styles, close behavior, focus trap and Arabic/French direction. Use username keyboard semantics without capitalization or spelling correction.
4. Normalize the username by trimming and lowercasing, matching local login behavior. Reject empty or duplicate names with a specific error while retaining the form. Changing the display name, role or account identity is outside this task.
5. Save username and password together under the already-approved recovery operation. Do not indicate success until the local durable write and recovery completion succeed.
6. After completion, show the login username so the owner can enter it on the existing login screen. A password-only recovery already pending from an older version remains resumable without renaming the account.

## Integrity and verification

The local/native journal retains the chosen username for interrupted recovery; no new server or tool protocol is required. Atomic storage validation owns uniqueness and rollback, including races after UI validation. Invalid/mismatched owner scope must never disclose a username. Test waiting/rejected/expired states, approved second-owner selection, blank/duplicate names, password mismatch, failed writes and retry, durable interruption, old password-only recovery, unchanged business data/account identity/activation, and Arabic/French narrow screens. Keep existing CSS files unchanged and retain screenshots as release evidence.

## Concurrent local writes

Credential recovery preserves the newest persisted financial row without adopting its revision into an older in-memory app state. The app revokes the recovered owner immediately, holds an independent refresh lock, and reloads the full current shop and public users before allowing another action. If an ordinary action is already running, that refresh waits for its finally block without blocking recovery completion; an uncommitted stale write must fail its original revision check. Read failures keep the lock and expose recovery retry rather than unlocking stale data. Server acknowledgement never clears an ordinary save lock.
