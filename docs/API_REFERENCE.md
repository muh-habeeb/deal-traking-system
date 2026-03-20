# API Reference

This document describes all available API routes, methods, required data, and demo requests.

## Base URL

- Local: `http://localhost:4000/api`

## Authentication

- Login route returns a bearer token.
- Include this header for authenticated routes:

```http
Authorization: Bearer <token>
```

- Token validity: approximately 12 hours.

## Response Format

- Success responses are JSON, except `DELETE /filters/:id` which returns `204 No Content`.
- Errors use:

```json
{
  "message": "Error details"
}
```

## Route Summary

| Method | Path | Auth Required | Purpose |
|---|---|---|---|
| GET | `/health` | No | Health check |
| POST | `/auth/login` | No | Login and get token |
| GET | `/auth/me` | Yes (Bearer token) | Validate token and return user info |
| GET | `/filters` | Yes | List filters |
| GET | `/filters/:id` | Yes | Get one filter |
| POST | `/filters` | Yes | Create filter |
| PUT | `/filters/:id` | Yes | Update filter |
| DELETE | `/filters/:id` | Yes | Delete filter |
| GET | `/listings` | Yes | List recent listings |
| POST | `/notifications/test` | Yes | Send test email |
| GET | `/settings/email` | Yes | Get receiver email |
| PUT | `/settings/email` | Yes | Update receiver email |
| GET | `/facebook-session/status` | Yes | Read Facebook session status |
| POST | `/facebook-session/start` | Yes | Start interactive Facebook login flow |
| POST | `/facebook-session/save` | Yes | Save active Facebook session state |
| POST | `/facebook-session/import` | Yes | Import Playwright storage state JSON |
| POST | `/facebook-session/logout` | Yes | Clear saved Facebook session |

## Demo Quick Flow

1. Login and copy token:

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

2. Create a filter:

```bash
curl -X POST http://localhost:4000/api/filters \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"keyword\":\"honda civic\",\"location\":\"Toronto, ON\",\"minPrice\":3000,\"maxPrice\":12000}"
```

3. Fetch recent listings:

```bash
curl "http://localhost:4000/api/listings?limit=20" \
  -H "Authorization: Bearer <token>"
```

## Endpoint Details

### `GET /health`

- Auth: No
- Body: None

Success example:

```json
{
  "status": "ok"
}
```

### `POST /auth/login`

- Auth: No
- Body:

```json
{
  "username": "admin",
  "password": "admin123"
}
```

Success example:

```json
{
  "token": "<token>"
}
```

Common errors:

- `401` invalid username/password

### `GET /auth/me`

- Auth: Yes (`Authorization: Bearer <token>`)
- Body: None

Success example:

```json
{
  "username": "admin",
  "exp": 1774048434123
}
```

Common errors:

- `401` unauthorized/invalid token

### `POST /filters`

- Auth: Yes
- Body:

```json
{
  "keyword": "toyota corolla",
  "location": "Vancouver, BC",
  "minPrice": 2000,
  "maxPrice": 9000,
  "userId": "optional-user-id"
}
```

Required fields:

- `keyword` (string)
- `location` (string)

Optional fields:

- `minPrice` (number or null)
- `maxPrice` (number or null)
- `userId` (string or null)

Validation notes:

- `minPrice` and `maxPrice` must be numeric if provided
- `minPrice` must not be greater than `maxPrice`

Success: `201 Created` with created filter object.

### `GET /filters`

- Auth: Yes
- Body: None

Success: list of filters, newest first.

### `GET /filters/:id`

- Auth: Yes
- Body: None

Success: filter object.

Common errors:

- `404` filter not found

### `PUT /filters/:id`

- Auth: Yes
- Body: same shape as `POST /filters` without `userId`

```json
{
  "keyword": "ford escape",
  "location": "Calgary, AB",
  "minPrice": 4000,
  "maxPrice": 15000
}
```

Success: updated filter object.

Common errors:

- `400` invalid input
- `404` filter not found

### `DELETE /filters/:id`

- Auth: Yes
- Body: None

Success: `204 No Content`

Common errors:

- `404` filter not found

### `GET /listings`

- Auth: Yes
- Query params:
- `limit` (optional number, default `50`)

Demo:

```bash
curl "http://localhost:4000/api/listings?limit=10" \
  -H "Authorization: Bearer <token>"
```

Success: array of listing objects (`title`, `price`, `location`, `postedAt`, `url`, `image`, etc.).

### `POST /notifications/test`

- Auth: Yes
- Body: None

Success example:

```json
{
  "message": "Test email sent",
  "result": {
    "accepted": ["receiver@example.com"],
    "rejected": [],
    "messageId": "<smtp-message-id>"
  }
}
```

### `GET /settings/email`

- Auth: Yes
- Body: None

Success example:

```json
{
  "receiverEmail": "alerts@example.com"
}
```

### `PUT /settings/email`

- Auth: Yes
- Body:

```json
{
  "receiverEmail": "alerts@example.com"
}
```

Validation:

- Must be a valid email format

Common errors:

- `400` invalid `receiverEmail`

### `GET /facebook-session/status`

- Auth: Yes
- Body: None

Success example:

```json
{
  "exists": true,
  "storageStatePath": "C:/.../playwright/storageState.json",
  "updatedAt": "2026-03-21T10:20:30.000Z",
  "size": 12345,
  "cookieCount": 28,
  "loginInProgress": false,
  "startedAt": null,
  "autoSaveEnabled": true,
  "lastAutoSavedAt": null,
  "loginViewerUrl": "http://localhost:6080/vnc_lite.html"
}
```

### `POST /facebook-session/start`

- Auth: Yes
- Body: None

Starts interactive Facebook login flow. Response includes status fields plus:

```json
{
  "message": "Facebook login started. Open Login Screen and sign in. Session will auto-save."
}
```

### `POST /facebook-session/save`

- Auth: Yes
- Body: None

Manually saves active Facebook login session.

Common errors:

- `400` if no active login flow

### `POST /facebook-session/import`

- Auth: Yes
- Body accepts any one of:

1. JSON string format:

```json
{
  "storageStateJson": "{\"cookies\":[...],\"origins\":[...]}"
}
```

2. Wrapped object format:

```json
{
  "storageState": {
    "cookies": [],
    "origins": []
  }
}
```

3. Direct storage state object:

```json
{
  "cookies": [],
  "origins": []
}
```

Common errors:

- `400` invalid JSON format
- `400` missing/invalid storage state
- `400` no cookies found

### `POST /facebook-session/logout`

- Auth: Yes
- Body: None

Clears stored Facebook session file and closes active login flow if running.
