# Controles operacionais Assurant

Implementação de 22/10/2026. Complementa telas existentes. O usuário deixou GRV Online e a definição do modelo dos fechamentos para depois ao responder o formulário de escopo.

| Solicitação | Implementação / situação |
|---|---|
| Inventário geral e alocações | Estoque → Consulta → Inventário geral. Saldo físico, reserva de saída, referência do compromisso e divergências; pesquisa e paginação. |
| Fechamento diário e mensal de produção Assurant | Adiados com a definição do modelo. A consulta diária/mensal e a exportação da produção existente continuam disponíveis. Fechamento de lojas e fechamento do inventário são processos distintos. |
| Entradas Correios | Recebimento → novo recebimento → Correios. Um objeto por recebimento, código de 13 caracteres obrigatório e único. Vouchers seguem o fluxo de recebimento existente. Consulta por datas, objeto ou voucher e auditoria de alterações. Sem integração externa de rastreamento. |
| GRV Online | Adiado; regras e integração ainda não definidas. |
| Baixa manual B2C | Nova tela, com prévia, justificativa, aprovação por outro usuário autorizado e efetivação atômica da retirada WMS. |
| Dashboard e metas | Produção da Esteira → Gestão à vista. Metas e objetivos por dia e etapa, realizado, desvio e atingimento; comparação mantém as unidades de cada etapa. |
| Acuracidade 97% | Inventário cíclico → Gestão. Indicador bruto e ajustado separados, referência de 97%, critérios documentados na tela. Validação operacional da metodologia pendente. |
| Funcionários × produção | Produção da Esteira → Gestão à vista. Presença, equipe e horas opcionais informadas por dia; produção operacional por funcionário e equipe, inclusive presentes sem produção. Exportação do período completo. |

## Identidade física e saldos

O inventário geral usa alocações WMS confirmadas e sem retirada. Uma reserva comercial não cria uma unidade adicional. São sinalizados IMEIs ou endereços duplicados, endereço inativo/ausente, status incompatível e reservas inconsistentes. Bloqueios, compromissos e divergências podem se sobrepor. Sem reserva e consistente não significa autorização comercial de venda; Oracle, regras de canal e demais bloqueios permanecem nos fluxos oficiais. A consulta não reconcilia nem altera estoque.

## Baixa manual B2C

- Pedido faturado ou concluído, faturamento e NF registrados, IMEI alocado e consistente com o bipado, quando preenchido.
- Uma única alocação física confirmada, entrada anterior ou igual ao faturamento, endereço ativo e exclusivo.
- Vínculo exato do pedido com a alocação atual ou reserva B2C ativa da mesma referência. IMEI isolado não comprova identidade entre entradas diferentes.
- Impede compromissos conflitantes e exige justificativa de pelo menos 10 caracteres.
- Solicitar não altera o estoque. Há uma solicitação pendente por alocação.
- Aprovar exige outro usuário com permissão específica, parecer e nova validação de pedido e posição. Mudança desde a solicitação exige rejeição e nova solicitação.
- Aprovação e retirada usam uma transação; chama a retirada oficial do WMS, mantém os dados comerciais do pedido, registra responsável e libera endereço. Não emite NF, não registra coleta e não contorna testes MELI ou preparação comercial.
- Rejeição preserva estoque. Eventos e registros de decisão mantidos em tabelas privadas, sem escrita direta do cliente.

Permissões centrais: `B2C — Solicitar e consultar baixas manuais` e `B2C — Aprovar baixas manuais`. Exige identidade Liquida ou master e permissão explícita. Inicialmente habilitado apenas para o proprietário Gabriel; outros usuários devem receber os acessos na gestão de usuários. O próprio solicitante nunca aprova.

## Metas, efetivo e produtividade

Não são geradas metas ou presenças retrospectivas. A operação informa meta, objetivo, equipe e presença diária; alterações registram justificativa, usuário, data, antes e depois. Versão de registro evita sobrescrever alteração concorrente. Perfil master com acesso a Produção ou permissão `Configurar metas e efetivo diário` pode editar. Presença futura é bloqueada. Horas são opcionais; ausência aceita somente zero ou ausência de horas.

Dias sem meta não entram no comparativo; meta zero mantém desvio e não apresenta percentual. Produção segue a mesma fonte da Produção da Esteira. Expedição permanece em volumes, separada das execuções de itens/aparelhos. Um produto pode concluir várias etapas. Equipe vem do registro diário e não é inferida do usuário. Produção sem presença, equipe ou responsável continua visível para conferência. Não representa cálculo de folha, ponto ou bonificação.

## Acuracidade

Indicador bruto por registro/endereço: `conferidas / (conferidas + sobras + conflitos + todas as faltas) × 100`. Somente contagens concluídas. Referência 97% comparada antes do arredondamento. Sem denominador: sem resultado.

Indicador ajustado exclui faltas reconciliadas do denominador, sem apagar o desvio bruto. Por endereço: endereços concluídos sem desvio / endereços concluídos; endereço vazio concluído sem desvio é consistente. Um produto localizado em outro endereço pode gerar falta na origem e sobra no destino; não se trata de índice por IMEI único ou perda financeira. A apuração do ciclo ocorre integralmente no banco, sem limite de mil linhas. Snapshots históricos dos fechamentos não são recalculados. Critérios, referência e tratamento de desvios devem ser validados pela área operacional.

## Verificação

- Build de produção e lint dos novos componentes, hook e serviços.
- Testes de comparação de metas, separação de volumes, presença sem produção e acuracidade.
- `supabase/tests/controles_operacionais.sql`: fixtures e movimentações em transação com rollback; acesso anônimo, versão concorrente, auditoria, mais de mil itens, Correios, prévia/solicitação sem baixa, duplicidade, aprovação própria, alocação alterada, aprovação por outro usuário, retirada e bloqueio de repetição.
- Conferência dos RPCs com papel `authenticated`. Nenhum dado operacional de teste permanece.
- Navegação autenticada de interface depende de sessão; o navegador disponível apresentou login.
