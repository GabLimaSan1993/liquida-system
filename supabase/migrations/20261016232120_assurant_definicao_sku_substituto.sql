-- Permite à Assurant consultar e aprovar outro SKU sem alterar o produto originalmente vendido.
-- A assinatura antiga mantém as consultas de família de versões anteriores.

CREATE OR REPLACE FUNCTION public.b2c_definicao_opcoes(p_pedido_id uuid, p_sku text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_p public.pedidos_b2c%rowtype; v_grade text; v_opcoes jsonb; v_skus jsonb; v_vinculos jsonb; v_sku text; v_existe boolean:=true;
begin
 if not (public.b2c_definicao_acesso('assurant') or public.b2c_definicao_acesso('liquida')) then raise exception 'Sem permissão para consultar as alternativas de definição.' using errcode='42501'; end if;
 select * into v_p from public.pedidos_b2c where id=p_pedido_id;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 v_grade:=public.b2c_grade_alvo_exata(v_p.sku_produto,v_p.grade_produto);
 -- A grade de referência continua sendo a vendida; só o produto consultado muda.
 v_sku:=upper(nullif(regexp_replace(btrim(p_sku),'-CC[0-9]+$','','i'),''));
 if v_sku is null then
  select jsonb_agg(to_jsonb(f)) into v_skus from public.b2c_definicao_familia(v_p.sku_produto) f;
 else
  select coalesce((select nullif(btrim(d.sku_als),'') from public.sku_de_para d
   where upper(btrim(d.sku_assurant))=v_sku limit 1),v_sku) into v_sku;
  select jsonb_build_array(jsonb_build_object(
   'sku',coalesce(nullif(btrim(c.sku_als),''),nullif(btrim(c.sku_oracle),''),v_sku),
   'marca',c.marca,'modelo',c.modelo,'capacidade',c.capacidade,'cor',c.cor))
  into v_skus from (select 1) b left join lateral (
   select pc.* from public.produtos_catalogo pc
   where upper(btrim(pc.sku_als))=upper(v_sku) or upper(btrim(pc.sku_oracle))=upper(v_sku)
   order by pc.ativo desc nulls last,pc.data_cadastro desc nulls last limit 1
  ) c on true;
  v_sku:=v_skus->0->>'sku';
  v_existe:=(v_skus->0->>'modelo' is not null)
   or exists(select 1 from public.assurant_triagem t where t.sku=v_sku);
 end if;
 with candidatos as (
  select c.*,coalesce(nullif(btrim(f.cor),''),'Sem cor') as cor,f.capacidade,
   coalesce(f.modelo,c.modelo) as modelo_catalogo,
   case when lower(coalesce(c.status_bateria,''))='saúde da bateria entre 70 e 79%' then 'OUTLET' else public.b2c_normalizar_grade_exata(c.grade) end as grade_comercial
  from jsonb_to_recordset(v_skus) as f(sku text,marca text,modelo text,capacidade text,cor text)
  cross join lateral public.assurant_definicao_candidatos(f.sku) c
  where c.data_subinv is not null
    and not private.b2c_definicao_imei_bloqueado(c.imei)
  and (c.disponivel or c.vinculo_tipo is not null)
  and coalesce(c.vinculo_detalhes->>'b2c_item_id','')<>v_p.id::text
  and not exists(select 1 from public.pedidos_b2c p where btrim(p.imei_alocado)=c.imei and p.status in ('aguardando_validacao_meli','embalado','faturado','concluido'))
  and public.b2c_grade_ordem_exata(c.grade)>=public.b2c_grade_ordem_exata('BOM')
  and lower(coalesce(c.status_bateria,'')) not in ('saúde da bateria abaixo 70%','saúde da bateria abaixo de 80%')
 ), elegiveis as (
  select c.*,
   case grade_comercial when 'LIKE NEW' then 'Like New' when 'EXCELENTE' then 'Excelente' when 'MUITO BOM' then 'Muito Bom' when 'BOM' then 'Bom' when 'OUTLET' then 'Outlet' end as grade_exibicao,
   case when public.b2c_grade_ordem_exata(grade_comercial)>public.b2c_grade_ordem_exata(v_grade) then 'upgrade' when public.b2c_grade_ordem_exata(grade_comercial)<public.b2c_grade_ordem_exata(v_grade) then 'downgrade' else 'mesma_grade' end as relacao
  from candidatos c where grade_comercial in ('LIKE NEW','EXCELENTE','MUITO BOM','BOM','OUTLET')
 ), agrupados as (
  select sku,grade_comercial,grade_exibicao,cor,capacidade,modelo_catalogo,relacao,disponivel,vinculo_tipo,vinculo_referencia,
   jsonb_agg(to_jsonb(e) order by data_subinv nulls last,imei) as candidatos
  from elegiveis e group by sku,grade_comercial,grade_exibicao,cor,capacidade,modelo_catalogo,relacao,disponivel,vinculo_tipo,vinculo_referencia
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'sku',sku,'modelo',modelo_catalogo,'capacidade',capacidade,'grade',grade_exibicao,'cor',cor,'relacao',relacao,
  'quantidade',jsonb_array_length(candidatos),'fifo',candidatos->0,'candidatos',candidatos,
  'grade_fisica_fifo',candidatos->0->>'grade','outlet',grade_comercial='OUTLET',
  'disponivel',disponivel,'vinculo_tipo',vinculo_tipo,'vinculo_referencia',vinculo_referencia,
  'vinculo_descricao',candidatos->0->>'vinculo_descricao','vinculo_detalhes',candidatos->0->'vinculo_detalhes'
 ) order by cor,public.b2c_grade_ordem_exata(grade_comercial) desc,disponivel desc,sku),'[]'::jsonb) into v_opcoes from agrupados;
 select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into v_vinculos from jsonb_to_recordset(v_skus) as f(sku text,marca text,modelo text,capacidade text,cor text) cross join lateral public.assurant_definicao_vinculos_sku(f.sku,v_p.id) v;
 return jsonb_build_object('existe',v_existe or jsonb_array_length(v_opcoes)>0,'skuBase',coalesce(v_sku,regexp_replace(v_p.sku_produto,'-CC[0-9]+$','','i')),'gradeOrigem',case v_grade when 'LIKE NEW' then 'Like New' when 'EXCELENTE' then 'Excelente' when 'MUITO BOM' then 'Muito Bom' when 'BOM' then 'Bom' when 'OUTLET' then 'Outlet' else v_p.grade_produto end,'modelo',v_skus->0->>'modelo','familia',coalesce(v_skus,'[]'::jsonb),'opcoes',v_opcoes,'vinculosSku',v_vinculos);
