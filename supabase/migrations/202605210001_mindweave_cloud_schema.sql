create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.documents (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'unknown',
  title text not null,
  author text,
  url text,
  file_path text,
  storage_path text,
  project_id text,
  tags text[] not null default '{}',
  keywords text[] not null default '{}',
  concepts text[] not null default '{}',
  one_line_summary text not null default '',
  content text not null default '',
  user_note text,
  processing_report jsonb,
  knowledge_card_ids text[] not null default '{}',
  chunk_ids text[] not null default '{}',
  source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.document_chunks (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  text text not null,
  chunk_index integer not null default 0,
  page integer,
  timestamp_label text,
  embedding jsonb,
  chunk_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.summaries (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id text not null,
  one_line_summary text not null default '',
  summary_data jsonb not null default '{}'::jsonb,
  knowledge_cards jsonb not null default '[]'::jsonb,
  review_cards jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.graph_nodes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  node_type text not null default 'concept',
  status text not null default 'confirmed',
  origin text not null default 'explicit',
  source_ids text[] not null default '{}',
  node_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.graph_edges (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_node text not null,
  target_node text not null,
  relation_type text not null default '关联',
  status text not null default 'confirmed',
  origin text not null default 'explicit',
  source_ids text[] not null default '{}',
  edge_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.tags (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.projects (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  tags text[] not null default '{}',
  project_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.user_stopwords (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  word text,
  memory_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.api_provider_settings (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_name text not null,
  base_url text not null,
  encrypted_api_key text,
  chat_model text not null,
  embedding_model text not null,
  vision_model text,
  asr_model text,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create table if not exists public.sync_events (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_id text not null,
  detail text not null default '',
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  version bigint not null default 1,
  primary key (user_id, id)
);

create index if not exists documents_user_updated_idx on public.documents(user_id, updated_at desc) where deleted_at is null;
create index if not exists chunks_user_document_idx on public.document_chunks(user_id, document_id) where deleted_at is null;
create index if not exists graph_nodes_user_updated_idx on public.graph_nodes(user_id, updated_at desc) where deleted_at is null;
create index if not exists graph_edges_user_updated_idx on public.graph_edges(user_id, updated_at desc) where deleted_at is null;
create index if not exists sync_events_user_created_idx on public.sync_events(user_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'documents',
    'document_chunks',
    'summaries',
    'graph_nodes',
    'graph_edges',
    'tags',
    'projects',
    'user_stopwords',
    'api_provider_settings',
    'sync_events'
  ]
  loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', table_name, table_name);
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'documents',
    'document_chunks',
    'summaries',
    'graph_nodes',
    'graph_edges',
    'tags',
    'projects',
    'user_stopwords',
    'api_provider_settings',
    'sync_events'
  ]
  loop
    execute format('drop policy if exists %I_user_select on public.%I', table_name, table_name);
    execute format('create policy %I_user_select on public.%I for select using (auth.uid() = user_id)', table_name, table_name);
    execute format('drop policy if exists %I_user_insert on public.%I', table_name, table_name);
    execute format('create policy %I_user_insert on public.%I for insert with check (auth.uid() = user_id)', table_name, table_name);
    execute format('drop policy if exists %I_user_update on public.%I', table_name, table_name);
    execute format('create policy %I_user_update on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', table_name, table_name);
    execute format('drop policy if exists %I_user_delete on public.%I', table_name, table_name);
    execute format('create policy %I_user_delete on public.%I for delete using (auth.uid() = user_id)', table_name, table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'mindweave-documents',
  'mindweave-documents',
  false,
  26214400,
  array['application/pdf', 'text/plain', 'text/markdown', 'application/octet-stream']
)
on conflict (id) do nothing;

drop policy if exists mindweave_storage_user_select on storage.objects;
create policy mindweave_storage_user_select
on storage.objects for select
using (bucket_id = 'mindweave-documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists mindweave_storage_user_insert on storage.objects;
create policy mindweave_storage_user_insert
on storage.objects for insert
with check (bucket_id = 'mindweave-documents' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists mindweave_storage_user_update on storage.objects;
create policy mindweave_storage_user_update
on storage.objects for update
using (bucket_id = 'mindweave-documents' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'mindweave-documents' and auth.uid()::text = (storage.foldername(name))[1]);
