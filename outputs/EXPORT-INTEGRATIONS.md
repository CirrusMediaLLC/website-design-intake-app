# Cirrus Intake Export Integrations

This app exports one canonical payload and maps it into Asana and Elementor-specific payloads.

## Netlify Environment Variables

Asana:

- `ASANA_ACCESS_TOKEN`

Elementor / WordPress connector:

- `ELEMENTOR_IMPORT_ENDPOINT`
- `ELEMENTOR_IMPORT_TOKEN`

Optional multi-site format:

```json
{
  "lukes-landscaping": {
    "endpoint": "https://example.com/wp-json/cirrus/v1/design-guide",
    "token": "shared-secret"
  }
}
```

Save that JSON as `ELEMENTOR_SITES_JSON`.

## Asana

Primary app flow sends to `/.netlify/functions/asana-attach`.

PDF attachment flow:

1. Click `Export to Asana`.
2. Click `Connect Asana` to load workspaces from the secure Netlify token.
3. Choose workspace, project, and task/card.
4. The browser generates a PDF from the current design guide.
5. The function uploads the PDF to the selected Asana task.
6. The function also uploads the Elementor JSON payload and adds a short task comment.

The attachment function expects:

- `target.taskGid`
- `target.projectGid`
- `pdf.filename`
- `pdf.base64`
- `json.filename`
- `json.payload`
- `comment`

Legacy notes/subtask flow is still available through `/.netlify/functions/asana-submit`.

Supported modes:

- `subtask`: creates a design-guide subtask under the selected parent task, or updates the existing matching subtask.
- `comment`: adds the design guide summary as a comment/story on the selected task.

The selected destination is stored in:

- `integrations.asana.parentTaskGid`
- `integrations.asana.projectGid`
- `integrations.asana.mode`

If `projectGid` is provided, the created/updated design-guide subtask is also added to that Asana project. The payload also supports optional Asana custom-field mappings through `integrations.asana.customFields`; values are sent as `custom_fields` when the matching Asana field GIDs are configured.

Asana can import:

- task/subtask name
- task notes
- project membership
- PDF attachments
- JSON attachments
- custom field values when field GIDs are configured
- the full guide payload as JSON inside the submitted payload

Asana cannot infer custom fields by visible field name alone. Dropdown/enum fields need the Asana custom field GID and, for enum fields, the correct option GID. Full per-user OAuth is not wired yet; the MVP uses `ASANA_ACCESS_TOKEN` in Netlify for secure server-side access.

## Elementor

The app sends to `/.netlify/functions/elementor-submit`.

Supported modes:

- `dryRun`: validates the payload mapping only.
- `storePreset`: stores the payload in WordPress for review.
- `applyGlobals`: updates Elementor Kit global colors and typography.

Install `elementor-connector/cirrus-elementor-connector.php` on the WordPress site and configure `CIRRUS_IMPORT_TOKEN` on that site.

Elementor can import safely through the current connector:

- Kit global colors
- Kit custom colors, including section background colors
- Kit global typography
- Kit custom typography

The payload is ready for, but the connector does not yet automatically apply:

- button variants
- light/dark button states
- spacing and radius tokens
- form copy and field schema
- CSS variables
- page/template/widget-level styling

Those require a second connector pass that maps the stored payload into Elementor templates/widgets or injects CSS variables into the active theme/template.

## Payloads

The canonical payload uses:

- `schema: cirrus.designGuide`
- `schemaVersion: 2026-06-01.1`

Elementor payload:

- `schema: cirrus.elementorExport`
- maps primary/secondary/text/accent colors into Elementor system colors
- keeps extra colors as custom colors
- exports section background colors separately and also includes them as Elementor custom colors tagged with `kind: sectionBackground`
- maps H1/body/heading/accent styles into Elementor typography roles
- keeps extra type styles as custom typography
- exports button variants for `lightSection` and `darkSection` so CTAs can be styled safely on white/light and black/dark backgrounds

Asana payload:

- `schema: cirrus.asanaExport`
- includes human-readable task notes
- includes full design guide JSON
- includes Elementor JSON
- includes CSS variables
- includes optional custom field values when mapped
- PDF attachment export uses the canonical design guide payload to generate the PDF and uploads Elementor JSON as a companion attachment

Both payloads include `importCapabilities` so downstream connectors can tell the difference between global tokens, widget/template instructions, and values that are advisory only.
