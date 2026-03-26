# Chat Widget Integration Guide

Your app opens the support chat by loading a URL in a WebView. The URL contains a short-lived signed token so only authenticated users of your app can access the chat.

---

## How it works

1. Your backend generates a signed JWT containing the user's email.
2. You open the WebView pointing to `https://<support-domain>/chat?token=<JWT>`.
3. The support backend verifies the token, sets a secure session cookie, and strips the token from the URL.
4. For the next 8 hours the cookie keeps the user authenticated automatically.

---

## Generating the token (your backend)

Node.js (`jsonwebtoken`):
```js
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  { sub: user.email }, // sub = unique user identifier (email)
  process.env.CHAT_TOKEN_SECRET,
  { expiresIn: '8h', algorithm: 'HS256' }
);

const chatUrl = `https://<support-domain>/chat?token=${token}`;
// open chatUrl in a WebView
```

Python (PyJWT):
```python
import jwt, datetime

token = jwt.encode(
    { "sub": user.email, "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=8) },
    CHAT_TOKEN_SECRET,
    algorithm="HS256",
)
chat_url = f"https://<support-domain>/chat?token={token}"
```

---

## Shared secret

The `CHAT_TOKEN_SECRET` will be shared with you separately. Store it as an environment variable on your backend — **never hardcode it, never expose it to the client or mobile app**.

---

## Token payload

| Field | Required | Description |
|-------|----------|-------------|
| `sub` | Yes | User's email address. This is how the chat is linked to the user. |
| `exp` | Yes | Expiry (8h from now). |

---

## Reconnection

Generate a **fresh token every time** the user opens the chat WebView:

```js
// Every time the user taps "Support" in your app
const token = jwt.sign({ sub: user.email }, CHAT_TOKEN_SECRET, { expiresIn: '8h' });
openWebView(`https://<support-domain>/chat?token=${token}`);
```

If the WebView stays open for more than 8 hours and the session expires, the user will see an error screen. They just need to close and reopen the chat to get a fresh token. In practice this won't happen.
