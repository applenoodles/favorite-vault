# Favorite Vault Notion Sync

Favorite Vault can use a Notion database as the cloud store.

This keeps the workflow simple:

```txt
PWA / Chrome extension
→ Favorite Vault
→ Notion database
→ phone and desktop can both see/edit the same records
```

No API key is stored in the frontend. The Notion token lives in Cloudflare Pages environment variables.

## 1. Create a Notion integration

1. Go to Notion developer integrations
2. Create an internal integration
3. Copy the integration token
4. Give it access to the workspace/page where your database lives

## 2. Create a Notion database

Create a database with these properties exactly:

| Property | Type |
| --- | --- |
| Name | Title |
| URL | URL |
| Summary | Text |
| Category | Select |
| Tags | Multi-select |
| Platform | Select |
| Status | Select |
| Item ID | Text |
| Description | Text |
| Note | Text |
| Author | Text |
| Site | Text |
| Created | Date |

The names matter because Notion’s API schema is not a mind reader, despite everyone’s best efforts to make software worse.

## 3. Share the database with the integration

Open the database in Notion:

```txt
••• menu
→ Connections
→ Add connection
→ select your integration
```

If you skip this, the API returns `object_not_found`, because Notion prefers pretending the database does not exist over saying “permission denied” like a normal adult.

## 4. Add Cloudflare Pages environment variables

In Cloudflare Pages project settings:

```txt
Settings
→ Environment variables
```

Add:

```txt
NOTION_TOKEN=<your integration token>
NOTION_DATABASE_ID=<your Notion database id>
```

Then redeploy.

## 5. Use it

In the app:

```txt
從 Notion 載入
上傳本機到 Notion
```

Saving a new item also attempts to save it to Notion.

## Current behavior

- localStorage remains the offline cache
- Notion is the cross-device cloud store
- JSON export/import remains available as backup
- LLM batch export/import still works
- Cloudflare D1 is no longer needed for the normal workflow

## Common errors

```txt
missing_notion_config
```

Cloudflare env vars are missing.

```txt
object_not_found
```

Database ID is wrong, or the database was not shared with the integration.

```txt
validation_error
```

A required property name/type does not match the schema above.
