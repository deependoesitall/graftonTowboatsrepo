# Grafton Towboat Order System

A modern, mobile-first digital ordering system for **Grafton Towboat Services** — replacing the 138-page Sinclair Foods printable form with a fast, searchable web app.

Built with **Next.js 15 · Supabase · Tailwind CSS · shadcn/ui · Resend · Vercel**

---

## Features

- 📱 **Mobile-first PWA** — installable on phones and tablets
- 🔍 **Fast product catalog** — search + category filters across hundreds of items
- 🛒 **Persistent cart** — survives page refresh via localStorage
- 📋 **Smart order form** — vessel info saved for repeat orders
- 📧 **Automatic email** — professional HTML email + PDF attachment on every order
- 📄 **PDF generation** — downloadable Sinclair Foods–ready order sheet
- 🔐 **Admin dashboard** — order management, status tracking, CSV export
- ⚙️ **Configurable fields** — add/remove order form fields without code changes

---

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Landing page
│   ├── catalog/              # Product browser
│   ├── order/                # Checkout / submit
│   ├── confirm/              # Order confirmation
│   ├── admin/                # Admin dashboard
│   │   ├── orders/           # Order list + management
│   │   ├── products/         # CSV product import
│   │   └── settings/         # System configuration
│   └── api/                  # API routes
├── components/
│   ├── catalog/              # ProductGrid, CategoryFilter, SearchBar
│   ├── cart/                 # CartBar
│   ├── admin/                # AdminNav, OrderDetailModal
│   └── layout/               # SiteHeader
├── lib/
│   ├── cart.ts               # localStorage cart logic
│   ├── email.ts              # Resend email sending
│   ├── pdf.tsx               # @react-pdf/renderer document
│   ├── utils.ts              # Helpers, formatters, constants
│   └── supabase/             # Supabase client (browser + server)
├── hooks/
│   └── use-toast.ts          # Toast notification system
└── types/
    └── index.ts              # TypeScript types
supabase/
├── migrations/
│   └── 001_initial_schema.sql
└── seed/
    └── 002_products.sql
```

---

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)
- A [Resend](https://resend.com) account (free tier: 3,000 emails/month)
- A [Vercel](https://vercel.com) account (free tier works)

---

## Setup

### 1. Clone & Install

```bash
git clone <your-repo>
cd grafton-towboat
npm install
```

### 2. Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration:
   ```sql
   -- Paste contents of supabase/migrations/001_initial_schema.sql
   ```
3. Then seed the products:
   ```sql
   -- Paste contents of supabase/seed/002_products.sql
   ```
4. In **Project Settings → API**, copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

### 3. Resend Setup

1. Sign up at [resend.com](https://resend.com)
2. Add and verify your sending domain (or use `onboarding@resend.dev` for testing)
3. Create an API key

### 4. Environment Variables

```bash
cp .env.example .env.local
```

Edit `.env.local` with your values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
RESEND_API_KEY=re_...
EMAIL_FROM=orders@yourdomain.com
BUSINESS_EMAIL=GraftonTowboatServices@gmail.com
ORDER_EMAIL_CC=
ADMIN_PASSWORD=your-secure-password
ADMIN_SECRET_KEY=a-long-random-string-32-chars-min
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 5. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Importing Products (CSV)

You can import/update the product catalog via the admin panel:

1. Go to `/admin` → log in → **Products**
2. Drag & drop your CSV or TSV file
3. The importer auto-detects columns — map them to the correct fields
4. Click **Import Products**

**Supported CSV columns** (column names are flexible — the importer guesses):
- `description` or `item` — product name
- `category` — main category
- `sub_category` or `subcategory` — sub-category
- `pkg_size` or `size` — package size
- `uom` or `unit` — unit of measure
- `price` — price (numeric, no $ sign)
- `upc` — UPC code (optional)

---

## Deployment (Vercel)

### Option A: Vercel Dashboard (Recommended)

1. Push your code to GitHub
2. Go to [vercel.com/new](https://vercel.com/new) → Import repository
3. Add all environment variables from `.env.example` in the Vercel dashboard
4. Deploy ✓

### Option B: Vercel CLI

```bash
npm i -g vercel
vercel --prod
```

Follow prompts; paste env vars when asked.

### After Deploy

Update `NEXT_PUBLIC_APP_URL` in Vercel environment variables to your production URL (e.g. `https://grafton-towboat.vercel.app`).

---

## Admin Dashboard

Access at `/admin` — default password is `grafton2024` (change via `ADMIN_PASSWORD` env var).

### Admin Features

