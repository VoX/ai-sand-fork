# Multi-App Folder Structure (nsthorat's Approach)

This guide explains how to host multiple mini-apps under a single path like `sammcgrail.com/apps` using the same pattern as [nikubaba.com/claude-playground](https://nikubaba.com/claude-playground).

---

## How nsthorat Did It

Instead of separate repos for each app, nsthorat uses **one SPA (Single Page Application)** with client-side routing:

```
claude-playground/
├── src/
│   ├── main.tsx          # Router setup with all routes
│   ├── pages/
│   │   ├── Home.tsx      # Bento grid home page
│   │   ├── sensors/      # Sensor diagnostics app
│   │   │   └── index.tsx
│   │   └── audio/        # Audio visualizer app
│   │       └── index.tsx
│   ├── components/ui/    # Shared components
│   └── index.css         # Global styles + theme
├── docs/                  # Built output for GitHub Pages
└── vite.config.js        # base: '/claude-playground/'
```

### Key Architecture

1. **Single Entry Point** - One React app with React Router
2. **HashRouter** - URLs like `/#/sensors` work on static hosts
3. **Home Grid** - Landing page lists all mini-apps
4. **Shared Theme** - Consistent design across apps

---

## Router Setup (main.tsx)

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Home from './pages/Home'
import SensorDiagnostics from './pages/sensors'
import AudioVisualizer from './pages/audio'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/sensors" element={<SensorDiagnostics />} />
        <Route path="/audio" element={<AudioVisualizer />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
```

**Result URLs:**
- `nikubaba.com/claude-playground/` → Home grid
- `nikubaba.com/claude-playground/#/sensors` → Sensor app
- `nikubaba.com/claude-playground/#/audio` → Audio app

---

## Home Grid (Home.tsx)

```tsx
interface MiniApp {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  path: string
  status: 'available' | 'coming-soon'
  gradient: string
  size: 'large' | 'medium' | 'small'
}

const miniApps: MiniApp[] = [
  {
    id: 'sensors',
    title: 'Sensor Diagnostics',
    description: 'Test iOS web APIs for motion, orientation, geolocation',
    icon: <Smartphone className="w-8 h-8" />,
    path: '/sensors',
    status: 'available',
    gradient: 'from-cyan-500 to-blue-500',
    size: 'large',
  },
  {
    id: 'audio',
    title: 'Audio Visualizer',
    description: 'Galaxy and DNA visualization modes',
    icon: <Music className="w-6 h-6" />,
    path: '/audio',
    status: 'available',
    gradient: 'from-purple-500 to-pink-500',
    size: 'medium',
  },
  // ... more apps
]
```

---

## Setting Up sammcgrail.com/apps

### Option 1: Add to Firebase Site (streampcwebsite)

Add the apps folder to your existing Firebase-hosted site:

```
streampcwebsite/
├── src/
│   ├── index.html        # Your main site
│   └── apps/             # New apps folder
│       ├── index.html    # Apps SPA entry
│       ├── assets/       # Built JS/CSS
│       └── ...
├── firebase.json
└── .firebaserc
```

**firebase.json:**
```json
{
  "hosting": {
    "public": "src",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/apps/**",
        "destination": "/apps/index.html"
      }
    ]
  }
}
```

**Build & Deploy:**
```bash
# In your apps project
bun run build  # outputs to streampcwebsite/src/apps/

# In streampcwebsite
yarn firebase deploy
```

**Result:**
- `sammcgrail.com` → Main site
- `sammcgrail.com/apps/` → Apps home grid
- `sammcgrail.com/apps/#/sand` → Sand game
- `sammcgrail.com/apps/#/photo` → Photo viewer

---

### Option 2: Separate Apps Repo with Firebase Multi-site

Create a dedicated apps repo and use Firebase multi-site hosting:

**apps repo (new):**
```
sammcgrail-apps/
├── src/
│   ├── main.tsx
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── sand/index.tsx
│   │   └── photo/index.tsx
├── firebase.json
└── .firebaserc
```

**firebase.json:**
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
```

**.firebaserc:**
```json
{
  "projects": {
    "default": "streamwebsite-68d3c"
  },
  "targets": {
    "streamwebsite-68d3c": {
      "hosting": {
        "apps": ["streamwebsite-68d3c"]
      }
    }
  }
}
```

Then configure Firebase Console to serve this at `/apps` path.

---

## Adding a New Mini-App

### Step 1: Create the component

```bash
mkdir -p src/pages/newapp
touch src/pages/newapp/index.tsx
```

```tsx
// src/pages/newapp/index.tsx
import { Link } from 'react-router-dom'

export default function NewApp() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Link to="/" className="p-4 block">← Back</Link>
      <h1>New App</h1>
      {/* Your app here */}
    </div>
  )
}
```

### Step 2: Add the route

```tsx
// src/main.tsx
import NewApp from './pages/newapp'

<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/sensors" element={<SensorDiagnostics />} />
  <Route path="/newapp" element={<NewApp />} />  {/* Add this */}
</Routes>
```

### Step 3: Add to home grid

```tsx
// src/pages/Home.tsx
const miniApps: MiniApp[] = [
  // ... existing apps
  {
    id: 'newapp',
    title: 'New App',
    description: 'Description here',
    icon: <Icon className="w-6 h-6" />,
    path: '/newapp',
    status: 'available',
    gradient: 'from-green-500 to-teal-500',
    size: 'medium',
  },
]
```

### Step 4: Build and deploy

```bash
bun run build
yarn firebase deploy  # or git push for GitHub Pages
```

---

## Theme & Styling

nsthorat uses a consistent dark theme with CSS variables:

```css
/* index.css */
:root {
  --color-bg-dark: #0a0a0f;
  --color-bg-card: #1a1a24;
  --color-accent-cyan: #00d4ff;
  --color-accent-purple: #a855f7;
  --color-text-primary: #ffffff;
  --color-text-secondary: #888888;
}
```

**Fonts:**
- Headings: Space Grotesk
- Code/mono: JetBrains Mono

**Components:**
- MagicCard with spotlight hover effect
- Staggered fade-in animations
- Gradient text and borders

---

## Quick Comparison

| Approach | URL Pattern | Hosting | Complexity |
|----------|-------------|---------|------------|
| **Separate repos** | `sammcgrail.com/sand/`, `sammcgrail.com/photo/` | GitHub Pages per repo | Low |
| **Single SPA (this guide)** | `sammcgrail.com/apps/#/sand`, `sammcgrail.com/apps/#/photo` | One deploy | Medium |
| **Firebase multi-site** | `sammcgrail.com/apps/sand/` | Firebase | High |

---

## Resources

- [nsthorat/claude-playground](https://github.com/nsthorat/claude-playground) - Reference implementation
- [React Router HashRouter](https://reactrouter.com/en/main/router-components/hash-router)
- [Firebase Hosting Rewrites](https://firebase.google.com/docs/hosting/full-config#rewrites)
