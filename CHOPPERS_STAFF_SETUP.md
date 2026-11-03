# Choppers Staff App: secure appointments, masked calling, Square Register payments

Built 2 November 2026. Repository: https://github.com/genti20000/chjoppppppp

## What is included

- **/staff**: responsive interactive Day/Week/Month calendar. **Day view** can show all four barbers side by side for signed-in staff, or an individual barber. **Week and Month** remain single-barber views. Day/Week timelines zoom to **15 / 30 / 60-minute ticks**. Month shows daily counts and service snippets. The calendar API carries booking times, service, barber, reference price and **only the customer's first name + surname initial**. Full contact details and masked phone/email hints are absent until a staff member clicks an appointment. Full phone/email, customer ID, full surname and notes never reach the staff browser.
- **Call Customer**: server checks the authenticated barber owns the booking, fetches the customer number privately from Square, then uses Twilio to ring the barber's registered phone and bridge the customer. Both legs use a Choppers business caller ID. No customer number appears in the browser, HTML, links or server response. No recording by default.
- **Square Register**: staff use their own restricted Square Register PIN to charge cards on the existing dual-screen hardware. This app does NOT charge customers or mark transactions paid. Staff see reference service prices only.
- **/staff/owner**: owner-only staff provisioning, protected by the existing /admin owner login. Create each barber's account, register callback number, disable access, rotate passwords. Passwords are generated once and stored salted using scrypt.
- **/admin**: existing barber display-order admin preserved. Link to owner staff management added.
- Staff sessions expire after 8 hours, are HttpOnly, SameSite=Strict, Secure on Vercel, and are revoked immediately when owner resets the password or disables an account.
- Every masked call is checked server-side for staff membership, booking ownership, a relevant booking window, and a DB-enforced cap of three attempts per hour per booking. Account logins are rate-limited in the database. Owner can view high-level call metadata and Twilio logs, but browser staff never receive customer contact info.

## Activation requirements (the app is not live until these are configured)

**Choppers database selection: Malandra** (`kzdkvaoxadpvqezbusax`). This is the owner-specified separate Supabase project. Do not use the connected `gent's projects` database for Choppers. Access to Malandra through this chat's Supabase connector is currently unavailable; it may be connected separately through Codex MCP.

1. In the owner-specified Malandra Supabase project (`kzdkvaoxadpvqezbusax`), run **staff-schema.sql** in SQL Editor. If using it to save public barber order as well, also run **schema.sql**. Do not run either SQL script in `gent's projects`.
2. In Vercel project **chjoppppppp** -> Settings -> Environment Variables add:
   - SUPABASE_URL = https://kzdkvaoxadpvqezbusax.supabase.co (already set in Choppers Vercel production).
   - SUPABASE_SERVICE_ROLE_KEY = the **Malandra** project's private service-role key (not connected yet; never put this in client JS, GitHub or chat).
   - SESSION_SECRET = already configured for the admin project. Keep private.
   - ADMIN_PASSWORD = already configured for the owner admin.