| Feature | Location |
|---------|----------|
| View all orders | `/admin/orders` |
| Order detail + status change | Click any order row |
| Download order PDF | Order detail → Download PDF |
| Export orders CSV | Orders list → Export CSV |
| Import products | `/admin/products` |
| Configure order fields | `/admin/settings` → Order Fields |
| Toggle features (drafts, tax) | `/admin/settings` → Features |
| Update email recipients | `/admin/settings` → Email |

### Order Statuses

`new` → `in_progress` → `fulfilled` → `cancelled`

---

## Squarespace Integration

Add this button/link to the existing Grafton Towboat Services Squarespace site:

**Button text:**
```
Order Groceries & Supplies
```

**Button URL:**
```
https://your-vercel-domain.vercel.app/catalog
```

Or use this full HTML snippet for a styled button:
```html
<a href="https://your-vercel-domain.vercel.app/catalog"
   style="display:inline-block;background:#C9922A;color:#fff;padding:14px 28px;
          border-radius:8px;font-weight:bold;text-decoration:none;font-size:16px;">
  Order Groceries &amp; Supplies →
</a>
```

---

## PWA Installation

Customers can install the app on their phones:

- **iOS (Safari):** Share → Add to Home Screen
- **Android (Chrome):** Three-dot menu → Add to Home Screen / Install App
- **Desktop Chrome:** Address bar install icon

The app uses `/catalog` as its start URL and works offline for browsing (catalog requires connection for live data).

---

## Email Configuration

Orders trigger an HTML email sent via Resend containing:
- Order number and timestamp
- Vessel / customer info
- Full itemized product list grouped by category
- Total amount
- Attached PDF (Sinclair Foods–ready format)
- Link to admin order detail

### Using Gmail (Alternative to Custom Domain)

If you don't have a custom domain, you can use Resend's test address (`onboarding@resend.dev`) during development. For production, Resend requires a verified sending domain. A cheap option: register a domain like `grafton-orders.com` (~$10/year) and verify it in Resend.

---

## Database Schema

### `products`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| category | text | Main category |
| sub_category | text | Sub-category |
| upc | text | UPC code |
| description | text | Product name |
| pkg_size | text | Package size |
| uom | text | Unit of measure |
| price | numeric | Price |
| active | boolean | Show in catalog |

### `orders`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| order_number | text | Human-readable (GTS-XXXXX) |
| status | text | new/in_progress/fulfilled/cancelled |
| vessel_info | jsonb | All customer fields |
| subtotal | numeric | Pre-tax total |
| total | numeric | Final total |
| notes | text | Additional notes |

### `order_items`
| Column | Type | Description |
|--------|------|-------------|
| order_id | uuid | FK → orders |
| product_id | uuid | FK → products |
| description | text | Snapshot of product name |
| quantity | integer | |
| unit_price | numeric | Price at time of order |
| total_price | numeric | quantity × unit_price |

---

## Customization

### Brand Colors

Edit `tailwind.config.js` to change colors:
```js
colors: {
  navy:  '#0D1B2A',   // dark background
  steel: '#1B3A5C',   // medium blue
  river: '#1E5F8C',   // accent blue
  gold:  '#C9922A',   // primary CTA color
  amber: '#E8A93C',   // secondary gold
  sand:  '#F5E6C8',   // light background
  cream: '#FAF6EF',   // page background
}
```

### Adding a New Page

1. Create `src/app/your-page/page.tsx`
2. It's automatically routed to `/your-page`

### Adding Admin Features

Admin auth check pattern:
```typescript
const token = sessionStorage.getItem('admin_token')
if (!token) { router.push('/admin'); return }

// Make authenticated API calls:
const res = await fetch('/api/your-endpoint', {
  headers: { 'x-admin-token': token }
})
```

---

## Troubleshooting

**"Products not loading"**
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Confirm you ran the SQL migration in Supabase
- Check Supabase RLS policies allow public read on `products`

**"Email not sending"**
- Verify `RESEND_API_KEY` is correct
- Confirm `EMAIL_FROM` domain is verified in Resend
- Check Vercel function logs for error details
- Email errors are non-blocking — orders still save even if email fails

**"Admin login fails"**
- Confirm `ADMIN_PASSWORD` env var matches what you're typing
- `ADMIN_SECRET_KEY` must be set and match on all deploys
- Try clearing browser sessionStorage and logging in again

**"PDF download is blank"**
- `@react-pdf/renderer` requires Node 18+
- Check Vercel function timeout (PDF generation can take 2–3 seconds)

---

## License

Private / commercial use for Grafton Towboat Services.

---

*Built with ❤️ for the river — Grafton, IL · Mississippi Mile Marker 218*
