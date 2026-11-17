-- Uma divergência já encaminhada ao Laboratório não pode ser recebida por fluxo antigo.
-- Bloqueio aplica-se inclusive a RPCs pré-existentes do Warehouse.
CREATE OR REPLACE FUNCTION liquida_private.reparo_lab_bloquear_recebimento_divergente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog'
AS $function$
BEGIN
 IF OLD.status IS DISTINCT FROM NEW.status
    AND NEW.status='devolvido_warehouse'
    AND EXISTS (
      SELECT 1 FROM liquida_private.reparo_lab_devolucoes_unificadas_itens di
      WHERE di.item_id=NEW.id
        AND di.origem=CASE WHEN TG_TABLE_NAME='reparo_lab_avulsos'
                          THEN 'individual' ELSE 'historico' END
        AND di.devolucao_lab_solicitada_em IS NOT NULL
    ) THEN
    RAISE EXCEPTION 'Aparelho com devolução solicitada ao Laboratório. Recebimento no Warehouse bloqueado até conciliação.' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_lab_bloquear_recebimento_divergente_avulsos ON liquida_private.reparo_lab_avulsos;
CREATE TRIGGER trg_lab_bloquear_recebimento_divergente_avulsos
BEFORE UPDATE OF status ON liquida_private.reparo_lab_avulsos
FOR EACH ROW EXECUTE FUNCTION liquida_private.reparo_lab_bloquear_recebimento_divergente();

DROP TRIGGER IF EXISTS trg_lab_bloquear_recebimento_divergente_itens ON liquida_private.reparo_lab_itens;
CREATE TRIGGER trg_lab_bloquear_recebimento_divergente_itens
BEFORE UPDATE OF status ON liquida_private.reparo_lab_itens
FOR EACH ROW EXECUTE FUNCTION liquida_private.reparo_lab_bloquear_recebimento_divergente();
