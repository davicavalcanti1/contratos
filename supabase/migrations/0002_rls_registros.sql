-- Aplicada no projeto "contratos" em 17/out/2026, assim que o servidor passou
-- a usar a service_role.
--
-- Só o servidor acessa o banco, com a chave service_role, que passa por cima
-- do RLS. RLS ligado sem política nenhuma = a chave anon (pública) não lê nem
-- escreve. O bucket `arquivos` já nasce assim: storage.objects tem RLS por
-- padrão e não criamos política para anon.
alter table public.registros enable row level security;
