# Favorite Vault Cloud Sync

Favorite Vault cloud sync uses Cloudflare D1 through Pages Functions.

## Data model

Items are stored as JSON in D1 and separated by a private `vaultKey`.

The app sends the key as:

```txt
X-Vault-Key: your-private-key
```

The backend hashes it with SHA-256 and stores only the hash as `vault_id`. This is not a full login system. It is a private-key MVP for one-person sync, because starting with OAuth would be a monument to human overengineering.

## API

```txt
GET /api/items
POST /api/items
DELETE /api/items?id=<item_id>
```

All requests require `X-Vault-Key`.

## Create the D1 database

In Cloudflare Dashboard:

1. Workers & Pages
2. D1 SQL Database
3. Create database
4. Name it `favorite-vault`
5. Open the database console
6. Run the SQL in `migrations/0001_favorite_items.sql`

## Bind D1 to Cloudflare Pages

In Cloudflare Pages:

1. Open the `favorite-vault` Pages project
2. Settings
3. Functions
4. D1 database bindings
5. Add binding:

```txt
Variable name: FAVORITE_DB
D1 database: favorite-vault
```

6. Redeploy the latest deployment

If this binding is missing, `/api/items` returns:

```json
{
  "ok": false,
  "error": "missing_d1_binding"
}
```

## Use it in the app

1. Open `https://lting.dpdns.org`
2. In **Cloud sync**, enter a private vault key of at least 8 characters
3. Click **儲存 key / 同步**
4. Use the same key on phone and desktop

## Current behavior

- LocalStorage remains the offline cache
- D1 is used for cross-device sync
- Saving a new item writes to localStorage first, then attempts D1
- Deleting removes local item first, then attempts D1 deletion
- Export / import still works as backup

## Next step

The next proper upgrade is a real auth layer or a shareable invite key, but this MVP gets desktop extension → PWA → phone sync working without building a login cathedral nobody asked for.
