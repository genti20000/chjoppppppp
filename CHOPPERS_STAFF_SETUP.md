# Choppers Staff App: secure appointments, masked calling, Square Register payments

Built 2 November 2026. Repository: https://github.com/genti20000/chjoppppppp

## What is included

- **/staff**: mobile-first staff-only login and schedule. Each barber sees only bookings in their own Square calendar. Each appointment shows time, duration, service and reference price. The API deliberately does NOT return customer name, phone, email, customer ID, or booking notes.
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
- Square customer info stays on server; browser gets only date/time, service, duration, reference price, booking ID and status.
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
- Confirm customer email, full name and phone never appear in frontend API responses or browser dev tools.
- Test a masked call from the barber's registered phone. The barber and customer should both see the Choppers business caller ID. Confirm no recording.
- Check unsuccessful customer phone and rate limit handling.
- Test restricted Square Register staff PIN at the physical shop for checkout and blocked customer directory access.
- Check mobile layouts and Vercel deployment protection for the private staff domain.

The new GitHub test suite contains **test/staff.test.js**, with privacy, role-scoping, session revocation and mocked Twilio bridging checks, plus the existing Square booking tests. Use npm test after obtaining a working local checkout. GitHub Actions on this repository are currently blocked by a billing lock, so the test suite has not run in GitHub CI.

### Current delivery status

The source files are committed and Vercel builds are automatic. This is a **secure implementation pending connections**, NOT a working or verified live masked-call system. No live Square customer data has been read, no actual calls have been made, and no paid calls have been initiated.
