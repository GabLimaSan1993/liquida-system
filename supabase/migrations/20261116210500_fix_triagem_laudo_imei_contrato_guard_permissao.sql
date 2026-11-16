-- Hotfix: restaurar permissao do gatilho de IMEI contratual para Triagem Funcional e Laudo.
-- A funcao privada laudo_requer_imei_contrato nao deve receber EXECUTE de usuarios finais.
-- O gatilho dispara exclusivamente em mutacoes de assurant_triagem e usa search_path fixo.
-- A chamada interna ao validador e consulta do contrato executa como owner do gatilho.
ALTER FUNCTION liquida_private.triagem_laudo_imei_contrato_guard()
  SECURITY DEFINER;

-- Esta funcao e apenas para TRIGGER; nao expor acesso direto a API/usuarios.
REVOKE ALL ON FUNCTION liquida_private.triagem_laudo_imei_contrato_guard()
  FROM PUBLIC, anon, authenticated;
