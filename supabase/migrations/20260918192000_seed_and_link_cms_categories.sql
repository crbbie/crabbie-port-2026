-- Seed editable CMS categories and link existing records to them.
insert into public.cms_categories (kind, slug, title, published, sort_order)
values
  ('portfolio','illustration','Illustration',true,0),
  ('portfolio','chibi','Chibi',true,1),
  ('portfolio','vtuber','VTuber',true,2),
  ('portfolio','other','Other',true,3),
  ('portfolio','merch-illustration','Merch / Illustration',true,4),
  ('portfolio','merch-design','Merch Design',true,5),
  ('portfolio','comic','Comic',true,6),
  ('portfolio','illustration-event','Illustration / Event',true,7),
  ('portfolio','comic-illustration','Comic / Illustration',true,8),
  ('portfolio','commercial-illustration','Commercial Illustration',true,9),
  ('asset','brushes','Brushes',true,0),
  ('asset','elements','Elements',true,1),
  ('asset','stickers','Stickers',true,2),
  ('asset','frames','Frames',true,3),
  ('asset','vectors','Vectors',true,4),
  ('asset','textures','Textures',true,5),
  ('asset','audio','Audio',true,6),
  ('asset','other','Other',true,7)
on conflict (kind, slug) do update
set title = excluded.title,
    published = excluded.published,
    sort_order = excluded.sort_order;

update public.portfolio_projects p
set category_id = c.id,
    content = jsonb_set(coalesce(p.content,'{}'::jsonb), '{categorySlug}', to_jsonb(c.slug), true)
from public.cms_categories c
where c.kind = 'portfolio'
  and lower(c.title) = lower(coalesce(p.content->>'cat',''));

update public.free_assets a
set category_id = c.id,
    metadata = jsonb_set(coalesce(a.metadata,'{}'::jsonb), '{categorySlug}', to_jsonb(c.slug), true)
from public.cms_categories c
where c.kind = 'asset'
  and c.slug = lower(coalesce(a.metadata->>'cat',''));
