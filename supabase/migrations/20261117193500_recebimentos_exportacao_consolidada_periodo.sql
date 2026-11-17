-- Exportação paginada de Gestão de Recebimento, por data de abertura.
-- Inclui romaneios concluídos e bipagens de vouchers/objetos Correios.
-- Proteção por acesso à tela de Gestão de Recebimento.
CREATE OR REPLACE FUNCTION public.assurant_recebimentos_exportar_periodo(p_tipo text, p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fim_exclusivo timestamp with time zone DEFAULT NULL::timestamp with time zone, p_offset integer DEFAULT 0, p_limite integer DEFAULT 800)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v_registros jsonb;
begin
 if auth.uid() is null or not exists (
   select 1 from public.user_profiles u
   where u.id=auth.uid() and (
     u.is_master is true
     or '/v2/assurant/recebimento/gestao' = any(coalesce(u.telas_permitidas,'{}'::text[]))
     or '/recebimento/gestao' = any(coalesce(u.telas_permitidas,'{}'::text[]))
   )
 ) then
   raise exception 'Sem permissão para exportar Gestão de Recebimento' using errcode='42501';
 end if;
 if p_tipo not in ('resumo','itens') or p_tipo is null
   or p_offset is null or p_offset<0 or p_offset>2000000
   or p_limite is null or p_limite<1 or p_limite>1000
   or (p_inicio is not null and p_fim_exclusivo is not null and p_inicio>=p_fim_exclusivo)
 then raise exception 'Parâmetros inválidos para exportação de recebimento' using errcode='22023'; end if;

 if p_tipo = 'resumo' then
   select coalesce(jsonb_agg(to_jsonb(z) order by z.iniciado_em,z.id),'[]'::jsonb) into v_registros
   from (
     select r.id,r.transportadora,r.destinatario_correios,
            r.motorista_nome,r.motorista_cpf,r.placa,r.lacres,
            r.status,r.iniciado_em,r.concluido_em,r.iniciado_por_nome,
            r.total_vouchers,r.total_objetos
     from public.recebimentos r
     where r.status='concluido'
       and (p_inicio is null or r.iniciado_em>=p_inicio)
       and (p_fim_exclusivo is null or r.iniciado_em<p_fim_exclusivo)
     order by r.iniciado_em,r.id
     limit p_limite offset p_offset
   ) z;
 else
   select coalesce(jsonb_agg(to_jsonb(z) order by z.iniciado_em,z.recebimento_id,z.item_id),'[]'::jsonb) into v_registros
   from (
     select x.recebimento_id,x.item_id,x.iniciado_em,
            x.tipo_item,x.codigo,x.bipado_em,x.bipado_por_nome,
            x.situacao,x.destinatario_correios,x.transportadora,
            x.motorista_nome,x.placa,x.iniciado_por_nome
     from (
       select r.id as recebimento_id,v.id as item_id,r.iniciado_em,
              'Voucher'::text as tipo_item,v.voucher as codigo,v.bipado_em,
              coalesce(nullif(btrim(v.bipado_por_nome),''),u.nome,'Não identificado') as bipado_por_nome,
              null::text as situacao,r.destinatario_correios,r.transportadora,
              r.motorista_nome,r.placa,r.iniciado_por_nome
       from public.recebimentos r
       join public.recebimento_vouchers v on v.recebimento_id=r.id
       left join public.user_profiles u on u.id=v.bipado_por
       where r.status='concluido' and r.transportadora is distinct from 'Correios'
         and (p_inicio is null or r.iniciado_em>=p_inicio)
         and (p_fim_exclusivo is null or r.iniciado_em<p_fim_exclusivo)
       union all
       select r.id,o.id,r.iniciado_em,
              'Objeto Correios'::text,o.codigo_rastreio,o.bipado_em,
              coalesce(nullif(btrim(o.bipado_por_nome),''),u.nome,'Não identificado'),
              o.status_vinculo,r.destinatario_correios,r.transportadora,
              r.motorista_nome,r.placa,r.iniciado_por_nome
       from public.recebimentos r
       join liquida_private.recebimento_correios_objetos o
         on o.recebimento_id=r.id and o.status='recebido'
       left join public.user_profiles u on u.id=o.bipado_por
       where r.status='concluido' and r.transportadora='Correios'
         and (p_inicio is null or r.iniciado_em>=p_inicio)
         and (p_fim_exclusivo is null or r.iniciado_em<p_fim_exclusivo)
     ) x
     order by x.iniciado_em,x.recebimento_id,x.item_id
     limit p_limite offset p_offset
   ) z;
 end if;

 return jsonb_build_object('ok',true,'registros',v_registros,
    'quantidade',jsonb_array_length(v_registros));
end;
$function$;
REVOKE ALL ON FUNCTION public.assurant_recebimentos_exportar_periodo(text,timestamptz,timestamptz,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assurant_recebimentos_exportar_periodo(text,timestamptz,timestamptz,integer,integer) TO authenticated;
