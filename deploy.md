# Deploying to sammcgrail.com via GitHub Pages

This guide covers how to deploy this repo (and future repos) to your custom domain `sammcgrail.com` using GitHub Pages and Squarespace DNS.

---

## ⚠️ Important: Your Current Firebase Setup

Your main site `sammcgrail.com` is currently hosted on **Firebase Hosting**, not GitHub Pages.

**Firebase Project**: `streamwebsite-68d3c`
**Repo**: [sammcgrail/streampcwebsite](https://github.com/sammcgrail/streampcwebsite)

```json
// firebase.json
{
  "hosting": {
    "public": "src",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"]
  }
}
```

### The Challenge

You **cannot** serve `sammcgrail.com/sand` from GitHub Pages while `sammcgrail.com` is on Firebase. The DNS points to Firebase, so Firebase handles ALL requests to that domain.

### Your Options

#### Option A: Use a Subdomain for GitHub Pages (Recommended)

Keep Firebase for main site, use a subdomain for apps:

| URL | Hosted On |
|-----|-----------|
| `sammcgrail.com` | Firebase (main site) |
| `apps.sammcgrail.com` | GitHub Pages |
| `apps.sammcgrail.com/clawd/` | This sand game |

**Setup:**
1. In Squarespace DNS, add: `CNAME | apps | sammcgrail.github.io`
2. Create `sammcgrail.github.io` repo with custom domain `apps.sammcgrail.com`
3. Project sites auto-inherit: `apps.sammcgrail.com/clawd/`

#### Option B: Add Rewrites in Firebase (Hacky)

Use Firebase to redirect specific paths to GitHub Pages:

```json
// firebase.json
{
  "hosting": {
    "public": "src",
    "redirects": [
      {
        "source": "/sand",
        "destination": "https://sammcgrail.github.io/clawd/",
        "type": 302
      },
      {
        "source": "/sand/**",
        "destination": "https://sammcgrail.github.io/clawd/:splat",
        "type": 302
      }
    ]
  }
}
```

**Downsides**: URL changes in browser, doesn't feel native, requires Firebase deploy for each new app.

#### Option C: Host Apps on Firebase Too

Add your apps to the Firebase project directly:

```json
// firebase.json
{
  "hosting": {
    "public": "dist",
    "rewrites": [
      { "source": "/sand/**", "destination": "/sand/index.html" },
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

Build your apps into subdirectories of the Firebase public folder.

#### Option D: Switch Entirely to GitHub Pages

Move everything to GitHub Pages and retire Firebase:

1. Move `streampcwebsite` content to `sammcgrail.github.io` repo
2. Update Squarespace DNS to point to GitHub (A records + CNAME)
3. Disable Firebase hosting
4. All project sites work at `sammcgrail.com/reponame/`

---

## Current Setup

This repo builds to `docs/` folder and is served via GitHub Pages:
- **Branch**: `claude/ios-sensor-diagnostics-FytFm` (or `main` after merge)
- **Build output**: `docs/`
- **GitHub Pages URL**: `https://sammcgrail.github.io/clawd/`
- **Target custom URL**: `sammcgrail.com/sand`

## How It Works

GitHub Pages with custom domains follows this pattern:

1. **User/Org Site** (`sammcgrail.github.io`) - Your "main" site
2. **Project Sites** (`sammcgrail.github.io/reponame`) - Individual repos

When you set a custom domain on your **user site**, all project sites automatically become available at `sammcgrail.com/reponame`.

---

## Step 1: Create a User Site Repository

First, create a repo named exactly `sammcgrail.github.io`:

```bash
# Create new repo on GitHub named: sammcgrail.github.io
# This becomes your root site at sammcgrail.com
```

Add a simple `index.html` or set up a landing page. This repo controls the custom domain for ALL your project sites.

---

## Step 2: Configure DNS in Squarespace

Go to **Squarespace** → **Domains** → **sammcgrail.com** → **DNS Settings**

### Delete Conflicting Records
Remove any existing A or CNAME records that might conflict (Squarespace adds defaults).

### Add A Records (for apex domain `sammcgrail.com`)

Add **4 A records** pointing to GitHub's IP addresses:

| Type | Host | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

### Add CNAME Record (for `www` subdomain)

| Type | Host | Value |
|------|------|-------|
| CNAME | www | sammcgrail.github.io |

---

## Step 3: Configure GitHub Pages on User Site

In `sammcgrail.github.io` repo:

1. Go to **Settings** → **Pages**
2. Set **Source** to your branch and folder (e.g., `main` / `docs` or `main` / `root`)
3. Under **Custom domain**, enter: `sammcgrail.com`
4. Click **Save**
5. Wait for DNS check to pass (can take up to 72 hours, usually minutes)
6. Enable **Enforce HTTPS** once available

GitHub will create a `CNAME` file in your repo automatically.

---

## Step 4: Configure Project Sites (like this repo)

For each project repo (like `clawd`):

1. Go to **Settings** → **Pages**
2. Set **Source** to your branch and `docs/` folder
3. **Do NOT set a custom domain** - it inherits from user site automatically
4. Your site will be at: `sammcgrail.com/clawd/`

### Important: Vite Base Path

Make sure `vite.config.ts` has the correct base path:

```typescript
export default defineConfig({
  plugins: [react()],
  base: '/clawd/',  // Must match repo name!
  build: {
    outDir: 'docs',
  },
})
```

---

## URL Structure

Once configured:

| Repo | GitHub Pages URL | Custom Domain URL |
|------|------------------|-------------------|
| `sammcgrail.github.io` | `sammcgrail.github.io` | `sammcgrail.com` |
| `clawd` | `sammcgrail.github.io/clawd/` | `sammcgrail.com/clawd/` |
| `photo-app` | `sammcgrail.github.io/photo-app/` | `sammcgrail.com/photo-app/` |
| `future-repo` | `sammcgrail.github.io/future-repo/` | `sammcgrail.com/future-repo/` |

---

## Template for New Projects

### 1. Create new repo

```bash
mkdir my-new-app && cd my-new-app
bun create vite . --template react-ts
bun install
```

### 2. Configure Vite for GitHub Pages

Edit `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/my-new-app/',  // <-- Match your repo name
  build: {
    outDir: 'docs',
  },
})
```

### 3. Add publish script to `package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "publish": "bun run build && git add docs && git commit -m 'Build for GitHub Pages' && git push"
  }
}
```

### 4. Build and push

```bash
bun run build
git add -A
git commit -m "Initial commit"
git push -u origin main
```

### 5. Enable GitHub Pages

1. Go to repo **Settings** → **Pages**
2. Set source to `main` branch, `/docs` folder
3. Save and wait for deployment

Your app will be live at `sammcgrail.com/my-new-app/`

---

## Routing Considerations

### For Single-Page Apps (React Router)

Use `HashRouter` instead of `BrowserRouter` for GitHub Pages compatibility:

```tsx
import { HashRouter } from 'react-router-dom'