3. For appointment read-only integration, add:
   - SQUARE_ACCESS_TOKEN = authorized Choppers seller Square token.
   - SQUARE_LOCATION_ID = the verified Square location ID (Choppers' published booking URLs contain LDBX5380WHX98).
   - SQUARE_ENVIRONMENT = production (optional; sandbox while testing).
   - Needed Square scopes: APPOINTMENTS_READ and APPOINTMENTS_ALL_READ for seller booking details, APPOINTMENTS_BUSINESS_SETTINGS_READ for bookable team profiles, CUSTOMERS_READ for private customer numbers, ITEMS_READ for service labels and reference prices. Verify API access for Choppers' paid Square plan.
4. For masked phone calling, add:
   - TWILIO_ACCOUNT_SID = your Twilio account SID, starts AC
   - TWILIO_AUTH_TOKEN = server-only Twilio auth token
   - TWILIO_CALLER_ID = **Choppers' existing business telephone number**, after verifying it as an Outgoing Caller ID in Twilio, in +44 format. Alternatively use a Twilio-owned voice number. The old TWILIO_PHONE_NUMBER variable remains supported.
   - Create and fund a Twilio account; verify the existing Choppers business number as an outgoing caller ID. A second Twilio phone number is not required for this outbound-only workflow. Incoming callbacks to the existing shop number continue through the existing phone provider. Both outgoing call legs incur Twilio usage charges. A trial account may only call verified destination numbers.
5. Redeploy the Vercel project so the environment variables are loaded. For testing, keep access behind Vercel deployment authentication, then enable staff access on the designated private domain once ready.
6. Sign in to **/admin** using the owner password, then open **/staff/owner**. Create the barber accounts with each barber's mobile number. Copy the *one-time* password for each barber and share individually using a secure channel. The password will never be shown again. Change or disable accounts from this screen.
7. Ask each barber to sign in at **/staff** on their own phone. They should see ONLY their own Square appointments. Never share the owner admin password with barbers.

## Quick Twilio activation (outbound-only, no new number required)

1. Create an account at https://www.twilio.com/try-twilio and enable Programmable Voice. Add billing/upgrade if required for production calls to unverified customer numbers.
2. Open Twilio Console > Phone Numbers > Verified Caller IDs and verify **Choppers' existing, answerable business telephone number** by completing Twilio's voice verification challenge.
3. In Vercel set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_CALLER_ID (in +44 E.164 format). These must be encrypted environment variables. Do not paste any credentials into chat or GitHub.
4. Staff call flow: Twilio first rings the staff member's owner-registered mobile, then bridges to the actual customer. Each leg uses the verified Choppers caller ID. The customer and barber can both see Choppers' number, not each other's private numbers.
5. Confirm business caller-ID presentation and real calls on UK networks before switching the calling feature on for staff. The caller-ID presentation depends on carriers and cannot be absolutely guaranteed.

Sources: https://help.twilio.com/articles/223132667-Do-I-have-to-buy-a-phone-number-to-make-outgoing-calls and https://www.twilio.com/docs/voice/api/call-resource.

## Payment security on the dual-screen Square Register

Your hardware looks like Square Register, not a Square Terminal. Payments stay on the existing Square Register, no additional payment integration is needed.

Owner should create a restricted Square permission set for each barber's Register PIN. It must allow:
- POS checkout, taking card payment and refunds only where authorized.
- No Customer Directory / customer exports.
- No Square Appointments customer profiles.
- No administrative access, customer list downloads, or detailed transactions exposing customer information.

**Test this on the actual Register with the staff PIN** before claiming that customer details are inaccessible. Square UI permissions may not hide every piece of identifying transaction data. A custom web app cannot stop someone who has unrestricted access to Square itself.

## Safety and privacy checklist

- Keep all Square, Supabase and Twilio tokens as encrypted server-side Vercel environment variables.
- Use separate barbers' individual accounts; share neither the owner password nor the Square API tokens with staff.
- Calendar API responses contain **only first name + surname initial** as customer identification, never phone digits, email prefixes, complete numbers, complete addresses, customer IDs or notes. An authenticated staff member can **open** any Choppers appointment in the Day side-by-side view and receive only masked customer hints through a separate endpoint. A barber can initiate a masked call **only for bookings assigned to that barber**. Other staff never receive full PII. The browser has no phone/email links or raw profile fields.
- Twilio presents the company number on both call legs. A customer who independently tells a barber their number, or a barber who can access customer details through Square Register/other systems, is outside this app's control.
- Calls are not recorded by this application. Check Twilio and carrier-level settings separately.
- Store minimal call audit records without customer numbers or emails. Review retention and UK GDPR requirements and add a written staff privacy policy.
- Login throttling and per-booking call limits use atomic SQL functions. Add Vercel WAF-level throttling as defense in depth.
- If a masked-call request times out, check Twilio before retrying; the call may already have been placed.
- The service reference price is not a payment instruction; the final price on Square Register is authoritative.

## Test before going live

- Create a dedicated Choppers Supabase project, execute staff-schema.sql, check its RLS/grants and the RPC functions.
- Provision an actual barber user and check login/logout/disable/rotate.
- Using a seller-authorized Square token, verify each staff account maps uniquely to one of Liri, Marouan, Nick or Victor in Square booking profiles.
- Verify bookings appear for the right staff member; cross-barber booking IDs are rejected by /api/staff/call.
- Confirm full customer emails, surnames, phone numbers, IDs and notes never appear in frontend API responses or browser dev tools; only permitted masked hints appear. Verify the Square token has CUSTOMERS_READ. Without that permission the calendar still loads, but customer hints show as unavailable.
- Test a masked call from the barber's registered phone. The barber and customer should both see the Choppers business caller ID. Confirm no recording.
- Check unsuccessful customer phone and rate limit handling.
- Test restricted Square Register staff PIN at the physical shop for checkout and blocked customer directory access.
- Check mobile layouts and Vercel deployment protection for the private staff domain.

The new GitHub test suite contains **test/staff.test.js**, with privacy, role-scoping, session revocation and mocked Twilio bridging checks, plus the existing Square booking tests. Use npm test after obtaining a working local checkout. GitHub Actions on this repository are currently blocked by a billing lock, so the test suite has not run in GitHub CI.

### Current delivery status

The source files are committed and Vercel builds are automatic. This is a **secure implementation pending connections**, NOT a working or verified live masked-call system. No live Square customer data has been read, no actual calls have been made, and no paid calls have been initiated.

## Staff customer recognition (3 November 2026)

Calendar name hints are generated **server-side** from Square's `BulkRetrieveCustomers` API (100 per request), after filtering bookings to the four Choppers barbers and the selected date range. Phone and email hints are requested separately only after opening a booking. Each appointment displays a first name and surname initial (e.g. **James S.**), phone last three digits (**••• 123**) and email local part first three characters (**jam•••**, with the entire domain hidden). No full email, full phone, Square customer ID or private customer note is serialized into the staff response. If customer records or the `CUSTOMERS_READ` permission are missing, identifiers safely fall back to **unavailable**, without breaking the appointment schedule. The owner must still restrict employee access to Square Customer Directory and Square Register customer views separately.

## Choppers responsive scheduling update (3 November 2026)

- Mobile: Day defaults to the logged-in barber; choose **All barbers** to swipe between horizontally scrollable barber lanes. Calendar date picker, previous/next navigation, Today, refresh, and a responsive bottom-sheet appointment detail.
- iPad/desktop: Day defaults to **All barbers, side by side**, with a sticky time ruler and distinct barber colours. Detail opens as a right-hand slide-over.
- **Zoom 15m, 30m, 60m** changes the time grid and appointment height instantly, with no extra Square API call.
- Week: choose one barber and scroll through seven daily columns; tap an appointment for details.
- Month: choose one barber, view a compact 7-column overview and select a day to drill into Day.
- Staff can view all four barbers' booking times, services and first name + surname initial in Day view. Calendar customer lookup yields **only the abbreviated name**. An explicit appointment click triggers a separate server-side lookup for last-three phone digits and first-three email letters. Only the assigned barber can initiate a masked call.
- Square Bookings API supplies appointment entries, but unavailability, staff breaks and time-off blocks shown in Square Calendar are **not assumed to be included**. No synthetic unavailable periods are created.
- APIs: `GET /api/staff/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD&barber=all|liri|marouan|nick|victor` (anonymous listing) and `GET /api/staff/calendar?id=BOOKING_ID` (explicit clicked booking detail, with masked customer hints). Both require staff login. The old `/api/staff/appointments` endpoint has been revised to return only anonymous calendar summaries, preventing masked details from being fetched before a click.
- `test/staff-calendar.test.js` checks first-name-plus-initial listings (no email/phone), server-enforced Day-only all-barber restriction, single-barber date scopes, and masked data on detail. Full customer data remains server-side.

**Release test:** Sign in with a real barber account on an iPad and mobile, compare with Square bookings, then open an appointment and inspect the Network tab. The calendar endpoint must show **first name + initial only**; the clicked appointment endpoint may additionally return the permitted masked phone and email hints. Confirm Square staff access restrictions separately.

**Vercel Hobby adjustment:** Calendar listing and clicked appointment details share the single serverless function `api/staff/calendar.js` to stay within the project's 12-function limit. The redundant `api/staff/appointment.js` function was removed. Both modes enforce staff authentication and respect their separate privacy contracts.

## Compact calendar controls and Fit Day (3 November 2026)

- On phones and iPad portrait, the calendar date and Day/Week/Month controls remain visible. The additional controls live inside an accessible **Options** menu, collapsed by default; it closes after selecting a barber, time scale, Fit Day or Refresh.
- In Day view **All barbers** is a simple toggle. When enabled, the individual barber selector disappears; when disabled, the selected barber can be changed. Week and Month show only the individual barber selection.
- Appointment blocks use **time + service on one line, first name + surname initial on the next**. Extremely short blocks collapse to one truncated line to avoid colliding with neighbouring bookings. Phone and email hints are displayed only upon opening the masked-details panel.
- **Fit day** dynamically scales the working-hour timeline to the available viewport height. The 15m / 30m / 60m zoom choices return to a manually readable scale. Very short bookings become compact in Fit Day mode; tap them for details.
- Full calendars can scroll horizontally on mobile. The all-barber Day view is available to employees, but masked calls remain restricted to the assigned barber.
