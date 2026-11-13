-- Optional for an already normalized project. Existing rows are preserved.
insert into public.misc_tasks(id,title,log_text) values (7,'서무업무','* 분소행정업무처리') on conflict do nothing;
