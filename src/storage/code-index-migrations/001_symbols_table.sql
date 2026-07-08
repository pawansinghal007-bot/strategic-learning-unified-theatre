create table symbols (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null,
  file_path text not null,
  name text not null,
  kind text not null,
  start_line int not null,
  end_line int not null,
  signature text,
  indexed_at timestamptz default now()
);
create index symbols_name_idx on symbols(name);
create index symbols_file_path_idx on symbols(file_path);
