-- Backfill exam_roster from historical class lists (Annual Examination 2025)
begin;

delete from public.exam_roster where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09';

-- Abu Dawood (18 students)
with roster(name_norm) as (
  values
('ABDUL BASITH BIN RUZITA'),
('ABDULLAH MUJAHID BIN MUHAMMAD SOLAHUDIN'),
('ADRIANA SYAZA BINTI ABDULLAH ZUBAIR'),
('ALI IRFAN BIN MOHD ZABIDI'),
('ARWA BINTI AMIL'),
('AYSER AQEEL BIN SAFARIN'),
('DAYYAN BIN YUSRIZAM'),
('DHIA HANNA BINTI MA''AMOR'),
('DHIA ZAHRA BINTI MA''AMOR'),
('IBRAHIM HANIF BIN ISMAIL'),
('IRFAN RAYYAN BIN MOHD ZAMRI'),
('MOHAMMED SYARAHIL WAIZ BIN SHAIK ISMAIL'),
('MUHAMMAD AISAR BIN MOHD HAFEEZ'),
('MUHAMMAD AMMAR ZAQUAN BIN MOHD ZURAIDE'),
('MUHAMMAD AQMAL BIN AHMAD TASYRIF'),
('MUHAMMAD NAZMI BIN MD NAZRI'),
('NUR HUSNA BINTI SUKRI'),
('QAISARA FATIMAH AZZAHRA BINTI MUHAMAD HASIF')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, '6838a978-78bb-45b0-8143-3157993d0b95'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

-- Bayhaqi (20 students)
with roster(name_norm) as (
  values
('ABDUL HADI BIN MUKRAM FAIZAL'),
('AIMAN FITRI BIN ABDUL FATTAH'),
('FAQIHA BINTI RUZITA'),
('FATIMAH AZZAHRAH BT MOHD FAIZAL'),
('HABEEB MUHAMMAD BIN ABD RAHMAN'),
('IFTI UMAIRAH BINTI MOHD NOR'),
('IMAN MIRZA BIN SHAHRIL'),
('IZZ NAUFAL BIN ZAID'),
('KHADIJAH BINTI AHMAD RAFIAN@SUFIAN'),
('MUHAMMAD AMMAR BIN MUHAMMAD SAIFUDDIN'),
('MUHAMMAD AZEEM BIN MOHD SALIM'),
('MUHAMMAD DANISH IRFAN BIN IMRAN'),
('MUHAMMAD ISA TOK BIN WAN ZAKIR'),
('MUHAMMAD QAISY AQASYA BIN MUHAMMAD KHALIS'),
('MUHAMMAD SYABIL SULAIMAN BIN REDUAN'),
('NUR DAMIEA QALEESYA BT MUHAMMAD YUSRI'),
('NUR ZAFIRAH BATRISYA BINTI MAT SALIM'),
('RANIA BINTI ABDULLAH'),
('REMY RYAN BIN REMY NIZAM'),
('RUSQAHIRMOV BIN SHUMARLI RUSTAMOV')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, 'bded2316-2119-4675-9c81-35b1a02917bd'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

-- Bukhari (20 students)
with roster(name_norm) as (
  values
('ABDUL RAHMAN BIN MOHMED RAZALI'),
('AMATUL NUR BINTI MOHAMED ALI'),
('AMEERA MYSARAH BINTI AZLI'),
('AMIR HAFIZ BIN ANAS'),
('IRFAN ADRIANSYAH BIN IMRAN'),
('MOHAMMAD FAKHRUL BIN HASNORFAIRUZAN'),
('MUHAMMAD ADAM DANIAL BIN MUHAMMAD ZUHAIMI'),
('MUHAMMAD ADDEEN'),
('MUHAMMAD AFIFI BIN SABRI'),
('MUHAMMAD FURQON BIN MOHD SAUPI'),
('MUHAMMAD HAZIQ WAFIY BIN MOHD RAFEQA'),
('MUHAMMAD NAEL MIZAN BIN KHAIRUDIN'),
('MUHAMMAD NOOR QAYYIM'),
('NUR HANNAH KAMILAH BINTI KAMALUDDIN'),
('NURHAN IRFAN BIN SAIFUL NIZAM'),
('OSSUMANE BIN AZMIR'),
('QASEH ELLYSHA BINTI MOHD RIZAL HAKIM'),
('RAJA HAMZAH AHMAD BIN RAJA BADREEN AHMAD'),
('UMAEYRA QYSTEENA BINTI HELMI'),
('ZARA SOFEA BINTI AINUL ADIBA')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, 'dc48f2ff-d19c-40d2-b6e9-7811ee58146f'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

-- Darimi (23 students)
with roster(name_norm) as (
  values
('A''ISYAH ''AFIFAH BINTI KHAIRUL AZMIE'),
('ABDUL RAZIQUE BIN ABDULLAH'),
('ABDULLAH MUS''AB BIN MUHAMMAD SHAHIR'),
('AFLAH BATRISYIA BINTI MOHD HAFEEZ'),
('AHMAD EZZLUTHFFY BIN KAMARUL AIZAT'),
('AHMAD REDHUAN RIZAL'),
('ALYA ZULAIKHA SETH BINTI RAFIQ SETH'),
('AMR BIN AZMIR'),
('AYRA SOFEA BINTI MUHAMMAD DANIAL'),
('ENGKU IZZHAIQAL BIN ENGKU BAHARUDIN'),
('FAHIIM ABDUL FATTAH BIN AZIZUL ADZANI'),
('FATEEN HUMAIRA BINTI SYAMSUL ANUAR'),
('MUHAMMAD AL FAZRINI BIN AHMAD FAZRIN'),
('MUHAMMAD AYMAN SYABIL BIN YASSER ARAFAT'),
('MUHAMMAD IMAN BIN HAIDARUL AZHAR'),
('MUHAMMAD IRFAN DARWISH'),
('MUHAMMAD SAFIYULLAH SAHABDEEN'),
('MUHAMMAD SYAKIR BIN MOHD SAHRUL'),
('MUS''AB BIN MUHAMMAD SAUFI'),
('NUR AUFA BINTI NORAZMAN'),
('PUTRA FIRMAN FARREL BIN MUHAMMAD FIRDAUS'),
('QASYIF DYLAN HAMZAH BIN ZARUL ANNUAR'),
('SITI MARYAM BINTI UMAR')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, 'd7c73894-0810-4419-a713-26d44db7a747'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

-- Skipping class 'Ibnu Majah' (no class_id mapping).

-- Muslim (22 students)
with roster(name_norm) as (
  values
('AHMAD FURQAN ISMAIL BIN MOHD NOOR'),
('AHMAD USAYD ISLAHUDDIN'),
('ALEEYA NATASHA BINTI NORAZMI'),
('ALIF HAIKAL BIN MOHAMAD RAMZI'),
('ANISA BINTI SUKRI'),
('HILMAN BIN DZULKARNAIN'),
('MOHAMMED QASIM WAIE BIN HJ KASSIM MAZLAN'),
('MUHAMAD ARIF IKMAL BIN SYAMSUL ANUAR'),
('MUHAMMAD AQMAR YUSUF BIN KHAIRUL ANUAR'),
('MUHAMMAD AYHAM BIN ISHAM FARIZ'),
('MUHAMMAD HARIS IRFAN BIN SHAFIE'),
('NAAEL ZUHAYR BIN MOHAMMAD AMIRUZI'),
('NOAH LUQMAN BIN MUHAMMAD NOOR HAKIM'),
('NUR AERYSSA DANISYA BINTI ABDUL RAZAK'),
('NUR AIMAN MIKAIL BIN MOHD HASRI'),
('NUR ALEESYA BINTI MUHAMAD KHALIS'),
('NUR ALEEYA SOFIYA BINTI MOHD FAIZAL'),
('NUR FARZANA BINTI HASNORFAIRUZAN'),
('NUR MUHAMMAD DARWISY BIN MUHAMMAD SAUFI'),
('PUTRI BATRISYIA ZULAIKHA BT MOHD AZUAN'),
('SARAH ALFAZRINY BINTI AHMAD FAZRIN'),
('WAN AFIQ NAQIUDDIN BIN WAN AHMAD KAMAL')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, '00c5cdbe-84b8-4e60-aa02-a4d6b2183e99'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

-- Nasaie (22 students)
with roster(name_norm) as (
  values
('AARIZ AZFAR BIN SAFARIN'),
('ABDUL MUEIZZ BIN MUHAMMAD SAUFI'),
('ADAM BIN HATEM'),
('AISYAH BINTI ABDULLAH'),
('ANAS AYSRAF BIN AZLIE'),
('CYD AYDEEN FURQAN BIN MOHD NAZRI'),
('FAYYAD MECCA BIN MUSTAFA'),
('HANNAH AZ ZAHRA BINTI MOHD SHAFIQUE'),
('HASYAKIRA WAFA BINTI HASMIZAIRI'),
('ISMAIL NUR MUHAMMAD BIN UMAR'),
('M. AL-FATIH BIN AZRUDIN'),
('MUHAMMAD AERIS DAMIEN BIN ABDUL RAZAK'),
('MUHAMMAD QOID BIN FAHMI'),
('MUNIF KHAIRI BIN BADRUL HISHAM'),
('NAYLA MIRZA BINTI SHAHRIL'),
('NUR HUSNA BT MOHAMAD NUR HIDAYAT'),
('NUR SAIDATUL QASEH NAFFISYAH'),
('QAMARA RUQAYYAH ALETHEA BINTI MUHAMAD HASIF'),
('SITI NUR FATIHAH BINTI MUHAMMAD FAIZAL..'),
('SOFIYYAH BINTI MUHAMMAD ALI HASYIMI'),
('UWAIS AL QARNI BIN AMIRUL RASHID'),
('WAN AKIF RAQIUDDIN BIN WAN AHMAD KAMAL')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, '9a227ae1-8ff1-4ddf-a7c1-1289e0d5e402'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

-- Tabrani (21 students)
with roster(name_norm) as (
  values
('ABDURRAHMAN AL FADHLANI BIN AHMAD FADHLAN'),
('ABDURRAHMAN BIN NUR HISYAM'),
('AISYAH NABILAH BINTI MOHD HAFEEZ'),
('ARYAN ZAHIN HAKEEM BIN ABD ZAMAN HARIZ'),
('EBRAHEEM BIN AZMIR'),
('KAYDEN FIRDAUS BINTI KHAIRUL FAHMI'),
('MUHAMMAD AR-RAYYAN BIN MUHAMMAD MUKMIN'),
('MUHAMMAD ARYAN SUFI BIN AZRUDDIN'),
('MUHAMMAD QOIM BIN MOHD FAHMI'),
('MUHAMMAD SYAMEEM BIN MOHD SAHRUL'),
('MUKHLAS BIN ABDUL MURAD'),
('NAUFAL NUFAIL BIN KHAIRULNIZAM YUSOF'),
('NOR QAIZZATUL IMAN QALLISYA BT AHMAD AIZZAT'),
('NUR EVA MEDINAH BT MUSTAFA'),
('NUR HUMAIRA BTE AZMAN'),
('NUR ILHAM BINTI NORAZMAN'),
('RAYYAN MIRZA BIN SHAHRIL'),
('SUMAYYAH BINTI ALI'),
('TSAQIF AMSYAR BIN AZIZUL AZIM'),
('ZAYD AMIN BIN M. REHAN AMIN'),
('ZAYD HARITH BIN MUHAMMAD NOOR HAKIM')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, '935d6105-b70c-49eb-86ae-b8697d8edf72'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

-- Tirmidhi (22 students)
with roster(name_norm) as (
  values
('ADAM MIQAEL'),
('AINUL NAFISAH BINTI MUHAMMAD SHUKRI'),
('AISYAH BINTI AMIL'),
('ALI BIN AHMAD'),
('AYSHA ZAHRA BINTI MOHAMED ALI'),
('DARWISH BIN YUSRIZAM'),
('EMRAN BIN AIRUL ADIBA'),
('FAKHRI SAFWAN BIN FAIRUZ'),
('HAZIM ABDURRAHMAN BIN AZIZUL ADZANI'),
('JUZER BIN MOHD SHAWALLUDDIN FITRI'),
('KAYLA ALEESYA BINTI KHAIRUL FAHMY'),
('KHIYAROH BINTI ABDUL MURAD'),
('MARYAM MOTAZ MOHAMMED MEKKAWY'),
('MOHD HAZIM HANZALAH BIN ABDUL RASIDI'),
('MUHAMMAD ALI IZZ BIN MOHD RAFEQA'),
('NUR ANIS QAISARA BINTI ZULKIFLI'),
('QASEH DAMIA BINTI JAMAL SHAROL'),
('SHAIKH AIMAN ATIF BIN SHAIKH MOHD'),
('SITI NUR FARHANAH BINTI MUHAMMAD'),
('SOFIYYAH BINTI ALI'),
('UMAIYR QHALEEF'),
('WALI AL HUSSAYN BIN MUHASAN')
),
matches as (
  select r.name_norm, array_agg(s.id) as ids
  from roster r
  left join public.students s
    on upper(regexp_replace(trim(s.name), '\\s+', ' ', 'g')) = r.name_norm
  group by r.name_norm
),
resolved as (
  select name_norm, ids[1] as student_id
  from matches
  where array_length(ids, 1) = 1
),
excluded_students as (
  select student_id from public.exam_excluded_students where exam_id = 'f544423b-ef88-45f5-8791-819f00e76b09'
)
insert into public.exam_roster (exam_id, student_id, class_id)
select 'f544423b-ef88-45f5-8791-819f00e76b09', r.student_id, '702c2fdb-1e81-4bbd-8bbd-73f493887e10'
from resolved r
left join excluded_students e on e.student_id = r.student_id
where e.student_id is null
on conflict (exam_id, student_id) do update
  set class_id = excluded.class_id, snapshot_at = now();

commit;
