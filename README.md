# Music Recommendation & Request Platform

A premium white-themed 3D site built with plain HTML, CSS and vanilla JavaScript (Three.js for the hero, Supabase for the database and admin login).

```
index.html          page structure
style.css           all styling (light + dark theme)
script.js           all behaviour (router, 3D, form, featured, admin)
config.js           your Supabase keys + default profile/socials
supabase-setup.sql  database tables, security rules, admin allowlist
```

## Setup (about 10 minutes)

1. **Create a Supabase project** at supabase.com (free tier is fine).
2. **Run the database script:** Dashboard → SQL Editor → paste all of `supabase-setup.sql` → Run.
3. **Create your admin account:** Authentication → Users → *Add user* (email + password, auto-confirm).
4. **Authorise it:** in the SQL Editor run
   `insert into public.admins (email) values ('your-email@example.com');`
5. **Lock sign-ups:** Authentication → Sign In / Providers → turn off *Allow new users to sign up*.
6. **Connect the site:** Project Settings → API → copy the *Project URL* and the *anon public* key into `config.js`.
7. **Host it.** Serve the folder over http(s), not by double-clicking the file:
   - Local test: `python3 -m http.server 8000` then open http://localhost:8000
   - Public: drag the folder into Netlify Drop, or use Vercel / GitHub Pages / Cloudflare Pages.
8. In Supabase → Authentication → URL Configuration, add your site's URL.

Open `yoursite/#admin` (or the small "Admin" link in the footer) and sign in.

## Security model

- The only key in the frontend is the **anon** key, which is public by design. Never use the `service_role` key here.
- Visitors can only *insert* new requests (always `pending`, no admin notes). They cannot read, edit or delete anything.
- Reading/editing/deleting requests, managing featured music and editing settings require a signed-in user whose email is in `public.admins`. This is enforced by the database (Row Level Security), not by hiding buttons.
- All user-supplied text is rendered with `textContent`, links are limited to http(s), and CSV export neutralises spreadsheet formulas.

## Customising

Everything personal (name, logo mark, picture, about text, genres, social handles/URLs) is editable in **Admin → Profile & Socials**. `config.js` only provides the starting defaults.

Social cards without a link are shown greyed out as "Not linked yet" rather than as fake links. Enter a username (and a URL for Discord) to switch them on.

## Notes

- Without Supabase configured, the site still loads, but the request form shows a "not connected" notice instead of pretending to send.
- Album artwork: paste an image URL in the Featured editor, or use **Find artwork**, which looks up cover art through Apple's public iTunes Search API.
- The Visualizer's sound is generated in the browser and only plays after a tap.
