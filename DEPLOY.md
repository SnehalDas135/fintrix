# Deploying Fintrix

Fintrix is a small static web app with one Vercel API function:

- `index.html` for the page structure
- `styles.css` for styling
- `script.js` for app logic, data model, and Gemini integration
- `api/gemini.js` for the server-side Gemini proxy on Vercel

No build step, no dependencies to install.

## Step 1 — Get a free Gemini API key

1. Go to https://aistudio.google.com/apikey
2. Create a new key (no credit card required for the free tier)
3. Do not paste the key into `env.js` for Vercel deployment.

Keep `env.js` like this:
```js
const env = {
  API_KEY: "",
  MODEL: "gemini-2.5-flash-lite"
};
```

## Step 2 — Add the key in Vercel

In Vercel Dashboard:

1. Open your project
2. Go to Settings → Environment Variables
3. Add `GEMINI_API_KEY`
4. Paste your Gemini API key as the value
5. Select Production, Preview, and Development
6. Save, then redeploy

## Step 3 — Deploy on Vercel

1. Install the CLI: `npm i -g vercel`
2. Run `vercel` from this folder
3. Follow the prompts
4. Redeploy after adding `GEMINI_API_KEY`

## Step 4 — Test locally with Vercel envs

If you want to test the proxy locally:

1. Run `vercel link`
2. Run `vercel env pull .env.local`
3. Run `vercel dev`
4. Open the local Vercel URL

## Step 5 — Start using it

1. Open your deployed URL (or local file)
2. Go to **Profile**, fill in your details, monthly income, and budget, then tap **Save profile**
3. Go to **Today** and log an expense in plain English — e.g. "Chicken biryani 220" or "Netflix ₹199" — Gemini auto-categorizes it as a Need or Want and detects subscriptions
4. Log income from the **+ Income** button — pocket money, salary, internship pay, scholarships, and more
5. Add budgets per category and savings goals — progress bars update in real time
6. Check **Insights** for income vs expense trends, category breakdowns, needs/wants split, and detected subscriptions
7. Tap **✨ Analyze My Finances** for AI-generated insights grounded in your real numbers
8. Use **AI Advisor** any time — it always has full context of your income, expenses, budgets, and goals

## Notes on persistence

Unlike Nutrix's in-memory-only design, Fintrix persists everything (income, expenses, budgets, goals, profile, chat history) to `localStorage`, so your data survives page refreshes. Use **Profile → Export all data** to back up to a JSON file, and **Today → Import** to restore it on another device or browser. **Profile → Reset all data** wipes everything and starts fresh.

If you want a real backend (multi-device sync, no localStorage limits) the next step would be wiring up Firebase, Supabase, or MongoDB — the data layer in `script.js` (`loadState`/`saveState`) is already isolated from the UI rendering, so that migration wouldn't require a major rewrite.
