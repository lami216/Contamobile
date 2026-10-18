# Complete runtime UI audit

Reviewed the approved runtime and its standalone preview. The application layout and accounting rules are preserved.

## Boundary system

- Primary seller actions (sale, purchase, receipt/payment, expense) share a warm gold outline.
- Registers, document item tables, cart tables and data lists have a 2px muted gold exterior and 2px neutral interior dividers. Header, body and column separators now share the same 2px thickness.
- Navigation, text inside table cells, the document history link and composite search inputs do not gain independent gold boxes.
- Selected picker options receive a restrained gold edge; inactive choices use neutral edges.
- Destructive controls keep their semantic red treatment; text and amounts do not become gold.

## Corrections

- Removed the global border override and resolved legacy selector precedence on list frames.
- Removed the duplicate cart heading and duplicate nested cart frame; line count now sits with the cart title.
- Search fields have one focus treatment on the outer control.
- Document line numbering is inline with the product name.
- Source location highlights the complete row and clears after opening the record or leaving its workspace.
- Period, warehouse, account-section and report pickers use compact rows instead of stretching a few options into tall tiles.
- Million-scale table amounts remain complete within narrow cells.
- Standalone exports create local Blob download links without depending on a localhost export endpoint.
- Backup import uses an application-styled file chooser with a visible selected filename; malformed backups are rejected without changing stored financial data.
- Barcode entry uses a single focus treatment on its combined input/camera control.

## Evidence

- 79 view/dialog configurations captured in both appearances: 158 captures with no runtime errors, empty dialog headings or horizontal overflow. All applicable exterior table frames were measured at 2px with the shared frame color.
- 24 additional 360px cases cover Arabic and French across the main workspaces.
- Five 360px cases exercise 100,000,000 amounts and long product names without table amount overflow.
- Eight picker cases verify 48px options in both appearances.
- Isolated standalone workflow: create a product and customer; sale and purchase with quantity/price edits; customer receipt and payment; deposit, withdrawal and expense; reload persistence; generate XLSX and PDF bytes; generate backup; invoke print layout. Expected account, stock and party balances matched after reload.
- Existing website, product editor, export, report-source and source-navigation regression checks pass.

The headless browser canceled physical file saves in this environment. Exported PDF/XLSX signatures and data bytes were verified from the application-generated Blob URLs and saved by the test runner instead. Camera hardware, mobile keyboard behavior and physical printing are not asserted by this desktop audit. Live user storage was not changed.
