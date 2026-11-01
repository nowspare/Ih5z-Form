/* ------------------------------------------------------------------
   Site configuration — edit this file.

   supabaseUrl / supabaseAnonKey:
     Supabase Dashboard → Project Settings → API.
     The "anon public" key is designed to be public and is safe here
     (access is enforced by the Row Level Security rules in supabase-setup.sql).
     NEVER put the "service_role" key in this file or anywhere in the frontend.

   profile / socials:
     These are only the starting defaults. Once the backend is connected you
     can change all of them from Admin → Profile & Socials without touching code.
------------------------------------------------------------------- */
window.SITE_CONFIG = {
  supabaseUrl: "",       // e.g. "https://abcdxyzcompany.supabase.co"
  supabaseAnonKey: "",   // the "anon public" key

  profile: {
    siteName: "Ih5z",          // shown in the nav bar and footer
    logoText: "♪",                  // 1–2 characters used as the logo mark
    welcome: "Welcome to my corner of the internet for songs worth sharing.",
    avatarUrl: "https://pin.it/mLeHGaDTv",                  // https link to your profile picture (leave empty for initials)
    aboutName: "it's khan",
    aboutText:
      "Hi, I'm ih5z. I collect songs the way some people collect postcards: one for every mood, every late night, every strange little memory.\n\nThis is where I share what I'm listening to, and where you can ask me to find something that fits whatever you're feeling.",
    genres: ["Indie", "R&B", "Dream Pop", "Lo-fi", "Late-night Jazz"],
    why: "A good song at the right moment can change a whole day. I love being the person who sends it."
  },

  // Leave url and username empty until you have real profiles; empty ones are shown as "not linked yet" (not as clickable links).
  socials: {
    instagram: { username: "", url: "" },
    tiktok:    { username: "ruu_i.s", url: "www.tiktok.com/@ruu_i.s" },
    spotify:   { username: "", url: "" },
    youtube:   { username: "ih5z", url: "https://www.youtube.com/@ih5z" },
    pinterest: { username: "", url: "" },
    x:         { username: "", url: "" },
    discord:   { username: "usingspareaccount", url: "https://discord.com/users/usingspareaccount" }   // paste a Discord invite or profile URL
    telegram:  { username: "uxlhh" , url: "https://t.me/uxlhh" }
};
