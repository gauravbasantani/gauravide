# What I Need From You

*A checklist for Gaurav. No prior knowledge assumed — every click is written out.*

**Time:** about 20 minutes (step ② is blocked — see below) · **Cost:** ₹0 / $0 · **Credit card:** never asked for

Work top to bottom. Each step gives you something you'll paste into a file at the end.
Tick the boxes as you go.

---

## First — five things explained in one line each

You'll meet these words. Nothing here is complicated.

| Term | What it actually means |
|---|---|
| **API key** | A long password that lets our app talk to another company's service. Like a hotel key card. |
| **OAuth** | "Sign in with Google/Splitwise." You log in on *their* site, and they hand our app a pass. **Our app never sees your password.** |
| **Callback URL** | After you log in on Splitwise's site, where should they send you back to? That address. |
| **Environment variable** | A secret stored in a file on your computer instead of inside the code — so it never ends up on GitHub. |
| **`service_role` key** | Supabase's *master* key. Full access to the database. Treat it like your bank password. |

**The golden rule:** keys go in a file called `.env.local`. Never in the chat, never on GitHub.

---

## ① GitHub account · 2 min

*Why: it's how you'll log into Vercel and Supabase, and where the code will live.*

- [ ] Go to **github.com**
- [ ] If you already have an account, just sign in — done, skip to ②
- [ ] Otherwise: **Sign up** → email → password → username → verify the email

Nothing to copy. Nothing else to do here.

---

## ② Splitwise developer app · ⚠️ **BLOCKED — needs a paid subscription**

**Stop here for now.** Splitwise changed their terms: registering a third-party app requires an
active **Splitwise Pro** subscription (~$40–60/year). The page you saw says exactly this, with
a *"Get Splitwise Pro to register an application"* button where the registration form used to be.

**So there is nothing you can do on this step until you decide about Pro.** That decision is in
[requirements.md](requirements.md) §4, and it is not urgent:

- **The app's hard part doesn't need Splitwise at all.** Scanning a receipt, fixing the items,
  assigning who had what, and computing everyone's exact share — none of that touches their API.
- Only the final step, *pushing the expense into Splitwise*, needs it.
- **Plan: build everything up to that point first, for free.** Once you can see it working on
  your own receipts, you'll know whether $50/year is worth automating the last step.

**What to do right now:** ✅ **nothing — skip to ③.**

*(If you already have Splitwise Pro, or decide to buy it, come back and register the app with
the fields below. Everything else in these docs still applies.)*

<details>
<summary>The registration form, for when you do have Pro</summary>

| Field | What to type |
|---|---|
| Application name | `Gauravide` |
| Description | `Split receipts and push them to Splitwise` |
| Homepage URL | `https://gauravide.vercel.app` |
| Callback URL | `https://gauravide.vercel.app/api/auth/callback` |

The **Consumer Secret** is shown properly only once — copy it immediately.
</details>

---

## ③ Gemini API key · 3 min

*Why: this is the AI that reads your receipt photo and pulls out the items and prices.*

- [ ] Go to **aistudio.google.com**
- [ ] Sign in with any Google account (your ASU one or a personal one — either works)
- [ ] In the left sidebar, click **Get API key**
- [ ] Click **Create API key**
- [ ] Choose **Create API key in new project**
- [ ] Copy the key (it starts with `AIza…`)

**No credit card. No billing setup. No trial clock.** The free tier is a real free tier.

**You now have:** `GEMINI_API_KEY`

---

## ④ OCR.space backup key · 3 min

*Why: if Gemini's daily free limit runs out, the app automatically switches to this so it never
stops working.*

- [ ] Go to **ocr.space/ocrapi**
- [ ] Find the **Free API Key** box
- [ ] Enter your email → **Subscribe to Free Plan**
- [ ] Check your inbox — the key arrives by email in a minute
- [ ] Copy it

**You now have:** `OCRSPACE_API_KEY`

---

## ⑤ Supabase · 6 min

