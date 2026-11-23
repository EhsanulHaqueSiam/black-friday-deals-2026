// The one category tree used by the build, the README, the website and the enrichment agents.
export const TAXONOMY = {
  "AI Tools": ["Chat & Assistants", "Writing & Content", "Image & Video", "Voice & Audio", "Coding & Agents", "Automation & Workflows", "Research & Learning", "AI APIs & Credits"],
  "Developer Tools": ["Databases & API Clients", "Git, CI & DevOps", "Testing & Debugging", "Editors & Terminals", "Mac Dev Utilities", "Boilerplates & Starter Kits", "Backend, APIs & Infra", "Monitoring & Analytics"],
  "Design": ["UI Kits & Templates", "Icons, Fonts & Illustrations", "Design & Prototyping Tools", "Mockups & Screenshots", "Stock Photos, Video & Music"],
  "Photo, Video & Audio": ["Video Editing", "Screen Recording", "Photo Editing", "Music & Audio Production", "Podcasts & Transcription"],
  "Productivity": ["Notes & Writing", "Tasks & Projects", "Calendar & Time Tracking", "Focus & Habits", "Reading & Knowledge", "Email & Communication", "Documents & PDFs"],
  "Mac & Desktop Utilities": ["Menu Bar & Dock", "Windows & Screens", "Clipboard, Launchers & Keyboard", "Files, Storage & System", "Browser Extensions"],
  "Security & Privacy": ["VPN", "Password Managers", "Antivirus & Security Suites", "Privacy & Data Removal", "Secure Email & Storage"],
  "Hosting & Cloud": ["Domains", "Web & WordPress Hosting", "PaaS & Serverless", "VPS & Cloud Servers", "Databases", "Cloud Storage & Backup", "Email Hosting"],
  "Websites & E-commerce": ["Website Builders & No-Code", "WordPress Themes & Plugins", "Forms & Surveys", "E-commerce & Payments"],
  "Marketing & Sales": ["SEO", "Email Marketing & Newsletters", "Social Media", "Ads, Leads & Outreach", "CRM & Sales", "Web Analytics"],
  "Business & Finance": ["Personal Finance & Investing", "Accounting & Invoicing", "Customer Support & Chat", "Team & Operations", "Startup & Indie Tools", "Legal & Documents"],
  "Learning": ["Online Course Platforms", "Programming & Tech", "Cybersecurity Certs & Training", "Cloud & DevOps Certs", "Languages", "Books & Ebooks", "Communities & Newsletters"],
  "Entertainment": ["Streaming Video", "Music", "Audiobooks & Reading", "News & Magazines"],
  "Gaming": ["Game Stores & Sales", "Game Subscriptions", "Games & Apps"],
  "Hardware & Electronics": ["Phones, Tablets & Computers", "Audio", "Smart Home", "Accessories & Peripherals", "Cameras & Drones", "Retailer Sales"],
  "Health & Lifestyle": ["Fitness & Workouts", "Health & Mental Wellbeing", "Food & Nutrition", "Travel & Navigation", "Family, Kids & Relationships", "Hobbies & Home", "Weather & Misc"],
  "Bundles & Deal Sites": ["Bundles", "Lifetime Deal Marketplaces"],
  // Hidden on the website until the visitor opts in, collapsed in the README.
  "Adult (18+)": ["Adult Sites & Subscriptions", "Adult Games", "Adult Toys & Wellness"],
} as const satisfies Record<string, readonly string[]>;

export const ADULT: Category = "Adult (18+)";

export type Category = keyof typeof TAXONOMY;
export type Subcategory<C extends Category = Category> = (typeof TAXONOMY)[C][number];

export const PLATFORMS = ["mac", "windows", "linux", "ios", "android", "web", "browser-extension", "wordpress", "physical"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PRICING = ["subscription", "one-time", "credits", "physical"] as const;
export type Pricing = (typeof PRICING)[number];

export const isCategory = (c: string): c is Category => c in TAXONOMY;
export const isSubcategory = (c: Category, s: string): s is Subcategory =>
  (TAXONOMY[c] as readonly string[]).includes(s);

// Fallback for deals no agent has tagged yet: guess from the source list's section names.
const GUESS: ReadonlyArray<readonly [Category, RegExp]> = [
  ["Security & Privacy", /vpn|privacy|security|password|antivirus/i],
  ["Hosting & Cloud", /hosting|domain|vps|server|cloud|storage/i],
  ["AI Tools", /\bai\b|\bml\b/i],
  ["Learning", /course|book|learning|education|reference|training|cert|exam|lab/i],
  ["Gaming", /gam/i],
  ["Hardware & Electronics", /electronic|hardware|console|peripheral|laptop|monitor|chair/i],
  ["Websites & E-commerce", /wordpress|no-?code|website builder|e-?commerce/i],
  ["Design", /ui kit|template|icon|design|font|illustration/i],
  ["Developer Tools", /develop|dev tools|\bapi|boilerplate|starter|laravel|php/i],
  ["Photo, Video & Audio", /photo|image|video|audio|podcast|creative|screenshot/i],
  ["Marketing & Sales", /marketing|seo|social|lead gen|email|analytics|growth/i],
  ["Business & Finance", /business|financ|startup|operations|support/i],
  ["Bundles & Deal Sites", /bundle/i],
  ["Productivity", /productiv|notes|task|focus|writing|todo|planning|automation/i],
  ["Health & Lifestyle", /health|fitness|lifestyle|travel|home|navigation|hobby/i],
  ["Mac & Desktop Utilities", /mac|desktop|menu bar|window|clipboard|utilit/i],
];
export const guessCategory = (path: string): Category => GUESS.find(([, re]) => re.test(path))?.[0] ?? "Productivity";
