# CHOPPERS · Barber booking selector

A mobile-first, Square-powered booking selector for Choppers Barbers, 210 Bermondsey Street, London SE1.

## What is built

- **Any Barber** always appears first.
- Real current Choppers barber names and Square profile photos: **Liri, Marouan, Nick, Victor**.
- Tap Any Barber or a named barber; one **Book Appointment** button opens a dropdown: **Square Appointments (Mon–Fri)** or **SimplyBook (Saturday)**. Both destinations use the selected barber, with official general links for Any Barber.
- Owner-only **/admin** screen reorders staff using arrows or desktop drag-and-drop and can update existing staff-specific Square booking URLs. Any Barber stays at the top.
- With Supabase configured, changes save centrally and appear for every visitor. No Square API key is required for this link-based solution.
- Styling follows Choppers branding. The website itself is independent of the WordPress Choppers site.

## Verified general booking link
https://book.squareup.com/appointments/zqexq32vqp1hkn/location/LDBX5380WHX98/services

**Update 2 November 2026:** The official Choppers website publishes individual Square links under "BOOK [NAME] → BOOK MON–FRI". All four are now preconfigured in the app:

- liri: https://squareup.com/appointments/book/5b02w9466dexxu/LDBX5380WHX98/services
- marouan: https://squareup.com/appointments/book/ycy9pbpbxlrgy8/LDBX5380WHX98/services
- nick: https://squareup.com/appointments/book/yqs1tx0qnxicha/LDBX5380WHX98/services
- victor: https://book.squareup.com/appointments/cqxqe8k9vaad1m/location/LDBX5380WHX98/services

Choppers currently uses SimplyBook for Saturday appointments. The page therefore includes a separate Saturday button, using these published Saturday links:

- liri: https://choppersbarbers.simplybook.it/v2/#book/provider/4
- marouan: https://choppersbarbers.simplybook.it/v2/#book/provider/5
- nick: https://choppersbarbers.simplybook.it/v2/#book/provider/10
- victor: https://choppersbarbers.simplybook.it/v2/#book/provider/3

**Note:** The links are confirmed as published for these barbers on Choppers' website. Before release, test each booking link in Square and SimplyBook, including service/availability and any barber-preselection behaviour.

## 1. Deploy through Vercel
1. In Vercel select **Add New → Project → Import Git Repository** and choose **genti20000/chjoppppppp**.
2. Use the repository root as Root Directory. Framework preset: **Other**. No build command or output directory needed.
3. Deploy. Public booking page: / ; owner admin: /admin.

## 2. Enable owner login and permanent order
1. Create/use a Supabase project. In its SQL Editor run **schema.sql**.
2. In Vercel → Project → Settings → Environment Variables add:

   ADMIN_PASSWORD = a unique strong password (never commit)
   SESSION_SECRET = a random 32+ character secret (never commit)
   SUPABASE_URL = https://YOURPROJECT.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = project service_role credential (keep private)

3. Redeploy after setting variables.
4. Open /admin, log in, reorder with ↑ / ↓ or drag, optionally paste Square links, click **Save changes**.
5. Open the public homepage in a different browser and verify the new order.

If Supabase is not configured, the booking page still works with the default order and general Square link, but **admin saves will be rejected**. If ADMIN_PASSWORD or SESSION_SECRET is missing, the admin login is disabled. No secrets are embedded in JavaScript or GitHub.

## 3. Get one-barber Square booking links
Square Dashboard → **Appointments → Online Booking → Advanced Widget → Create New Widget for Location**.
- Create a widget restricted to Liri, one for Marouan, one for Nick, one for Victor.
- Include the services each barber offers.
- Save and copy each widget's public booking URL (or extract the Square appointment URL from the embed code).
- In /admin paste that URL against the right barber and Save.
- Test each button in an incognito mobile browser. The link must actually restrict the booking to the selected barber.

Official Square instructions:
https://squareup.com/help/gb/en/article/5355-set-up-online-booking-with-square-appointments

## 4. Put it on the existing Choppers site
Add a WordPress link/button to your new Vercel domain (e.g. /book or book.choppersbarbers.co.uk).
Only change the current WordPress booking button after you have verified the new site and all links.

## Notes
- **Any Barber** is the default selection and offers the general Square booking page for Mon–Fri and the general SimplyBook page for Saturday. Square may still require customers to choose “Any staff” within its own booking flow. That internal selection cannot be skipped reliably with the public link.\n- The dropdown is one button, then two provider choices. There is no duplicate booking button.
- This app does not edit Square's own internal staff order. It controls only the staff order on your custom page.
- Staff are currently hardcoded from the verified live Square Haircut service as of 1 November 2026; if Square's staff changes, update this source or add an API sync.
- Genuine photos are loaded from Square's public CDN. If Square changes those URLs, photos may need updating.
- Security: service-role key is server-only; cookie is HttpOnly/SameSite; links are restricted to HTTPS Square hostnames. Use HTTPS, a strong owner password, and rate limiting at the Vercel/edge layer for production.
- Password-based login is a small-project convenience; for multiple admins, replace with proper identity-based authentication.
- No appointment or customer data is copied into this site. All actual bookings are completed on Square.
