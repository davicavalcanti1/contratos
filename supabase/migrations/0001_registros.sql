-- Armazenamento do contratos-saas no Supabase (ver src/armazenamento/supabase.js).
-- Aplicada no projeto "contratos" em 17/out/2026 pelo conector; fica aqui
-- como registro e para recriar em outro projeto.
--
-- Uma tabela genérica guarda todas as coleções (contratos, signatários,
-- eventos, sessões, lotes, organizações, usuários…), cada registro como JSON.
-- Os filtros acontecem na memória do servidor, que carrega tudo ao subir;
-- por isso a tabela é simples de propósito. Quando houver mais de uma
-- instância do servidor, aí vale quebrar em tabelas e consultar direto.

create table if not exists public.registros (
  colecao        text        not null,
  id             text        not null,
  dados          jsonb       not null,
  atualizado_em  timestamptz not null default now(),
  primary key (colecao, id)
);

-- A carga inicial pagina por (colecao, id).
create index if not exists registros_colecao_idx on public.registros (colecao, id);

-- Arquivos: PDFs originais e assinados, PDFs assinados com certificado e
-- tokens .tsr do carimbo do tempo. Bucket privado.
insert into storage.buckets (id, name, public)
values ('arquivos', 'arquivos', false)
on conflict (id) do nothing;

-- Só o servidor acessa, com a chave service_role, que passa por cima do RLS.
-- RLS ligado sem política nenhuma = a chave anon (pública) não lê nem escreve.
-- (Ligar assim que o servidor estiver com a service_role; ver 0002.)
-- alter table public.registros enable row level security;
