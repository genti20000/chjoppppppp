# Choppers · Automatic Any Barber booking

Updated 2 November 2026.

## What was built

- Public selector /: Any Barber, Liri, Marouan, Nick, Victor, as before.
- Any Barber + Square (Mon-Fri) now opens /any, a custom Square API booking page.
- Named barber Square direct links remain unchanged.
- The Saturday option still uses the existing SimplyBook provider links.
- Owner /admin still reorders barber display on our custom page.
- When Square credentials are not configured, /any shows the regular Square booking link rather than pretending the API works.

## Customer flow

Choose a bookable service -> choose weekday/date -> search actual Square slots for Liri, Marouan, Nick and Victor -> select time -> enter first name/surname/email/mobile -> pass security check -> confirm -> show Square booking ID and assigned barber.

The server uses Square Catalog, team booking profiles, SearchAvailability, CreateCustomer and CreateBooking. Time-slot tickets are signed with an HMAC and expire after 10 minutes. The Square access token is never sent to the browser. Idempotency keys prevent duplicate booking writes on retry.

## Configure on Vercel (Project -> Settings -> Environment Variables)

Set ALL of the following server-side:

- SQUARE_ANY_BOOKING_ENABLED = true (turn on after test)
- SQUARE_ACCESS_TOKEN = a properly authorized Choppers Square access token, never committed
- SQUARE_LOCATION_ID = LDBX5380WHX98 (verify this location in Square)
- SQUARE_SLOT_SIGNING_SECRET = unique random string, at least 32 characters
- TURNSTILE_SITE_KEY = Cloudflare Turnstile site key for the Vercel/custom domain
- TURNSTILE_SECRET_KEY = Cloudflare Turnstile secret key
- SQUARE_ENVIRONMENT = production (or sandbox when using sandbox token/location)

Redeploy after adding variables. No access token has been configured by this project build.

Square OAuth scopes (seller-level): APPOINTMENTS_READ, APPOINTMENTS_ALL_READ, APPOINTMENTS_WRITE, APPOINTMENTS_ALL_WRITE, APPOINTMENTS_BUSINESS_SETTINGS_READ, ITEMS_READ, CUSTOMERS_WRITE. Personal access tokens must also have appropriate account access.

Seller-level CreateBooking requires Square Appointments Plus or Premium, not merely any paid Square POS plan. Verify the specific plan and privileges.

Square documentation:
https://developer.squareup.com/docs/bookings-api/use-the-api
https://developer.squareup.com/reference/square/bookings/search-availability
https://developer.squareup.com/reference/square/bookings/create-booking
https://developer.squareup.com/reference/square/bookings/list-team-member-booking-profiles

## Important restrictions

- Automatic booking operates Monday-Friday. Saturday remains on SimplyBook.
- Only Square bookable team profiles matching Liri, Marouan, Nick and Victor are considered. The Square names must match.
- No payment/card is collected by this flow. Square's Bookings API cannot create bookings for services with nonzero no-show or cancellation fees. Confirm the shop's service/payment rules before enabling this integration.
- Enforce WAF rate limiting for /api/any endpoints in Vercel; Turnstile is required for confirmation.
- Booking and customer records are written to Square only after explicit customer submission.
- Never tell customers a booking succeeded unless Square returned a booking ID.

## Production acceptance checklist

1. First configure with a Square sandbox token and sandbox location, and four corresponding sample bookable team members.
2. Verify a service loads and available weekday slots are returned.
3. Test a completed booking and confirm EXACTLY ONE booking appears in Square.
4. Test double submission, invalid or expired slot, fully booked slot, failed CAPTCHA and network error.
5. Check time zones around UK daylight saving changes.
6. Then configure production, Cloudflare Turnstile and Vercel Firewall, re-test, and link the live Choppers site.

## Admin controls

The owner editor is at /admin. It requires ADMIN_PASSWORD and SESSION_SECRET in Vercel. Permanent saving requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, plus running schema.sql in Supabase. This is separate from the Square API: without Supabase, visitors still see the default display order.

## Deployment

Import https://github.com/genti20000/chjoppppppp in Vercel (framework preset Other), root directory /. Pages are /, /any and /admin; APIs are in /api/any/*.js. Production credentials are not currently set in this code.