*Why: this is the database where your past splits and receipt images are stored.*
*(Only needed for Session 2, but set it up now while you're in the flow.)*

- [ ] Go to **supabase.com** → **Start your project**
- [ ] **Sign in with GitHub** → **Authorize**
- [ ] You'll land on **"Your organizations"** — empty. Click **+ New organization**

| Field | What to put |
|---|---|
| Name | `Gauravide` (just a container — your own name works too) |
| Type | **Personal** |
| Plan | **Free** |

- [ ] **Create organization** → it usually drops you into the project form. If not, click
      **New project**
- [ ] Fill in:

| Field | What to put |
|---|---|
| Name | `gauravide` |
| Database Password | Click **Generate a password**, then **copy it into your note** |
| Region | **West US (North California)** — closest to Arizona |
| Plan | **Free** |

- [ ] Click **Create new project** → wait ~2 minutes while it sets up

Now get the two values:

- [ ] Left sidebar → **Settings** (gear icon) → **API**
- [ ] Copy **Project URL** — looks like `https://abcdefgh.supabase.co`
- [ ] Scroll to **Project API keys** → find **`service_role`** → click **Reveal** → copy it

> ⚠️ **The `service_role` key is a master key to your whole database.** Never paste it into a
> browser, a chat, or a public repo. It only ever goes in `.env.local` and later into Vercel's
> settings page. (The other key, `anon`, is the safe public one — we don't need it.)

> 💡 **You don't need to create any tables.** I'll do that with one SQL command later.

**You now have:** `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`

---

## ⑥ Vercel · 2 min

*Why: this is where the website lives, for free, forever.*

- [ ] Go to **vercel.com**
- [ ] **Sign up** → **Continue with GitHub** → **Authorize**
- [ ] Choose the **Hobby** (free) plan if asked
- [ ] **Stop there.** Don't import anything yet — there's no code to import.

I'll walk you through the import once the app exists.

---

## ⑦ UptimeRobot · 2 min *(optional but worth it)*

*Why: emails you if the site ever goes down, so you find out before your friends do.*

- [ ] Go to **uptimerobot.com** → **Register for FREE**
- [ ] Email + password → verify
- [ ] **Stop there.** We'll add the monitor after the first deploy, when there's a URL to watch.

---

## ⑧ Put the keys in a file · 5 min

This is the only slightly technical bit, and it's just creating a text file.

**In VS Code (which you already have open):**

- [ ] **File → New File**
- [ ] **File → Save As…**
- [ ] Navigate to `/Users/gaurav/Downloads/Splitwise`
- [ ] Name it exactly: **`.env.local`** — *with the dot at the front*
- [ ] If macOS warns about names starting with a dot, choose **Use "."**

- [ ] Paste this in, then fill in each blank from your notes:

```
# leave these two empty for now — step ② is blocked (needs Splitwise Pro)
SPLITWISE_CLIENT_ID=
SPLITWISE_CLIENT_SECRET=
SESSION_SECRET=
GEMINI_API_KEY=
OCRSPACE_API_KEY=
APP_URL=http://localhost:3000

SUPABASE_URL=
SUPABASE_SERVICE_KEY=
ADMIN_USER_IDS=
```

**Rules for filling it in:**
- No spaces around the `=`  →  `GEMINI_API_KEY=AIzaSy...`  ✅  not  `GEMINI_API_KEY = AIza...` ❌
- No quotes around the values
- One per line

**For `SESSION_SECRET`** — this one you generate yourself:

- [ ] Open **Terminal** (Cmd+Space → type `Terminal` → Enter)
- [ ] Paste this and press Enter:
  ```
  openssl rand -base64 32
  ```
- [ ] Copy the line it prints and paste it after `SESSION_SECRET=`

**Leave `ADMIN_USER_IDS` empty for now** — we'll fill it in Session 3.

- [ ] **Save the file** (Cmd+S)

> 🔒 The very first thing I'll commit is a `.gitignore` containing `.env.local`, so this file
> can never be uploaded to GitHub by accident.

---

## ⑨ Things that aren't accounts

- [ ] **2–3 real receipt photos** — one grocery, one restaurant, and ideally one crumpled or
      faded. Drop them anywhere in `/Users/gaurav/Downloads/Splitwise` and tell me where.
      *Clean demo receipts prove nothing; I need to see it fail on a real one.*
- [ ] **One receipt with an awkward total** — something like $45.67 that needs splitting 3 ways.
      That's the rounding trap, and it's the most likely place for a money bug to hide.
- [ ] **Check your Splitwise has at least one group and 2+ friends** — needed to test group
      matching and assignment.
- [ ] **A second Splitwise account** on any spare email — used once, in Session 2, to prove one
      user cannot read another user's data. Make it now or later, your call.

---

## ⑩ Tell me you're ready

- [ ] Say **"env is ready"** in the chat
- [ ] Tell me where you put the receipt photos

I'll read `.env.local` directly. **I will never print those values into the chat.**

Then I start with Phase 0 — testing seven assumptions about the Splitwise API with real calls,
before writing a single line of interface. If one of them turns out differently than expected,
better to find out in the first 30 minutes than in hour three.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| secure.splitwise.com/apps shows "Get Splitwise Pro" instead of a form | Expected — see step ②. Skip it for now |
| Lost the Splitwise Consumer Secret | secure.splitwise.com/apps → your app → regenerate |
| Can't create a file starting with `.` in Finder | Use VS Code's Save As instead — it allows it |
| Gemini says "billing required" | You picked an existing paid project. Redo it with **Create API key in new project** |
| Supabase asks for a payment method | You picked a paid plan. Go back and choose **Free** |
| Supabase shows "Your organizations" and no project button | Normal — create an organization first, then the project appears |
| OCR.space email never arrives | Check spam. Or skip it — the app still works, just without the backup layer |
| Not sure whether a value is right | Paste the *variable name* here (not the value) and I'll tell you what it should look like |

**Never paste an actual key into the chat.** If you're unsure about one, describe it —
"it starts with AIza and is about 40 characters" — and I'll confirm.
