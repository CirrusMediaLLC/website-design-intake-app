# Cirrus Website Design System

Desktop-focused intake app for creating a site design system for Elementor builds.

## Project Structure

- `outputs/index.html` - Netlify entry file for the web app.
- `outputs/evergreen-elementor-design-system-form.html` - working copy of the app.
- `outputs/netlify/functions/` - Netlify serverless functions for Asana, Elementor, and Google Fonts.
- `outputs/elementor-connector/` - starter WordPress/Elementor connector plugin.
- `outputs/EXPORT-INTEGRATIONS.md` - integration notes for Asana and Elementor exports.

## Local Preview

Run a static server from `outputs/`:

```bash
npx serve outputs
```

Or use Netlify dev if the CLI is available:

```bash
npx netlify-cli dev --dir outputs
```

## Notes

The deployed site is connected separately through Netlify. Do not commit `.netlify/` local state.
