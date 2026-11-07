# True Value Realty

Static True Value Realty website and Supabase-backed property administration, extended with an integrated real estate CRM. The public property catalogue, existing Supabase Auth flow, property image bucket, and property editor remain in place. The CRM uses the existing `properties` table; lead records can reference a specific property with `leads.property_id`.

## Architecture audited

- Public pages: `index.html`, `properties.html`, `property.html`; the about/contact/privacy-policy pages redirect to the corresponding existing sections/pages.
- Static hosting: Cloudflare Pages, no build step.
- Browser code: vanilla JavaScript and shared `assets/css/styles.css`.
- Supabase client: `assets/js/config.js` and `assets/js/supabase-client.js`, using the public publishable/anon key only.
- Existing data: `admin_users`, `properties`, `property_images`; `property-images` Storage bucket.
- Existing admin listing editor: `admin/properties.html` and `assets/js/admin.js`.
- CRM dashboard: `admin/index.html` and `assets/js/crm.js`.
- Existing property schema and storage are not dropped or recreated by the CRM migration.

## Supabase setup

1. Keep the current Supabase project. In SQL Editor, run the existing `supabase-setup.sql` only if this is a new project and those baseline tables do not exist. Do not rerun a modified or destructive schema over an existing installation.
2. Run `supabase/migrations/202611070001_crm.sql` after the baseline schema exists. It is additive and preserves existing property/auth records. Existing `admin_users` rows become active owners by default to retain access. Review the team and change each non-owner role in the Team Management screen.
3. Deploy the two Supabase Edge Functions in `supabase/functions/`:

   ```sh
   supabase link --project-ref YOUR_PROJECT_REF
   supabase functions deploy public-enquiry --no-verify-jwt
   supabase functions deploy admin-invite
   ```

   Supabase injects the project URL and server-side key into Edge Functions. Do not try to create a custom secret whose name starts with `SUPABASE_`; that prefix is reserved. Set `SITE_URL` as a Function secret to your deployed website origin (for example `https://example.com`) so invitation links return to `/admin/login.html`. Never put a service-role/secret key in `assets/js/config.js` or any static website file.

4. In Supabase Auth settings, turn off public sign-ups, configure the deployed site URL and allowed redirect URLs, and confirm invitation and password reset email delivery.
5. Keep the existing `property-images` bucket and storage policies. No CRM migration touches property images.
6. Verify `assets/js/config.js` has the intended project URL and public anon/publishable key. `SITE_URL` should be your deployed domain.

### First owner

The CRM migration makes existing allowlist rows owners. For a new installation, create the first user in Supabase Auth, then insert that user's UUID into `public.admin_users` with `role='owner'` (the initial insert is trusted administrator setup). Do not create additional Auth users through browser-side sign-up. Owners add team members from **Team Management**; the `admin-invite` Edge Function sends an Auth invitation and inserts the selected non-owner role. Passwords are never stored in CRM tables.

## Admin use

- Sign in at `/admin/login.html`.
- The CRM opens at `/admin/index.html`.
- Use **Properties** in the sidebar to reach the existing property editor (`/admin/properties.html`).
- Add a lead and choose its **Property of interest** from the existing catalogue. The CRM stores the foreign key in `leads.property_id`.
- Website enquiries submit through `public-enquiry`, which validates fields, applies a per-IP hourly limit, and inserts a `Website` lead. It accepts a published property ID, so detail-page enquiries can be linked to a listing.
- Lead assignment, follow-up/visit/deal actions, status changes, and conversion activity are written by database triggers. Follow-up scheduling maintains the lead's next due date.
- Currency is INR; date formatting uses Asia/Kolkata.

## Roles and security

RLS is enabled on all CRM data tables. Owners and managers can read team records; sales executives can read records assigned to them. Owner-only team administration is checked in RLS and again in the invitation Edge Function. Activity records are append-only to authenticated clients. Anonymous clients cannot query or insert CRM tables. The public enquiry Edge Function is the only public intake path and does not return internal records.

Deal financial figures are stored in `deal_financials`, a separately protected table that only owners and managers can read or write. Sales executives can move their assigned deal through the pipeline without access to financial amounts.

## Cloudflare Pages

Upload the static project contents to Cloudflare Pages. No build command is required. Keep the Supabase Edge Functions deployed separately on Supabase; Cloudflare Pages does not host those function endpoints. Do not deploy secrets with the static assets.

## Verification

Static syntax and structure checks can be run locally. Live role/RLS, Auth invitations, database triggers, Edge Function rate limits, enquiry inserts, and Storage behavior must be verified against the configured Supabase project using test accounts for owner, manager, and sales executive. Do not use production customer data for permission probes.
