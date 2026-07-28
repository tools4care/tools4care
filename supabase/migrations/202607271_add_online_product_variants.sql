-- Group SKUs (different UPC per color/size) into a single online storefront
-- listing. Additive only: existing rows get NULL variant_group_id, meaning
-- "not grouped" — no behavior change for products that aren't linked.
alter table online_product_meta
  add column if not exists variant_group_id uuid,
  add column if not exists variant_label text,
  add column if not exists variant_axis text;

create index if not exists online_product_meta_variant_group_idx
  on online_product_meta (variant_group_id) where variant_group_id is not null;
