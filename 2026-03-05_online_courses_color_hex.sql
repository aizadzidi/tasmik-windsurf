alter table public.online_courses
  add column if not exists color_hex text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.online_courses'::regclass
      and conname = 'online_courses_color_hex_check'
  ) then
    alter table public.online_courses
      add constraint online_courses_color_hex_check
      check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end;
$$;
