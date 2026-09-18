-- Least-privilege grants for anonymous visitors.
revoke all on public.cms_categories,public.portfolio_projects,public.free_assets,public.commission_services,public.commission_forms,public.commission_requests,public.cms_pages,public.cms_navigation,public.site_settings,public.media from anon;

grant select on public.cms_categories,public.portfolio_projects,public.free_assets,public.commission_services,public.commission_forms,public.cms_pages,public.cms_navigation,public.site_settings,public.media to anon;
grant insert on public.commission_requests to anon;
