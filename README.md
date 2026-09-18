# Simple Realtime Chat

A simple, beginner-friendly real-time chat website built with **Next.js**,
**React**, and **Supabase** (Realtime + Storage). Two people can register,
create a chat, share a secure link, and message each other instantly —
including photos and documents.

This project is intentionally kept small and easy to read. No complicated
state management, no unnecessary packages, no heavy abstractions — just
plain React components and straightforward API routes, with comments
explaining the important parts.

---

## 1. What's inside

```
simple-realtime-chat/
├── components/
│   └── MessageBubble.js       # Renders one chat message (text/image/file)
├── lib/
│   ├── supabaseClient.js      # Browser Supabase client (public anon key)
│   ├── supabaseAdmin.js       # Server-only Supabase client (secret service key)
│   ├── session.js             # Login sessions (signed cookie) for regular users
│   ├── adminSession.js        # Separate login session for /admin
│   ├── generateToken.js       # Creates secure random chat links
│   └── fileValidation.js      # Shared upload rules (file types, 5MB limit)
├── pages/
│   ├── index.js                # "/"          Login page
│   ├── register.js             # "/register"  Registration page
│   ├── chat/
│   │   ├── index.js            # "/chat"      Dashboard (create/list chats)
│   │   └── [token].js          # "/chat/xxxx" One conversation
│   ├── admin/
│   │   └── index.js            # "/admin"     Admin login + dashboard
│   └── api/
│       ├── register.js         # POST create account
│       ├── login.js            # POST log in
│       ├── logout.js           # POST log out
│       ├── me.js                # GET  current logged-in user
│       ├── upload.js           # POST upload a file (photo/document)
│       ├── chats/create.js     # POST create a new chat + secure link
│       ├── messages/send.js    # POST send a message
│       └── admin/
│           ├── login.js        # POST admin login
│           ├── logout.js       # POST admin logout
│           └── data.js         # GET  users/chats/messages for the admin panel
├── styles/
│   └── globals.css             # All the app's CSS (green theme)
├── supabase/
│   └── schema.sql               # Run this in Supabase to set up your database
├── .env.local.example
├── next.config.js
└── package.json
```

---

## 2. How it works (the short version)

- **Login system**: your own simple username/password system (not Supabase
  Auth). Passwords are hashed with **bcrypt** before being saved — they are
  never stored or shown in plain text. A signed, httpOnly cookie keeps you
  logged in.
- **Chat links**: when you click "Create New Chat," the server generates a
  long random code (via Node's `crypto` module) like `8fK92LmQxP7a` and
  makes a chat with that as its link. Random = hard to guess, unlike
  `/chat/1`, `/chat/2`, etc.
- **Joining**: opening a valid chat link while logged in automatically adds
  you as a participant — no chat ID typing required.
- **Realtime messages**: the browser subscribes to Supabase Realtime for the
  `messages` table, filtered to the current chat, so new messages appear
  instantly for both people without refreshing.
- **File uploads**: images and documents are uploaded through a server API
  route (which checks the file type and 5MB size limit) and stored in
  Supabase Storage.
- **Admin panel**: a separate login (from `.env.local`, not the database)
  protects `/admin`, which lists users, conversations, and messages — never
  passwords or password hashes.

---

## 3. Setup — step by step

### Step 1: Install dependencies

```bash
npm install
```

### Step 2: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free project.
2. Once it's ready, go to **Project Settings → API**. You'll need:
   - **Project URL**
   - **anon public key**
   - **service_role key** (keep this secret!)

### Step 3: Set up the database

1. In your Supabase project, open the **SQL Editor**.
2. Open `supabase/schema.sql` from this project, copy all of it, paste it
   into the SQL editor, and click **Run**.
3. This creates all four tables (`users`, `chats`, `chat_members`,
   `messages`), sets up security rules (Row Level Security), turns on
   Realtime for the `messages` table, and creates a public `chat-files`
   storage bucket for uploads.

### Step 4: Configure environment variables

1. Copy `.env.local.example` to a new file named `.env.local`:

   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in the values:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from
     Step 2.
   - `SUPABASE_SERVICE_ROLE_KEY` — from Step 2. **Never** share this or put
     it in code that runs in the browser.
   - `SESSION_SECRET` — any long random string. You can generate one with:

     ```bash
     openssl rand -base64 48
     ```

   - `ADMIN_USERNAME` and `ADMIN_PASSWORD` — whatever you want to log into
     `/admin` with.

### Step 5: Run it locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Register two different
accounts (e.g. in a regular window and an incognito window), create a chat
with one, and open the chat link with the other to start messaging.

### Step 6: Deploy to Vercel

1. Push this project to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), import the repo.
3. In the Vercel project's **Settings → Environment Variables**, add the
   same variables from your `.env.local` file.
4. Deploy. That's it!

---

## 4. Security notes

- Passwords are hashed with **bcrypt** (12 salt rounds) — never stored or
  returned as plain text, and never shown in the admin panel.
- Chat links are generated with cryptographically secure randomness
  (Node's `crypto.randomBytes`), not `Math.random()` or sequential IDs.
- All writes to the database (creating accounts, chats, messages, uploads)
  go through server-side API routes that use the secret **service role**
  key. The public **anon** key used in the browser cannot write anything —
  it can only read data (needed for Realtime to deliver new messages
  instantly). See the comments at the top of `supabase/schema.sql` for the
  full explanation of how Row Level Security is set up.
- Every message-sending and file-upload request re-checks on the server
  that the logged-in user is actually a member of that chat before allowing
  it — someone can't post into a conversation they haven't opened the link
  for.
- File uploads are validated for both **type** and **size (5MB max)** on
  the server, not just in the browser, since browser-side checks alone can
  always be bypassed.
- The admin panel and regular user logins are completely separate systems
  with separate cookies — there's no "admin flag" on a regular user
  account.
- **Trade-off worth knowing about**: because this app uses its own login
  system instead of Supabase Auth, message *reads* for Realtime rely on the
  chat link's randomness for protection (similar to how a Google Meet or
  Zoom link works) rather than a database-level per-user check. For a
  hobby/learning project this is a reasonable, well-documented trade-off.
  If you want stronger database-level guarantees later, the recommended
  upgrade is to migrate to Supabase Auth so Row Level Security policies can
  check `auth.uid()` directly.

---

## 5. Customizing

- **Colors**: all colors are CSS variables at the top of
  `styles/globals.css` (`--green`, `--bg`, etc.) — change them there.
- **Allowed file types**: edit `ALLOWED_FILE_TYPES` in
  `lib/fileValidation.js`.
- **Max file size**: edit `MAX_FILE_SIZE_BYTES` in the same file (and the
  `bodyParser.sizeLimit` in `pages/api/upload.js` if you increase it a lot).
- **Chat link length**: edit the `length` passed to `generateChatToken()` in
  `pages/api/chats/create.js`.

---

## 6. Troubleshooting

- **"SESSION_SECRET is not set"** — make sure you created `.env.local` (not
  just `.env.local.example`) and restarted `npm run dev`.
- **Messages don't appear in real time** — double check that Step 3 ran
  successfully; specifically that `alter publication supabase_realtime add
  table messages;` executed without error (it will error harmlessly if
  you run the whole script twice, which is fine).
- **File uploads fail** — confirm the `chat-files` bucket exists under
  **Storage** in your Supabase dashboard, and that it's set to public.
- **"Invalid username or password" on a fresh account** — usernames are
  stored lowercase; make sure you're typing it consistently.

---

Built to be simple enough to read top to bottom in one sitting — enjoy!