end; $function$;

REVOKE ALL ON FUNCTION public.b2c_definicao_opcoes(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.b2c_definicao_opcoes(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.b2c_definicao_opcoes(p_pedido_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
 select public.b2c_definicao_opcoes(p_pedido_id,null::text);
$function$;

CREATE OR REPLACE FUNCTION public.b2c_assurant_aprovar_definicao(p_pedido_id uuid, p_sku text, p_grade text, p_cor text, p_vinculo_tipo text DEFAULT NULL::text, p_vinculo_referencia text DEFAULT NULL::text, p_upgrade_confirmado boolean DEFAULT false, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_p public.pedidos_b2c%rowtype; v_consulta jsonb; v_o jsonb; v_res jsonb; v_nome text; v_grupo uuid; v_num integer; v_total integer;
begin
 if not public.b2c_definicao_acesso('assurant') then raise exception 'Sem permissão para aprovar a definição da Assurant.' using errcode='42501'; end if;
 -- Serializa a decisão por pedido comercial, inclusive os pedidos com múltiplos itens.
 perform pg_advisory_xact_lock(hashtext('b2c_definicao_'||(select id_anymarket::text from public.pedidos_b2c where id=p_pedido_id)));
 select * into v_p from public.pedidos_b2c where id=p_pedido_id for update;
 if not found or v_p.status<>'aguardando_definicao_produto' or v_p.definicao_etapa<>'assurant' or coalesce(v_p.definicao_status,'pendente')<>'pendente' then raise exception 'Pedido não está pendente na fila da Assurant. Atualize a tela.'; end if;
 v_consulta:=public.b2c_definicao_opcoes(v_p.id,p_sku);
 select o into v_o from jsonb_array_elements(v_consulta->'opcoes') o
 where upper(o->>'sku')=upper(btrim(p_sku)) and public.b2c_normalizar_grade_exata(o->>'grade')=public.b2c_normalizar_grade_exata(p_grade) and o->>'cor'=p_cor
 and coalesce(o->>'vinculo_tipo','')=coalesce(p_vinculo_tipo,'') and coalesce(o->>'vinculo_referencia','')=coalesce(p_vinculo_referencia,'') limit 1;
 if v_o is null then raise exception 'A opção escolhida mudou no WMS. Atualize as alternativas.'; end if;
 if v_o->>'relacao'='downgrade' then raise exception 'Grade inferior ao produto comprado não pode ser aprovada nesta tela.'; end if;
 if v_o->>'relacao'='upgrade' and not coalesce(p_upgrade_confirmado,false) then raise exception 'Confirme a aprovação do upgrade pela Assurant.'; end if;
 -- A reserva é decidida no banco: nenhum IMEI é recebido do navegador.
 perform 1 from public.wms_alocacoes where id=(v_o->'fifo'->>'alocacao_id')::uuid for update;
 select nome into v_nome from public.user_profiles where id=auth.uid();
 if v_o->>'relacao'='upgrade' then
  perform public.b2c_registrar_aprovacao_upgrade(v_p.id,v_o->'fifo'->>'imei',v_o->>'sku',v_o->>'grade',v_o->>'cor');
 end if;
 update public.b2c_definicao_assurant_casos set selecao=v_o,observacoes=nullif(btrim(p_observacoes),''),decidido_em=now(),decidido_por=auth.uid(),decidido_nome=v_nome where id=v_p.definicao_assurant_caso_id;
 if nullif(v_o->>'vinculo_tipo','') is not null then
  v_res:=public.assurant_solicitar_desvinculacao_b2c(v_p.id,v_o->'fifo'->>'imei',v_o->>'sku',v_o->>'grade',v_o->>'grade_fisica_fifo',v_o->>'cor',v_o->>'relacao',v_o->>'vinculo_tipo',v_o->>'vinculo_referencia',v_o->'vinculo_detalhes');
  if not coalesce((v_res->>'ok')::boolean,false) then raise exception '%',v_res->>'erro'; end if;
  return v_res||jsonb_build_object('aguardandoDesvinculacao',true,'relacao',v_o->>'relacao','grade',v_o->>'grade','cor',v_o->>'cor','vinculoDescricao',v_o->>'vinculo_descricao');
 end if;
 v_res:=public.wms_reservar_saida(v_o->'fifo'->>'imei','B2C',v_p.id::text,auth.uid());
 if not coalesce((v_res->>'ok')::boolean,false) then raise exception 'A opção não está mais disponível: %',v_res->>'erro'; end if;
 update public.pedidos_b2c set status='alocado',sku_definido=v_o->>'sku',grade_definida=v_o->>'grade',imei_alocado=v_o->'fifo'->>'imei',sku_alocado=v_o->>'sku',grade_alocada=v_o->>'grade_fisica_fifo',wms_alocacao_id=(v_o->'fifo'->>'alocacao_id')::uuid,alocado_em=now(),alocado_por=auth.uid(),grupo_id=null,
  definicao_status='concluido',definicao_resolvido_em=now(),definicao_resolvido_por=auth.uid(),definicao_resumo=concat('Assurant aprovou ',v_o->>'sku',' · ',v_o->>'grade',' · ',v_o->>'cor',' · IMEI FIFO ',v_o->'fifo'->>'imei',case when v_o->>'relacao'='upgrade' then ' · UPGRADE APROVADO' else '' end),atualizado_em=now()
 where id=v_p.id;
 update public.assurant_triagem set status_atual='Reservado para pedido B2C',atualizado_em=now() where btrim(imei)=v_o->'fifo'->>'imei';
 -- Mantém a regra de formar um único grupo quando todos os itens estiverem alocados.
 if not exists(select 1 from public.pedidos_b2c where id_anymarket=v_p.id_anymarket and (status<>'alocado' or grupo_id is not null)) then
  perform pg_advisory_xact_lock(hashtext('b2c_grupo_exclusivo_desvinculacao'));
  select count(*) into v_total from public.pedidos_b2c where id_anymarket=v_p.id_anymarket;
  select coalesce(max(numero),0)+1 into v_num from public.pedidos_b2c_grupos;
  insert into public.pedidos_b2c_grupos(numero,status,total_pedidos,criado_por,status_faturamento) values(v_num,'aberto',v_total,auth.uid(),'pendente') returning id into v_grupo;
  update public.pedidos_b2c set grupo_id=v_grupo,status='em_picking',atualizado_em=now() where id_anymarket=v_p.id_anymarket and status='alocado' and grupo_id is null;
 end if;
 return jsonb_build_object('ok',true,'imei',v_o->'fifo'->>'imei','sku',v_o->>'sku','grade',v_o->>'grade','cor',v_o->>'cor','relacao',v_o->>'relacao','grupoFormado',v_grupo is not null);
end; $function$;
