-- Warehouse / Laboratório: envio comprovado, Voucher + OS GAIA, conferência e bloqueios
-- Capturado do esquema de produção após validação em 17/11/2026.
-- A autenticação e a autorização são verificadas dentro das funções.

CREATE OR REPLACE FUNCTION liquida_private.reparo_lab_enviado_warehouse(p_voucher text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
 select exists(
  select 1
  from liquida_private.reparo_lab_itens i
  join liquida_private.reparo_lab_romaneios r on r.id=i.romaneio_saida_id and r.tipo='envio'
  join liquida_private.reparo_pedidos p on p.id=i.pedido_id and p.origem_lab='picking'
  where upper(btrim(i.voucher))=upper(btrim(p_voucher))
    and r.status in ('emitido','recebimento_parcial','recebido')
    and liquida_private.reparo_lab_trilha_valida(i.voucher)
 )
$function$;

CREATE OR REPLACE FUNCTION liquida_private.reparo_lab_bloquear_voucher_sem_trilha()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
begin
 if new.voucher is null or not liquida_private.reparo_lab_trilha_valida(new.voucher) then
  raise exception 'Entrada no laboratório bloqueada: voucher % sem histórico de recebimento e passagem pela triagem no sistema.',coalesce(new.voucher,'(vazio)') using errcode='22023';
 end if;
 if tg_op='INSERT' and new.status='aguardando_recebimento' then
   if tg_table_name='reparo_lab_itens' then
     -- No BEFORE INSERT o próprio item ainda não está persistido;
     -- validar o envio exclusivamente pelo pedido/picking e romaneio Warehouse.
     if not exists(
       select 1 from liquida_private.reparo_lab_romaneios r
       join liquida_private.reparo_pedidos p on p.id=r.pedido_id and p.origem_lab='picking'
       join liquida_private.reparo_itens i on i.pedido_id=p.id
       where r.id=new.romaneio_saida_id and r.tipo='envio' and r.status='emitido'
         and p.id=new.pedido_id and i.id=new.id and upper(btrim(i.voucher))=upper(btrim(new.voucher))
     ) then
       raise exception 'Recebimento bloqueado: voucher % não foi destinado ao Laboratório por romaneio Warehouse.',new.voucher using errcode='22023';
     end if;
   elsif not liquida_private.reparo_lab_enviado_warehouse(new.voucher) then
     raise exception 'Recebimento bloqueado: voucher % não foi destinado ao Laboratório pelo Warehouse.',new.voucher using errcode='22023';
   end if;
 elsif tg_op='UPDATE' and old.status='aguardando_recebimento'
       and new.status='recebido'
       and not liquida_private.reparo_lab_enviado_warehouse(new.voucher) then
   raise exception 'Recebimento bloqueado: voucher % não foi destinado ao Laboratório pelo Warehouse.',new.voucher using errcode='22023';
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_reparo_warehouse_planilha_gaia(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare v jsonb;
begin
 if auth.uid() is null or not (
   liquida_private.reparo_autorizado('picking')
   or liquida_private.reparo_autorizado('oracle')
   or exists(
  select 1 from public.user_profiles u where u.id=auth.uid() and (
    u.is_master is true or
    '/v2/assurant/b2b/reparo/importar'=any(coalesce(u.telas_permitidas,'{}'::text[]))
    or '/v2/assurant/b2b/reparo'=any(coalesce(u.telas_permitidas,'{}'::text[]))
  )
   )
 ) then raise exception 'Sem permissão Warehouse para exportar a planilha do Laboratório.' using errcode='42501'; end if;
 if p_pedido_id is null or not exists(
  select 1 from liquida_private.reparo_pedidos p
  where p.id=p_pedido_id and p.origem_lab='picking'
     and p.status in ('aguardando_oracle','em_reparo','concluido')
 ) then raise exception 'Finalize o picking para disponibilizar a planilha de entrega ao Laboratório.'; end if;
 select jsonb_agg(
  jsonb_build_object(
   'voucher',i.voucher,
   'modelo_comercial',coalesce(nullif(btrim(t.modelo),''),nullif(btrim(i.modelo),'')),
   'modelo_fabricante',cat.modelo,
   'marca',coalesce(cat.marca,cat.fabricante),
   'defeito_triagem',coalesce(t.defeitos_adicionais,array_to_string(array(select x #>> '{}' from jsonb_array_elements(coalesce(i.defeitos_origem,'[]'::jsonb)) x),'; '))
  ) order by i.ordem,i.voucher)
 into v
 from liquida_private.reparo_lab_itens i
 join liquida_private.reparo_lab_romaneios r on r.id=i.romaneio_saida_id and r.tipo='envio'
 left join public.assurant_triagem t on t.voucher=i.voucher
 left join lateral (
   select c.modelo,c.marca,c.fabricante
   from public.produtos_catalogo c
   where c.ativo=true and (c.sku_als=i.sku or c.sku_oracle=i.sku)
   order by c.pendente asc nulls last,c.modelo limit 1
 ) cat on true
 where i.pedido_id=p_pedido_id;
 if v is null then raise exception 'Romaneio de envio ao Laboratório ainda não foi gerado para este picking.'; end if;
 return jsonb_build_object('ok',true,'itens',v,'total',jsonb_array_length(v));
end;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_receber_os_gaia(p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
 SET statement_timeout TO '45s'
AS $function$
declare
 v_user uuid:=auth.uid();
 v_linha jsonb; v_voucher text; v_os text;
 v_h liquida_private.reparo_lab_itens%rowtype;
 v_a liquida_private.reparo_lab_avulsos%rowtype;
 v_confirmados integer:=0; v_existentes integer:=0; v_total integer;
begin
 if v_user is null or not exists(
  select 1 from public.user_profiles u where u.id=v_user and
   (u.is_master is true or '/v2/assurant/laboratorio/reparos'=any(coalesce(u.telas_permitidas,'{}'::text[])))
 ) then raise exception 'Sem permissão para confirmar recebimento no Laboratório' using errcode='42501'; end if;
 if p_linhas is null or jsonb_typeof(p_linhas)<>'array'
    or jsonb_array_length(p_linhas) not between 1 and 250
 then raise exception 'Envie de 1 a 250 pares Voucher + OS GAIA por lote.'; end if;
 select count(*) into v_total from jsonb_array_elements(p_linhas);
 if exists(
  select 1 from jsonb_array_elements(p_linhas) l
  where jsonb_typeof(l)<>'object'
     or upper(btrim(coalesce(l->>'voucher',''))) !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$'
     or upper(btrim(coalesce(l->>'voucher',''))) ~ '^([0-9]{15}|IMEI|OS|VOUCHER)$'
     or btrim(coalesce(l->>'os_gaia','')) !~ '^[A-Za-z0-9._/-]{2,60}$'
 ) then raise exception 'Planilha contém voucher ou OS GAIA inválido; nenhum recebimento foi confirmado.' using errcode='22023'; end if;
 if (select count(distinct upper(btrim(l->>'voucher'))) from jsonb_array_elements(p_linhas) l) <> v_total
 or (select count(distinct upper(btrim(l->>'os_gaia'))) from jsonb_array_elements(p_linhas) l) <> v_total
 then raise exception 'Planilha contém vouchers ou OS GAIA repetidos.' using errcode='22023'; end if;

 perform pg_advisory_xact_lock(hashtextextended('assurant_reparo_lab_receber_os_gaia',0));
 for v_linha in select value from jsonb_array_elements(p_linhas) loop
  v_voucher:=upper(btrim(v_linha->>'voucher'));
  v_os:=btrim(v_linha->>'os_gaia');
  if not liquida_private.reparo_lab_trilha_valida(v_voucher)
    or not liquida_private.reparo_lab_enviado_warehouse(v_voucher)
  then raise exception 'Voucher % inválido para recebimento: o Warehouse não registrou envio do aparelho ao Laboratório.',v_voucher using errcode='22023'; end if;

  select * into v_h from liquida_private.reparo_lab_itens
   where upper(btrim(voucher))=v_voucher
   order by atualizado_em desc nulls last,id desc limit 1 for update;
  select * into v_a from liquida_private.reparo_lab_avulsos
   where voucher=v_voucher for update;
  if v_h.id is null and v_a.id is null then
   raise exception 'Voucher % enviado pelo Warehouse, mas sem item de recebimento no Laboratório.',v_voucher;
  end if;
  if v_h.id is not null and v_a.id is not null then
   raise exception 'Voucher % duplicado entre histórico e recebimento individual; concilie antes de confirmar.',v_voucher;
  end if;

  if exists(
    select 1 from liquida_private.reparo_lab_itens i
    where upper(btrim(i.os_numero))=upper(v_os)
      and (v_h.id is null or i.id<>v_h.id)
  ) or exists(
    select 1 from liquida_private.reparo_lab_avulsos a
    where upper(btrim(a.os_numero))=upper(v_os)
      and (v_a.id is null or a.id<>v_a.id)
  ) then raise exception 'OS GAIA % já está vinculada a outro voucher.',v_os; end if;

  if v_h.id is not null then
    if v_h.status='aguardando_recebimento' then
      update liquida_private.reparo_lab_itens set
       status='recebido',os_numero=v_os,os_referencia=v_os,
       recebido_em=now(),recebido_por=v_user,atualizado_em=now()
      where id=v_h.id and status='aguardando_recebimento';
      insert into liquida_private.reparo_lab_eventos(item_id,acao,usuario_id,anterior,posterior)
      values(v_h.id,'recebimento_warehouse_os_gaia',v_user,
        jsonb_build_object('status',v_h.status,'os_numero',v_h.os_numero),
        jsonb_build_object('status','recebido','os_numero',v_os,'voucher',v_voucher));
      v_confirmados:=v_confirmados+1;
    elsif v_h.status in ('recebido','em_reparo','concluido') and (v_h.os_numero=v_os or (v_h.status='recebido' and v_h.os_numero is null)) then
      if v_h.os_numero is null then
        update liquida_private.reparo_lab_itens set os_numero=v_os,os_referencia=v_os,atualizado_em=now()
        where id=v_h.id;
        insert into liquida_private.reparo_lab_eventos(item_id,acao,usuario_id,anterior,posterior)
        values(v_h.id,'os_gaia_associada_apos_recebimento',v_user,
          jsonb_build_object('os_numero',null),jsonb_build_object('os_numero',v_os,'voucher',v_voucher));
      end if;
      v_existentes:=v_existentes+1;
    else
      raise exception 'Voucher % está em % e não permite confirmação de recebimento.',v_voucher,v_h.status;
    end if;
  else
    if v_a.status='aguardando_recebimento' then
      update liquida_private.reparo_lab_avulsos set
       status='recebido',os_numero=v_os,os_referencia=v_os,
       recebido_em=now(),recebido_por=v_user,atualizado_em=now()
      where id=v_a.id and status='aguardando_recebimento';
      insert into liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
      values(v_a.id,'recebimento_warehouse_os_gaia',
        jsonb_build_object('status',v_a.status,'os_numero',v_a.os_numero),
        jsonb_build_object('status','recebido','os_numero',v_os,'voucher',v_voucher),v_user);
      v_confirmados:=v_confirmados+1;
    elsif v_a.status in ('recebido','em_reparo','concluido') and (v_a.os_numero=v_os or (v_a.status='recebido' and v_a.os_numero is null)) then
      if v_a.os_numero is null then
        update liquida_private.reparo_lab_avulsos set os_numero=v_os,os_referencia=v_os,atualizado_em=now()
        where id=v_a.id;
        insert into liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
        values(v_a.id,'os_gaia_associada_apos_recebimento',
         jsonb_build_object('os_numero',null),jsonb_build_object('os_numero',v_os,'voucher',v_voucher),v_user);
      end if;
      v_existentes:=v_existentes+1;
    else
      raise exception 'Voucher % está em % e não permite confirmação de recebimento.',v_voucher,v_a.status;
    end if;
  end if;
  v_h:=null; v_a:=null;
 end loop;
 return jsonb_build_object('ok',true,'total',v_total,'confirmados',v_confirmados,'ja_recebidos',v_existentes);
end;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_conferir_importacao(p_vouchers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
 SET statement_timeout TO '20s'
AS $function$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_profiles u
    WHERE u.id=auth.uid() AND (
      coalesce(u.is_master,false)
      OR '/v2/assurant/laboratorio/reparos'=any(coalesce(u.telas_permitidas,'{}'::text[]))
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para conferir importação do Laboratório' USING ERRCODE='42501';
  END IF;
  IF p_vouchers IS NULL OR jsonb_typeof(p_vouchers)<>'array'
     OR jsonb_array_length(p_vouchers) NOT BETWEEN 1 AND 500 THEN
     RAISE EXCEPTION 'Envie de 1 a 500 vouchers para conferência';
  END IF;
  IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_vouchers) x
     WHERE jsonb_typeof(x.value)<>'string'
       OR upper(btrim(x.value #>> '{}')) !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$'
  ) THEN
     RAISE EXCEPTION 'Conferência contém voucher inválido';
  END IF;
  WITH entrada AS MATERIALIZED (
    SELECT upper(btrim(value)) voucher,min(ord)::integer ordem
    FROM jsonb_array_elements_text(p_vouchers) WITH ORDINALITY x(value,ord)
    GROUP BY 1
  ), detalhes AS (
    SELECT e.voucher,e.ordem,
      a.status AS status_individual,a.id AS id_individual,
      a.criado_em AS cadastrado_em_individual,
      u.nome AS cadastrado_por_individual,
      h.status AS status_historico,h.id AS id_historico,
      h.recebido_em AS cadastrado_em_historico,
      uh.nome AS cadastrado_por_historico,
      CASE
        WHEN NOT liquida_private.reparo_lab_trilha_valida(e.voucher)
          OR NOT liquida_private.reparo_lab_enviado_warehouse(e.voucher)
        THEN 'NAO_ENCONTRADO'
        WHEN a.id IS NOT NULL AND a.status='aguardando_recebimento' THEN 'LIBERAR_PENDENTE'
        WHEN a.id IS NOT NULL THEN 'JA_CADASTRADO'
        WHEN h.id IS NOT NULL THEN 'JA_NO_HISTORICO'
        WHEN liquida_private.reparo_lab_trilha_valida(e.voucher)
           AND liquida_private.reparo_lab_enviado_warehouse(e.voucher)
          THEN 'NOVO'
        ELSE 'NAO_ENCONTRADO'
      END AS classificacao
    FROM entrada e
    LEFT JOIN liquida_private.reparo_lab_avulsos a ON a.voucher=e.voucher
    LEFT JOIN LATERAL (
      SELECT i.id,i.status,i.recebido_em,i.recebido_por FROM liquida_private.reparo_lab_itens i
      WHERE upper(btrim(i.voucher))=e.voucher
      ORDER BY i.atualizado_em DESC NULLS LAST,i.id DESC LIMIT 1
    ) h ON true
    LEFT JOIN public.user_profiles u ON u.id=a.criado_por
    LEFT JOIN public.user_profiles uh ON uh.id=h.recebido_por
  )
  SELECT jsonb_build_object(
    'total',count(*),
    'novos',count(*) FILTER (WHERE classificacao='NOVO'),
    'nao_encontrados',count(*) FILTER (WHERE classificacao='NAO_ENCONTRADO'),
    'ja_cadastrados',count(*) FILTER (WHERE classificacao='JA_CADASTRADO'),
    'ja_no_historico',count(*) FILTER (WHERE classificacao='JA_NO_HISTORICO'),
    'liberar_pendentes',count(*) FILTER (WHERE classificacao='LIBERAR_PENDENTE'),
    'itens',coalesce(jsonb_agg(jsonb_build_object(
      'voucher',voucher,'situacao',classificacao,
      'status_atual',coalesce(status_individual,status_historico),
      'cadastrado_em',coalesce(cadastrado_em_individual,cadastrado_em_historico),
      'cadastrado_por',coalesce(cadastrado_por_individual,cadastrado_por_historico),
      'origem',CASE WHEN id_individual IS NOT NULL THEN 'individual'
                    WHEN id_historico IS NOT NULL THEN 'historico'
                    ELSE 'novo' END
    ) ORDER BY ordem),'[]'::jsonb)
  ) INTO v FROM detalhes;
  RETURN v;
END $function$;

CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_confirmar_recebimento(p_vouchers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '25s'
AS $function$
DECLARE
 v_usuario uuid:=auth.uid();
 v_liberados integer;
 v_total integer;
BEGIN
 IF v_usuario IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.user_profiles up
   WHERE up.id=v_usuario AND (coalesce(up.is_master,false)
    OR up.telas_permitidas @> ARRAY['/v2/assurant/laboratorio/reparos']::text[])
 ) THEN RAISE EXCEPTION 'Sem acesso ao laboratório' USING ERRCODE='42501'; END IF;
 IF p_vouchers IS NULL OR jsonb_typeof(p_vouchers)<>'array'
    OR jsonb_array_length(p_vouchers) NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION 'Envie entre 1 e 500 vouchers para confirmação'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_vouchers) e
    WHERE jsonb_typeof(e.value)<>'string'
       OR upper(btrim(e.value #>> '{}')) !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$')
 THEN RAISE EXCEPTION 'Voucher inválido na confirmação'; END IF;
 IF EXISTS (
    SELECT 1 FROM (SELECT DISTINCT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers)) e
    WHERE NOT liquida_private.reparo_lab_trilha_valida(e.voucher)
     OR NOT liquida_private.reparo_lab_enviado_warehouse(e.voucher)
 ) THEN RAISE EXCEPTION 'Recebimento bloqueado: voucher sem histórico válido ou sem envio registrado pelo Warehouse' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('assurant_reparo_lab_individual_importar'));
 WITH entrada AS (
    SELECT DISTINCT upper(btrim(value)) AS voucher
      FROM jsonb_array_elements_text(p_vouchers)
 )
 SELECT count(*) INTO v_total FROM entrada;
 IF v_total <> (SELECT count(*) FROM (
     SELECT DISTINCT upper(btrim(value)) AS voucher FROM jsonb_array_elements_text(p_vouchers)
   ) e JOIN liquida_private.reparo_lab_avulsos a
        ON a.voucher=e.voucher AND a.status='aguardando_recebimento')
 THEN RAISE EXCEPTION 'Existem vouchers que não estão em Aguardando recebimento. Confira os pendentes.'; END IF;
 WITH entrada AS (
    SELECT DISTINCT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers)
 ), atualizados AS (
    UPDATE liquida_private.reparo_lab_avulsos a
      SET status='recebido',recebido_em=now(),recebido_por=v_usuario,atualizado_em=now()
    FROM entrada e WHERE a.voucher=e.voucher AND a.status='aguardando_recebimento'
    RETURNING a.id,a.voucher,a.recebido_em
 ), auditoria AS (
    INSERT INTO liquida_private.reparo_lab_avulsos_eventos
     (item_id,acao,antes,depois,usuario_id)
    SELECT a.id,'recebimento_fisico_confirmado_em_lote',
      jsonb_build_object('status','aguardando_recebimento'),
      jsonb_build_object('status','recebido','voucher',a.voucher,'recebido_em',a.recebido_em),
      v_usuario FROM atualizados a RETURNING id
 )
 SELECT count(*) INTO v_liberados FROM auditoria;
 RETURN jsonb_build_object('ok',true,'confirmados',v_liberados);
END;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_individual(p_acao text, p_vouchers jsonb DEFAULT NULL::jsonb, p_item_id uuid DEFAULT NULL::uuid, p_busca text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0, p_os text DEFAULT NULL::text, p_defeitos jsonb DEFAULT NULL::jsonb, p_resultado text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '45s'
AS $function$
DECLARE
 v_usuario uuid:=auth.uid();
 v_avulso liquida_private.reparo_lab_avulsos%ROWTYPE;
 v_antigo jsonb;
 v_novo jsonb;
 v_total integer:=0;
 v_importados integer:=0;
 v_ja_existiam integer:=0;
 v_liberados integer:=0;

 v_duplicados integer:=0;
 v_lista jsonb;
 v_termo text:=upper(btrim(coalesce(p_busca,'')));
BEGIN
 -- Mesma política da página principal do laboratório, sem expor a tabela ao PostgREST.
 IF v_usuario IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id=v_usuario AND (
        coalesce(up.is_master,false)
        OR up.telas_permitidas @> ARRAY['/v2/assurant/laboratorio/reparos']::text[]
      )
    )
 THEN RAISE EXCEPTION 'Sem permissão para Laboratório de Reparos. Solicite acesso na Gestão de Usuários.' USING ERRCODE='42501'; END IF;

 IF p_acao='importar' THEN
   IF p_vouchers IS NULL OR jsonb_typeof(p_vouchers)<>'array' THEN RAISE EXCEPTION 'Envie uma lista de vouchers'; END IF;
   SELECT jsonb_array_length(p_vouchers) INTO v_total;
   IF v_total<1 OR v_total>500 THEN RAISE EXCEPTION 'Envie de 1 a 500 vouchers por lote de importação'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_vouchers) x
     WHERE jsonb_typeof(x.value)<>'string'
       OR upper(btrim(x.value #>> '{}')) !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$')
   THEN RAISE EXCEPTION 'Há voucher inválido no arquivo'; END IF;

   IF EXISTS (SELECT 1 FROM (SELECT DISTINCT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers)) e
     WHERE NOT liquida_private.reparo_lab_trilha_valida(e.voucher) OR NOT liquida_private.reparo_lab_enviado_warehouse(e.voucher))
   THEN RAISE EXCEPTION 'Entrada no laboratório bloqueada: voucher sem histórico ou sem envio confirmado pelo Warehouse. Nenhum voucher foi cadastrado.' USING ERRCODE='22023';
   END IF;
   -- Evita duplicação mesmo quando duas pessoas importam ao mesmo tempo.
   PERFORM pg_advisory_xact_lock(hashtext('assurant_reparo_lab_individual_importar'));
   WITH entrada AS (
     SELECT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers)
   ), unicos AS (
     SELECT DISTINCT voucher FROM entrada
   ), criados AS (
     INSERT INTO liquida_private.reparo_lab_avulsos(
         voucher,imei,modelo,sku,grade,defeitos_origem,defeitos_atual,
         alerta_origem,criado_por,status,recebido_em,recebido_por)
     SELECT
        e.voucher,
        CASE WHEN t.variantes=1 THEN t.imei ELSE NULL END,
        t.modelo,t.sku,t.grade,
        coalesce(t.defeitos,'[]'::jsonb),
        coalesce(t.defeitos,'[]'::jsonb),
        CASE WHEN t.voucher IS NULL THEN 'Voucher sem triagem localizada; confirmar identificação'
             WHEN t.variantes>1 THEN 'Voucher com mais de um IMEI histórico; confirmar aparelho'
             ELSE NULL END,
        v_usuario,'aguardando_recebimento',NULL,NULL
     FROM unicos e
     LEFT JOIN LATERAL (
       SELECT v.voucher,v.imei,v.modelo,v.sku,v.grade,
         liquida_private.reparo_lab_extrair_defeitos(v.respostas_funcional,v.defeitos_adicionais) AS defeitos,
         (SELECT count(DISTINCT nullif(btrim(t2.imei),'')) FROM public.assurant_triagem t2
          WHERE upper(btrim(t2.voucher))=e.voucher) variantes
       FROM public.assurant_triagem v
       WHERE upper(btrim(v.voucher))=e.voucher
       ORDER BY v.data_funcional DESC NULLS LAST,v.criado_em DESC NULLS LAST
       LIMIT 1
     ) t ON true
     WHERE NOT EXISTS (SELECT 1 FROM liquida_private.reparo_lab_itens ant
       WHERE upper(btrim(ant.voucher))=e.voucher)
     ON CONFLICT (voucher) DO NOTHING
     RETURNING id,voucher
   )
   SELECT count(*) INTO v_importados FROM criados;

   WITH e AS (SELECT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers))
   SELECT count(*)-count(DISTINCT voucher) INTO v_duplicados FROM e;
   -- Nova importação é somente pré-registro. Confirmação física ocorre em ação distinta.
   v_liberados:=0;
   v_ja_existiam:=greatest(0,v_total-v_importados-v_duplicados);
   INSERT INTO liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
   SELECT a.id,'importacao_aguardando_recebimento',NULL,
     jsonb_build_object('voucher',a.voucher,'status','aguardando_recebimento'),v_usuario
   FROM liquida_private.reparo_lab_avulsos a
   WHERE a.criado_por=v_usuario AND a.status='aguardando_recebimento'
     AND a.criado_em=transaction_timestamp()
     AND NOT EXISTS(SELECT 1 FROM liquida_private.reparo_lab_avulsos_eventos ev
       WHERE ev.item_id=a.id AND ev.acao='importacao_aguardando_recebimento');
   RETURN jsonb_build_object('ok',true,'linhas',v_total,'incluidos',v_importados,
                             'liberados_pendentes',v_liberados,
                             'ja_existentes',v_ja_existiam,'duplicados_na_planilha',v_duplicados,
                             'recebimento_confirmado_por',NULL,
                             'destino','aguardando_recebimento','origem','voucher_individual');
 END IF;

 IF p_acao='exportar' THEN
   RETURN jsonb_build_object('ok',true,'itens',coalesce(
     (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.voucher,q.origem)
      FROM (SELECT voucher,imei,status,'individual'::text origem FROM liquida_private.reparo_lab_avulsos
        UNION ALL SELECT voucher,imei,status,'historico'::text origem FROM liquida_private.reparo_lab_itens) q),'[]'::jsonb));
 END IF;
 IF p_acao='listar' THEN
   IF p_limite IS NULL OR p_limite<1 OR p_limite>200 OR p_offset<0 OR p_offset>200000
     THEN RAISE EXCEPTION 'Paginação inválida'; END IF;
   IF char_length(v_termo)>120 THEN RAISE EXCEPTION 'Busca muito longa'; END IF;
   IF p_status IS NOT NULL AND p_status NOT IN
       ('aguardando_recebimento','recebido','em_reparo','concluido','em_devolucao','devolvido_warehouse','divergencia_voucher')
     THEN RAISE EXCEPTION 'Status inválido'; END IF;

   WITH unidos AS MATERIALIZED (
     SELECT a.id,a.voucher,a.imei,a.modelo,a.sku,a.grade,a.status,
        a.os_referencia,a.os_numero,a.defeitos_origem,a.defeitos_atual,
        a.alerta_origem,a.recebido_em,a.recebido_por,a.tecnico_id,a.iniciado_em,
        a.concluido_em,a.resultado,a.observacoes,a.criado_em,a.atualizado_em,
        NULL::uuid AS pedido_id,NULL::uuid AS romaneio_saida_id,
        NULL::uuid AS romaneio_retorno_id,'individual'::text AS origem
     FROM liquida_private.reparo_lab_avulsos a
     UNION ALL
     SELECT i.id,i.voucher,i.imei,i.modelo,i.sku,NULL::text AS grade,i.status,
        i.os_referencia,i.os_numero,i.defeitos_origem,i.defeitos_atual,
        i.alerta_origem,i.recebido_em,i.recebido_por,i.tecnico_id,i.iniciado_em,
        i.concluido_em,i.resultado,i.observacoes,
        coalesce(i.recebido_em,i.atualizado_em) AS criado_em,i.atualizado_em,
        i.pedido_id,i.romaneio_saida_id,i.romaneio_retorno_id,'historico'::text AS origem
     FROM liquida_private.reparo_lab_itens i
   ), filtrado AS (
     SELECT * FROM unidos
     WHERE (p_status IS NULL OR status=p_status)
       AND (v_termo='' OR upper(coalesce(voucher,'')) LIKE '%'||v_termo||'%'
            OR upper(coalesce(imei,'')) LIKE '%'||v_termo||'%'
            OR upper(coalesce(os_numero,os_referencia,'')) LIKE '%'||v_termo||'%'
            OR upper(coalesce(modelo,'')) LIKE '%'||v_termo||'%')
   ), pagina AS (
     SELECT * FROM filtrado
     ORDER BY atualizado_em DESC,id DESC LIMIT p_limite OFFSET p_offset
   )
   SELECT jsonb_build_object(
      'total',(SELECT count(*) FROM filtrado),
      'resumo',(SELECT jsonb_object_agg(status,n) FROM
        (SELECT status,count(*) n FROM unidos GROUP BY status) s),
      'itens',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.atualizado_em DESC,x.id DESC) FROM pagina x),'[]'::jsonb)
   ) INTO v_lista;
   RETURN v_lista;
 END IF;

 IF p_item_id IS NULL THEN RAISE EXCEPTION 'Selecione um voucher'; END IF;
 SELECT * INTO v_avulso FROM liquida_private.reparo_lab_avulsos WHERE id=p_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Voucher individual não encontrado'; END IF;
 IF NOT liquida_private.reparo_lab_trilha_valida(v_avulso.voucher)
 THEN RAISE EXCEPTION 'Voucher sem histórico de recebimento e passagem pela triagem. Operação bloqueada.'
   USING ERRCODE='22023';
 END IF;
 v_antigo:=to_jsonb(v_avulso);
 IF p_acao='receber' THEN
   IF v_avulso.status<>'aguardando_recebimento' THEN RAISE EXCEPTION 'Voucher já foi recebido'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET status='recebido',
      recebido_em=now(),recebido_por=v_usuario,atualizado_em=now()
      WHERE id=v_avulso.id;
 ELSIF p_acao='validar_os' THEN
   IF v_avulso.status NOT IN ('recebido','em_reparo') THEN RAISE EXCEPTION 'OS disponível somente na bancada'; END IF;
   IF nullif(btrim(coalesce(p_os,'')),'') IS NULL OR length(p_os)>60
   THEN RAISE EXCEPTION 'Informe OS válida de até 60 caracteres'; END IF;
   IF EXISTS(SELECT 1 FROM liquida_private.reparo_lab_avulsos a
             WHERE upper(btrim(a.os_numero))=upper(btrim(p_os)) AND a.id<>v_avulso.id)
       OR EXISTS(SELECT 1 FROM liquida_private.reparo_lab_itens i
                 WHERE upper(btrim(i.os_numero))=upper(btrim(p_os)))
   THEN RAISE EXCEPTION 'OS já vinculada a outro voucher'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET os_numero=btrim(p_os),atualizado_em=now()
   WHERE id=v_avulso.id;
 ELSIF p_acao='salvar_defeitos' THEN
   IF v_avulso.status NOT IN ('recebido','em_reparo') THEN RAISE EXCEPTION 'Voucher não está disponível no técnico'; END IF;
   IF p_defeitos IS NULL OR jsonb_typeof(p_defeitos)<>'array' OR jsonb_array_length(p_defeitos)>60
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_defeitos) x
       WHERE jsonb_typeof(x.value)<>'string' OR length(x.value #>> '{}')>150)
   THEN RAISE EXCEPTION 'Defeitos inválidos'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=v_usuario AND up.is_master)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_defeitos) d
        WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(v_avulso.defeitos_atual,'[]'::jsonb)) atual
          WHERE lower(btrim(atual))=lower(btrim(d)))
          AND NOT EXISTS(SELECT 1 FROM public.triagem_defeitos cat
            WHERE cat.ativo IS TRUE AND lower(btrim(cat.nome))=lower(btrim(d))))
   THEN RAISE EXCEPTION 'Apenas administradores podem cadastrar defeitos fora do catálogo. Selecione um defeito existente.' USING ERRCODE='42501'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET status='em_reparo',
      defeitos_atual=p_defeitos,tecnico_id=v_usuario,
      iniciado_em=coalesce(iniciado_em,now()),atualizado_em=now()
      WHERE id=v_avulso.id;
 ELSIF p_acao='concluir' THEN
   IF v_avulso.status NOT IN ('recebido','em_reparo') THEN RAISE EXCEPTION 'Aparelho não está em reparo'; END IF;
   IF v_avulso.os_numero IS NULL THEN RAISE EXCEPTION 'Confirme a OS antes de concluir'; END IF;
   IF p_resultado IS NULL OR p_resultado NOT IN('reparado','sem_reparo','irrecuperavel') THEN
     RAISE EXCEPTION 'Informe resultado'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET status='concluido',
     tecnico_id=coalesce(tecnico_id,v_usuario),iniciado_em=coalesce(iniciado_em,now()),
     concluido_em=now(),resultado=p_resultado,
     observacoes=nullif(btrim(p_observacoes),''),atualizado_em=now()
   WHERE id=v_avulso.id;
 ELSE
   RAISE EXCEPTION 'Ação inválida'; END IF;
 SELECT * INTO v_avulso FROM liquida_private.reparo_lab_avulsos WHERE id=p_item_id;
 INSERT INTO liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
 VALUES(p_item_id,p_acao,v_antigo,to_jsonb(v_avulso),v_usuario);
 RETURN jsonb_build_object('ok',true,'item',to_jsonb(v_avulso)||jsonb_build_object('origem','individual'));
END $function$;

REVOKE ALL ON FUNCTION liquida_private.reparo_lab_enviado_warehouse(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION liquida_private.reparo_lab_bloquear_voucher_sem_trilha() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assurant_reparo_warehouse_planilha_gaia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_warehouse_planilha_gaia(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.assurant_reparo_lab_receber_os_gaia(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_lab_receber_os_gaia(jsonb) TO authenticated;