// URLs will be: sammcgrail.com/app/#/route
<HashRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/about" element={<About />} />
  </Routes>
</HashRouter>
```

Alternatively, add a `404.html` that redirects to `index.html` for `BrowserRouter` support.

---

## Troubleshooting

### DNS not resolving
- Wait up to 72 hours (usually faster)
- Check propagation: https://whatsmydns.net/
- Verify no conflicting Squarespace records

### 404 on project site
- Ensure `base` in `vite.config.ts` matches repo name exactly
- Rebuild: `bun run build`
- Check GitHub Pages source is set to correct branch/folder

### HTTPS not available
- Wait for DNS verification to complete
- Check that A records are correct
- GitHub enables HTTPS automatically once domain is verified

### Assets not loading
- Check browser console for 404s on JS/CSS
- Verify `base` path in Vite config
- Ensure built files are committed to `docs/`

---

## Quick Reference

```bash
# Build and deploy
bun run build
git add docs
git commit -m "Deploy"
git push

# Or use the publish script
bun run publish
```

---

## Resources

- [GitHub Pages Custom Domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [Squarespace + GitHub Pages Guide](https://www.mloning.com/posts/configuring-custom-domain-with-github-pages-and-squarespace/)
- [GitHub Community Discussion](https://github.com/orgs/community/discussions/81779)
