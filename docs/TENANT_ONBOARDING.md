# Tools4Care tenant onboarding

The platform administrator creates client workspaces from:

`Admin → New Tenant → /admin/new-client`

## Required deployment order

1. Apply `supabase/migrations/202607310001_tenant_onboarding.sql`.
2. Set the Edge Function secret `PUBLIC_APP_URL` to the public application
   origin, without a trailing slash (for example `https://tools4care.example`).
3. Add `https://your-domain/set-password` to the allowed Supabase Auth redirect
   URLs.
4. Deploy the `admin-users` Edge Function.
5. Deploy the web application.

Do not create a real tenant until all five steps are complete.

## Provisioned records

One successful request creates:

- an invited Supabase Auth user;
- a `tenants` record in `pending` state;
- an owner profile with operational supervisor permissions;
- an initial physical-store location;
- the owner's location assignment;
- default location settings;
- an emailed invitation and a backup one-time setup link.

If a database step fails, the function removes the records it created,
including the Auth user.

## Client activation

1. The owner opens the invitation or backup setup link.
2. Supabase redirects to `/set-password`.
3. The owner chooses a password of at least 10 characters.
4. The tenant becomes `active`.
5. The owner is sent to the workspace selector and sees only the assigned
   initial store.

## Platform operations

The New Tenant screen lists workspaces and allows the platform administrator
to:

- create a fresh setup link;
- suspend a workspace and deactivate its owner;
- reactivate a workspace.

The distinction between `platform_admin` and a tenant owner is intentional.
Legacy `rol = admin` policies are platform-wide, so new tenant owners use the
restricted `supervisor` role until all legacy business tables have tenant-keyed
RLS policies.
