# Tools4Care Android Tap to Pay companion

Status: design and isolated implementation. Nothing in this document enables a
production payment flow.

## Non-negotiable rollout rules

1. The existing Tools4Care web/PWA and Stripe QR flow remain unchanged.
2. The Android companion is disabled by default per tenant.
3. A failed, cancelled, or unavailable companion flow returns to the existing
   Card options without recording a payment.
4. Stripe webhooks, not the phone, are the final authority for successful
   payments.
5. Tools4Care never stores PAN, CVC, track data, or NFC payloads.
6. A card is reusable only after explicit customer consent recorded before tap.

## Intended operator flow

1. Staff selects a Tools4Care customer and chooses **Card**.
2. When the feature flag is off, the current UI is unchanged.
3. When enabled on an approved Android device, Card options include **Tap to
   Pay**.
4. Tools4Care creates a short-lived terminal payment session containing the
   immutable customer, amount, sale/payment context, operator, van, and an
   idempotency key.
5. The Android companion opens through an app link. It never accepts a final
   amount from an unsigned deep-link parameter; it downloads the authoritative
   session after authenticating the operator.
6. The customer reviews the amount and chooses whether Stripe may retain a
   reusable payment method. Consent is stored with its text version, timestamp,
   operator, and device evidence.
7. Stripe Terminal takes over the screen for Tap to Pay.
8. The companion displays the result and returns automatically to Tools4Care.
9. A Stripe webhook reconciles the payment idempotently and triggers the same
   balance, score, allocation, and receipt behavior used by existing payments.

## Stripe customer matching

- Customers do not need to be created manually in Stripe.
- On first use, the server creates a Stripe Customer and stores the mapping in
  `stripe_customer_links`.
- Tools4Care `cliente_id` and `tenant_id` are placed in Stripe metadata.
- Matching never relies only on name, email, or phone because those values are
  not unique.

## Saved-card behavior

- The initial card-present PaymentIntent uses `setup_future_usage=off_session`
  only when the customer opted in.
- For supported physical cards, Stripe returns a reusable `generated_card`
  PaymentMethod.
- Tools4Care stores only Stripe identifiers and non-sensitive display fields:
  brand, last four digits, expiry, funding type, and consent link.
- Mobile wallets may not produce a reusable card suitable for redisplay. The UI
  must clearly report when the payment succeeded but no reusable card was saved.
- Future card-on-file charges are separate PaymentIntents with their own staff
  confirmation, audit record, idempotency key, receipt, and failure recovery.

## Android distribution

The pilot does not require a public Google Play listing. Use a signed,
non-debuggable APK installed on one authorized device. Production Tap to Pay
requires a compatible NFC Android device, current security patch, Google Mobile
Services, locked bootloader, unmodified OS, stable internet, and developer
options disabled. A private Play track can be added later for managed updates.

## Delivery gates

1. Database migration reviewed locally; not applied remotely.
2. Edge API authenticated and tested without real charges.
3. Android compatibility screen passes on the pilot phone.
4. Stripe simulated-reader payment passes.
5. One controlled live payment without saving passes.
6. One controlled live payment with consent and saving passes.
7. A second, explicitly approved saved-card charge passes.
8. Refund, decline, network interruption, duplicate callback, and webhook retry
   tests pass.
9. Only then enable the tenant feature flag for additional phones.

## Portal consent

The customer portal can collect advance consent and display/revoke saved cards.
That consent can be reused by the companion if it covers the intended purpose
and has not been revoked. The external Stripe Dashboard app cannot receive a
Tools4Care payment session or reliably attach its tap to the selected
Tools4Care customer, so portal consent alone does not remove the need for the
companion integration.
