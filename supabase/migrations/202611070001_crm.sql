-- True Value Realty CRM extension. Additive only: existing property, image and auth data is retained.
create extension if not exists pgcrypto;

alter table public.admin_users add column if not exists role text not null default 'owner'
  check (role in ('owner','manager','sales_executive'));
alter table public.admin_users add column if not exists full_name text;
alter table public.admin_users add column if not exists is_active boolean not null default true;
alter table public.admin_users add column if not exists updated_at timestamptz not null default now();

create or replace function public.crm_keep_active_owner()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
 if old.role='owner' and old.is_active and (tg_op='DELETE' or new.role<>'owner' or not new.is_active)
    and not exists(select 1 from public.admin_users where role='owner' and is_active and user_id<>old.user_id) then
  raise exception 'At least one active owner must remain in the workspace';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_crm_keep_active_owner on public.admin_users;
create trigger trg_crm_keep_active_owner before update or delete on public.admin_users for each row execute function public.crm_keep_active_owner();

create or replace function public.crm_role()
returns text language sql stable security definer set search_path = public, pg_temp
as $$ select role from public.admin_users where user_id = auth.uid() and is_active $$;
-- Keep the legacy property admin's is_admin() gate compatible while respecting active roles.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists(select 1 from public.admin_users where user_id=auth.uid() and is_active and role in ('owner','manager')) $$;
create or replace function public.crm_can_manage_team()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.crm_role() = 'owner', false) $$;
create or replace function public.crm_can_manage_team_records()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select coalesce(public.crm_role() in ('owner','manager'), false) $$;
create or replace function public.crm_can_access_user(target uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select target = auth.uid() or public.crm_can_manage_team_records() $$;

create table if not exists public.clients (
 id uuid primary key default gen_random_uuid(), full_name text not null,
 phone text, whatsapp text, email text, address text, preferred_locations text[],
 budget_min numeric(14,2), budget_max numeric(14,2), property_preferences text[],
 transaction_type text check (transaction_type in ('Buying','Renting')),
 assigned_user uuid references public.admin_users(user_id) on delete set null,
 client_type text not null default 'Buyer' check (client_type in ('Buyer','Seller','Tenant','Landlord','Investor')),
 status text not null default 'Active' check (status in ('Active','Inactive','Converted','Archived')),
 notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.leads (
 id uuid primary key default gen_random_uuid(), full_name text not null,
 phone text, whatsapp text, email text, source text not null default 'Other'
   check (source in ('Website','Instagram','Facebook','Google Ads','Referral','Walk-in','Phone Call','WhatsApp','Other')),
 interested_in text, property_type text, preferred_location text,
 budget_min numeric(14,2), budget_max numeric(14,2), transaction_type text check (transaction_type in ('Buying','Renting')),
 assigned_user uuid references public.admin_users(user_id) on delete set null,
 priority text not null default 'Warm' check (priority in ('Hot','Warm','Cold')),
 status text not null default 'New' check (status in ('New','Contacted','Interested','Qualified','Site Visit Scheduled','Negotiation','Converted','Lost')),
 notes text, client_id uuid references public.clients(id) on delete set null,
 property_id uuid references public.properties(id) on delete set null,
 last_contact_at timestamptz, next_follow_up_at timestamptz,
 created_by uuid references public.admin_users(user_id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.client_properties (
 client_id uuid not null references public.clients(id) on delete cascade,
 property_id uuid not null references public.properties(id) on delete cascade,
 interest_status text not null default 'Interested', notes text,
 created_at timestamptz not null default now(), primary key(client_id,property_id)
);
create table if not exists public.follow_ups (
 id uuid primary key default gen_random_uuid(), lead_id uuid references public.leads(id) on delete cascade,
 client_id uuid references public.clients(id) on delete cascade,
 assigned_user uuid references public.admin_users(user_id) on delete set null,
 follow_up_at timestamptz not null, follow_up_type text not null default 'Phone Call'
   check (follow_up_type in ('Phone Call','WhatsApp','Email','Meeting','Other')),
 reminder boolean not null default false,
 status text not null default 'Pending' check (status in ('Pending','Completed','Missed','Rescheduled','Cancelled')),
 notes text, outcome text, created_by uuid references public.admin_users(user_id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (lead_id is not null or client_id is not null)
);
create table if not exists public.site_visits (
 id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id) on delete set null,
 lead_id uuid references public.leads(id) on delete set null,
 property_id uuid references public.properties(id) on delete set null,
 assigned_user uuid references public.admin_users(user_id) on delete set null,
 visit_at timestamptz not null, visit_location text, client_requirements text,
 status text not null default 'Scheduled' check (status in ('Scheduled','Confirmed','Completed','Rescheduled','Cancelled','No Show')),
 feedback text, notes text, created_by uuid references public.admin_users(user_id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.deals (
 id uuid primary key default gen_random_uuid(), client_id uuid references public.clients(id) on delete set null,
 lead_id uuid references public.leads(id) on delete set null,
 property_id uuid references public.properties(id) on delete set null,
 assigned_user uuid references public.admin_users(user_id) on delete set null,
 title text not null, expected_close_date date, actual_close_date date,
 stage text not null default 'New Opportunity' check (stage in ('New Opportunity','Qualified','Property Shortlisted','Site Visit Completed','Negotiation','Token Received','Documentation','Deal Won','Deal Lost')),
 lost_reason text, internal_notes text,
 created_by uuid references public.admin_users(user_id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Financial values live separately so sales executives cannot read or alter them through PostgREST.
create table if not exists public.deal_financials (
 deal_id uuid primary key references public.deals(id) on delete cascade,
 expected_deal_value numeric(14,2), closed_deal_value numeric(14,2),
 brokerage_percent numeric(6,3) check (brokerage_percent between 0 and 100),
 expected_brokerage numeric(14,2), earned_brokerage numeric(14,2), received_brokerage numeric(14,2),
 payment_status text not null default 'Pending' check (payment_status in ('Pending','Partially Received','Received','Not Applicable')),
 payment_notes text, updated_at timestamptz not null default now()
);
create table if not exists public.activities (
 id uuid primary key default gen_random_uuid(), lead_id uuid references public.leads(id) on delete set null,
 client_id uuid references public.clients(id) on delete set null,
 property_id uuid references public.properties(id) on delete set null,
 deal_id uuid references public.deals(id) on delete set null,
 actor_id uuid references public.admin_users(user_id) on delete set null,
 activity_type text not null, description text not null, created_at timestamptz not null default now()
);
create table if not exists public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.admin_users(user_id) on delete cascade,
 activity_id uuid references public.activities(id) on delete cascade,
 title text not null, body text, read_at timestamptz,
 created_at timestamptz not null default now(), unique(user_id, activity_id)
);
create table if not exists public.public_enquiry_limits (
 key_hash text not null, window_start timestamptz not null, request_count integer not null default 0,
 primary key(key_hash,window_start)
);
alter table public.public_enquiry_limits enable row level security;
revoke all on public.public_enquiry_limits from anon, authenticated;
create or replace function public.claim_public_enquiry(client_ip text)
returns boolean language plpgsql security definer set search_path = public, pg_temp
as $$ declare k text; n integer; w timestamptz; begin
 if client_ip is null or length(client_ip)>128 then return false; end if;
 k := encode(digest(client_ip, 'sha256'),'hex'); w := date_trunc('hour',now());
 insert into public.public_enquiry_limits(key_hash,window_start,request_count) values(k,w,1)
 on conflict(key_hash,window_start) do update set request_count=public.public_enquiry_limits.request_count+1
 returning request_count into n;
 if n % 100 = 0 then delete from public.public_enquiry_limits where window_start < now() - interval '24 hours'; end if;
 return n <= 5;
end $$;
revoke all on function public.claim_public_enquiry(text) from public, anon, authenticated;
grant execute on function public.claim_public_enquiry(text) to service_role;

create or replace function public.crm_sync_next_followup()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ declare lid uuid; begin
 lid := coalesce(new.lead_id,old.lead_id);
 if lid is not null then
  update public.leads set next_follow_up_at=(select min(follow_up_at) from public.follow_ups where lead_id=lid and status='Pending') where id=lid;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists trg_followup_sync_lead on public.follow_ups;
create trigger trg_followup_sync_lead after insert or update or delete on public.follow_ups for each row execute function public.crm_sync_next_followup();

create or replace function public.crm_log_lead()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
 if tg_op='INSERT' then
  insert into public.activities(lead_id,property_id,actor_id,activity_type,description) values(new.id,new.property_id,coalesce(auth.uid(),new.created_by),'Lead created','Lead created from '||coalesce(new.source,'Other'));
 elsif old.assigned_user is distinct from new.assigned_user then
  insert into public.activities(lead_id,property_id,actor_id,activity_type,description) values(new.id,new.property_id,auth.uid(),'Lead reassigned','Lead assignment updated');
 elsif old.status is distinct from new.status then
  insert into public.activities(lead_id,property_id,actor_id,activity_type,description) values(new.id,new.property_id,auth.uid(),'Lead status changed',old.status||' → '||new.status);
 end if;
 return new;
end $$;
drop trigger if exists trg_crm_log_lead on public.leads;
create trigger trg_crm_log_lead after insert or update on public.leads for each row execute function public.crm_log_lead();

create or replace function public.crm_notify_lead_assignment()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ declare aid uuid; begin
 if new.assigned_user is not null and (tg_op='INSERT' or old.assigned_user is distinct from new.assigned_user) then
  select id into aid from public.activities where lead_id=new.id order by created_at desc limit 1;
  insert into public.notifications(user_id,activity_id,title,body) values(new.assigned_user,aid,
   case when tg_op='INSERT' then 'New lead assigned' else 'Lead reassigned' end,
   'Lead: '||new.full_name) on conflict(user_id,activity_id) do nothing;
 end if;
 return new;
end $$;
drop trigger if exists trg_crm_notify_lead on public.leads;
create trigger trg_crm_notify_lead after insert or update on public.leads for each row execute function public.crm_notify_lead_assignment();

create or replace function public.crm_log_followup()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
 if tg_op='INSERT' then insert into public.activities(lead_id,client_id,actor_id,activity_type,description) values(new.lead_id,new.client_id,coalesce(auth.uid(),new.created_by),'Follow-up scheduled','Follow-up scheduled for '||to_char(new.follow_up_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI'));
 elsif old.status is distinct from new.status and new.status='Completed' then insert into public.activities(lead_id,client_id,actor_id,activity_type,description) values(new.lead_id,new.client_id,auth.uid(),'Follow-up completed',coalesce(new.outcome,new.notes,'Follow-up completed'));
 end if; if tg_op='DELETE' then return old; else return new; end if; end $$;
drop trigger if exists trg_crm_log_followup on public.follow_ups;
create trigger trg_crm_log_followup after insert or update on public.follow_ups for each row execute function public.crm_log_followup();

create or replace function public.crm_notify_followup()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ declare aid uuid; begin
 if tg_op='INSERT' and new.reminder and new.assigned_user is not null then
  select id into aid from public.activities where lead_id=new.lead_id and client_id=new.client_id order by created_at desc limit 1;
  insert into public.notifications(user_id,activity_id,title,body) values(new.assigned_user,aid,'Follow-up scheduled',to_char(new.follow_up_at at time zone 'Asia/Kolkata','DD Mon HH24:MI')) on conflict(user_id,activity_id) do nothing;
 end if; return new;
end $$;
drop trigger if exists trg_crm_notify_followup on public.follow_ups;
create trigger trg_crm_notify_followup after insert on public.follow_ups for each row execute function public.crm_notify_followup();

create or replace function public.crm_log_visit()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
 if tg_op='INSERT' then insert into public.activities(lead_id,client_id,property_id,actor_id,activity_type,description) values(new.lead_id,new.client_id,new.property_id,coalesce(auth.uid(),new.created_by),'Site visit scheduled','Site visit scheduled for '||to_char(new.visit_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI'));
 elsif old.status is distinct from new.status and new.status='Completed' then insert into public.activities(lead_id,client_id,property_id,actor_id,activity_type,description) values(new.lead_id,new.client_id,new.property_id,auth.uid(),'Site visit completed',coalesce(new.feedback,new.notes,'Site visit completed'));
 end if; return new; end $$;
drop trigger if exists trg_crm_log_visit on public.site_visits;
create trigger trg_crm_log_visit after insert or update on public.site_visits for each row execute function public.crm_log_visit();

create or replace function public.crm_log_deal()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
 if tg_op='INSERT' then insert into public.activities(lead_id,client_id,property_id,deal_id,actor_id,activity_type,description) values(new.lead_id,new.client_id,new.property_id,new.id,coalesce(auth.uid(),new.created_by),'Deal created','Deal created: '||new.title);
 elsif old.stage is distinct from new.stage then insert into public.activities(lead_id,client_id,property_id,deal_id,actor_id,activity_type,description) values(new.lead_id,new.client_id,new.property_id,new.id,auth.uid(),'Deal stage changed',new.title||': '||old.stage||' → '||new.stage);
 end if; return new; end $$;
drop trigger if exists trg_crm_log_deal on public.deals;
create trigger trg_crm_log_deal after insert or update on public.deals for each row execute function public.crm_log_deal();

create index if not exists leads_phone_idx on public.leads(phone);
create index if not exists leads_email_idx on public.leads(lower(email));
create index if not exists leads_assigned_status_idx on public.leads(assigned_user,status,created_at desc);
create index if not exists leads_source_created_idx on public.leads(source,created_at desc);
create index if not exists leads_property_idx on public.leads(property_id);
create index if not exists clients_assigned_idx on public.clients(assigned_user,created_at desc);
create index if not exists followups_due_idx on public.follow_ups(assigned_user,follow_up_at) where status='Pending';
create index if not exists visits_upcoming_idx on public.site_visits(assigned_user,visit_at) where status in ('Scheduled','Confirmed');
create index if not exists deals_stage_idx on public.deals(assigned_user,stage,expected_close_date);
create index if not exists deal_financials_payment_idx on public.deal_financials(payment_status);
create index if not exists activities_created_idx on public.activities(created_at desc);
create index if not exists notifications_user_idx on public.notifications(user_id,read_at,created_at desc);

do $$ declare t text; begin
 foreach t in array array['admin_users','clients','leads','follow_ups','site_visits','deals','deal_financials'] loop
  execute format('drop trigger if exists %I on public.%I', 'trg_'||t||'_updated_at', t);
  execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', 'trg_'||t||'_updated_at', t);
 end loop;
end $$;

alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.client_properties enable row level security;
alter table public.follow_ups enable row level security;
alter table public.site_visits enable row level security;
alter table public.deals enable row level security;
alter table public.deal_financials enable row level security;
alter table public.activities enable row level security;
alter table public.notifications enable row level security;

-- Active CRM roles only; owner and manager see team data, executives see assigned data.
drop policy if exists crm_team_select on public.admin_users;
create policy crm_team_select on public.admin_users for select to authenticated using (public.crm_role() is not null and (public.crm_can_manage_team_records() or user_id=auth.uid()));
drop policy if exists crm_owner_manage_team on public.admin_users;
create policy crm_owner_manage_team on public.admin_users for all to authenticated using (public.crm_can_manage_team()) with check (public.crm_can_manage_team());
drop policy if exists crm_leads_select on public.leads;
create policy crm_leads_select on public.leads for select to authenticated using (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid()));
drop policy if exists crm_leads_insert on public.leads;
create policy crm_leads_insert on public.leads for insert to authenticated with check (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid() or (assigned_user is null and created_by=auth.uid())));
drop policy if exists crm_leads_update on public.leads;
create policy crm_leads_update on public.leads for update to authenticated using (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid())) with check (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid()));
drop policy if exists crm_leads_delete on public.leads;
create policy crm_leads_delete on public.leads for delete to authenticated using (public.crm_role()='owner');

do $$ declare t text; begin
 foreach t in array array['clients','follow_ups','site_visits','deals'] loop
  execute format('drop policy if exists crm_read_%I on public.%I',t,t);
  execute format('create policy crm_read_%I on public.%I for select to authenticated using (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid()))',t,t);
  execute format('drop policy if exists crm_insert_%I on public.%I',t,t);
  execute format('create policy crm_insert_%I on public.%I for insert to authenticated with check (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid() or (assigned_user is null and created_by=auth.uid())))',t,t);
  execute format('drop policy if exists crm_update_%I on public.%I',t,t);
  execute format('create policy crm_update_%I on public.%I for update to authenticated using (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid())) with check (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid()))',t,t);
  execute format('drop policy if exists crm_delete_%I on public.%I',t,t);
  execute format('create policy crm_delete_%I on public.%I for delete to authenticated using (public.crm_role() in (''owner'',''manager''))',t,t);
 end loop;
end $$;
drop policy if exists crm_client_properties_select on public.client_properties;
create policy crm_client_properties_select on public.client_properties for select to authenticated using (
 exists(select 1 from public.clients c where c.id=client_id and (public.crm_can_manage_team_records() or c.assigned_user=auth.uid())));
drop policy if exists crm_client_properties_write on public.client_properties;
create policy crm_client_properties_write on public.client_properties for all to authenticated using (
 public.crm_role() is not null and exists(select 1 from public.clients c where c.id=client_id and (public.crm_can_manage_team_records() or c.assigned_user=auth.uid()))) with check (
 public.crm_role() is not null and exists(select 1 from public.clients c where c.id=client_id and (public.crm_can_manage_team_records() or c.assigned_user=auth.uid())));

drop policy if exists crm_deals_select on public.deals;
create policy crm_deals_select on public.deals for select to authenticated using (public.crm_role() in ('owner','manager') or (public.crm_role()='sales_executive' and assigned_user=auth.uid()));
drop policy if exists crm_deals_insert on public.deals;
create policy crm_deals_insert on public.deals for insert to authenticated with check (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid()));
drop policy if exists crm_deals_update on public.deals;
create policy crm_deals_update on public.deals for update to authenticated using (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid())) with check (public.crm_role() is not null and (public.crm_can_manage_team_records() or assigned_user=auth.uid()));
drop policy if exists crm_deals_delete on public.deals;
create policy crm_deals_delete on public.deals for delete to authenticated using (public.crm_role() in ('owner','manager'));
drop policy if exists crm_financials_select on public.deal_financials;
create policy crm_financials_select on public.deal_financials for select to authenticated using (public.crm_can_manage_team_records());
drop policy if exists crm_financials_insert on public.deal_financials;
create policy crm_financials_insert on public.deal_financials for insert to authenticated with check (public.crm_can_manage_team_records());
drop policy if exists crm_financials_update on public.deal_financials;
create policy crm_financials_update on public.deal_financials for update to authenticated using (public.crm_can_manage_team_records()) with check (public.crm_can_manage_team_records());
drop policy if exists crm_financials_delete on public.deal_financials;
create policy crm_financials_delete on public.deal_financials for delete to authenticated using (public.crm_role()='owner');

drop policy if exists crm_activities_select on public.activities;
create policy crm_activities_select on public.activities for select to authenticated using (
 public.crm_role() is not null and (public.crm_can_manage_team_records() or actor_id=auth.uid()
 or exists(select 1 from public.leads l where l.id=lead_id and l.assigned_user=auth.uid())
 or exists(select 1 from public.clients c where c.id=client_id and c.assigned_user=auth.uid())
 or exists(select 1 from public.deals d where d.id=deal_id and d.assigned_user=auth.uid())));
drop policy if exists crm_activities_insert on public.activities;
create policy crm_activities_insert on public.activities for insert to authenticated with check (actor_id=auth.uid() and public.crm_role() is not null);
drop policy if exists crm_notifications_select on public.notifications;
create policy crm_notifications_select on public.notifications for select to authenticated using (user_id=auth.uid() or public.crm_can_manage_team());
drop policy if exists crm_notifications_update on public.notifications;
create policy crm_notifications_update on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Audit history is append-only for normal authenticated clients.
revoke update, delete on public.activities from authenticated;

-- Direct public table insertion is intentionally unavailable; public enquiry intake belongs in a rate-limited Edge Function.
revoke all on public.leads, public.clients, public.follow_ups, public.site_visits, public.deals, public.deal_financials, public.activities, public.client_properties, public.notifications from anon;
grant select, insert, update, delete on public.leads, public.clients, public.follow_ups, public.site_visits, public.deals, public.deal_financials, public.client_properties to authenticated;
grant select, insert on public.activities to authenticated;
grant select, update on public.notifications to authenticated;
grant select on public.admin_users to authenticated;

-- Existing allowlist rows are retained and assigned owner for compatibility. Review and downgrade each member after migration.
