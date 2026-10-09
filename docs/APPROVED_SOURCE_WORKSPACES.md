# Approved source workspaces

Desktop reference read directly: lami216/offline-conta, main commit d44fad3e19517cf21e487862e346661244448e65, app/conta-app.tsx (openDocumentSource and Banks).

The desktop keeps manual deposits/withdrawals in banks > adjustment and account transfers in banks > transfers. Account selection belongs to the operation form. A payment account is not the manual deposit source workspace.

The approved mobile interaction differs intentionally from the desktop editor-loading shortcut: Source navigates to the operation workspace, finds its page and highlights its row. It never opens a detail/editor or changes balances, stock or drafts. A row click opens detail; Edit alone loads the editor.

Source map:
- Sale: point-of-sale invoice register.
- Purchase: purchase invoice register.
- Receipt/payment: unified Pay–Receive workspace and register (explicit user instruction, rather than the desktop party-specific editor).
- Expense: expense register.
- Deposit/withdrawal: accounts > deposits/withdrawals register.
- Account transfer: accounts > transfers register.
- Stock transfer/correction: corresponding warehouse workspace.

Manual deposits, withdrawals and account transfers have one creation workspace. Their creation buttons are removed from payment-account detail. Even a stale direct operation action redirects to that workspace. New manual cash forms require an explicit account choice; edits retain the historical account. No accounting or backup schema changes.

Tests cover all destinations, distant and cancelled rows, tab-scoped highlights, drafts, detail/Edit separation, centralized entry points and account validation. Android integration additionally posts a party payment and deposit, tests their exact source destinations, edits without saving, and verifies cold-restart persistence.
