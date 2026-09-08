import PedidosB2COperacaoV2Page from "./PedidosB2COperacaoV2Page.jsx";

export default function B2CV2Page() {
  return (
    <div className="b2c-v2">
      <style>{`
        /* =====================================================
           B2C — ASSURANT WAREHOUSE V2
           Camada visual.
           Não altera regras operacionais.
        ====================================================== */

        .b2c-v2 {
          --b2c-plum: #211136;
          --b2c-plum-light: #2A1747;
          --b2c-plum-hover: #190D2A;

          --b2c-soft: #F6F3F8;
          --b2c-soft-hover: #EEE8F2;
          --b2c-border: #DED6E6;
        }


        /* =====================================================
           MIGRA ROXO LEGADO PARA PLUM DO WORKSPACE
        ====================================================== */

        .b2c-v2 [class*="bg-[#7F2D92]"] {
          background-color: var(--b2c-plum) !important;
        }

        .b2c-v2 button[class*="bg-[#7F2D92]"] {
          background-color: var(--b2c-plum) !important;

          box-shadow:
            0 2px 6px rgba(33, 17, 54, 0.14) !important;
        }

        .b2c-v2 button[class*="bg-[#7F2D92]"]:hover {
          background-color: var(--b2c-plum-hover) !important;
        }

        .b2c-v2 [class*="hover:bg-[#5B1E74]"]:hover {
          background-color: var(--b2c-plum-hover) !important;
        }

        .b2c-v2 [class*="text-[#7F2D92]"] {
          color: var(--b2c-plum-light) !important;
        }

        .b2c-v2 [class*="border-[#7F2D92]"] {
          border-color: var(--b2c-plum) !important;
        }

        .b2c-v2 [class*="border-t-[#7F2D92]"] {
          border-top-color: var(--b2c-plum) !important;
        }


        /* =====================================================
           PURPLE TAILWIND LEGADO
        ====================================================== */

        .b2c-v2 [class*="bg-purple-50"] {
          background-color: var(--b2c-soft) !important;
        }

        .b2c-v2 [class*="bg-purple-100"] {
          background-color: #EEE8F2 !important;
        }

        .b2c-v2 [class*="text-purple-700"] {
          color: var(--b2c-plum-light) !important;
        }

        .b2c-v2 [class*="text-purple-600"] {
          color: #3B2455 !important;
        }

        .b2c-v2 [class*="text-purple-500"] {
          color: #654A82 !important;
        }

        .b2c-v2 [class*="ring-purple-200"] {
          --tw-ring-color: var(--b2c-border) !important;
        }

        .b2c-v2 [class*="ring-purple-300"] {
          --tw-ring-color: #C9BDD3 !important;
        }

        .b2c-v2 [class*="hover:bg-purple-50"]:hover {
          background-color: var(--b2c-soft) !important;
        }

        .b2c-v2 [class*="hover:text-purple-700"]:hover {
          color: var(--b2c-plum) !important;
        }


        /* =====================================================
           INPUTS
        ====================================================== */

        .b2c-v2 input,
        .b2c-v2 select,
        .b2c-v2 textarea {
          border-color: #DBE1E8 !important;

          transition:
            border-color 150ms ease,
            box-shadow 150ms ease;
        }

        .b2c-v2 input:focus,
        .b2c-v2 select:focus,
        .b2c-v2 textarea:focus {
          border-color: #80619F !important;

          box-shadow:
            0 0 0 3px rgba(42, 23, 71, 0.08) !important;
        }


        /* =====================================================
           CARDS
        ====================================================== */

        .b2c-v2 .bg-white.rounded-2xl {
          border-color: #E2E8F0 !important;

          box-shadow:
            0 1px 2px rgba(15, 23, 42, 0.03) !important;
        }


        /* =====================================================
           TABELAS
        ====================================================== */

        .b2c-v2 table thead tr {
          background: #F8FAFC !important;
        }

        .b2c-v2 table th {
          color: #64748B;

          font-size: 10px;
          font-weight: 800;

          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .b2c-v2 table tbody tr:hover {
          background-color: #FAF9FB !important;
        }


        /* =====================================================
           TIPOGRAFIA
        ====================================================== */

        .b2c-v2 h2,
        .b2c-v2 h3 {
          letter-spacing: -0.02em;
        }

        .b2c-v2 button {
          letter-spacing: -0.005em;
        }

/* =====================================================
   B2C — CABEÇALHO CORPORATIVO
====================================================== */

.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-3:first-child {
  min-height: 92px;

  padding: 20px 22px;

  border: 1px solid #e2e8f0;
  border-radius: 18px;

  background: #ffffff;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 1px 3px rgba(15, 23, 42, 0.03);
}


.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-3:first-child
  > span {
  display: flex;

  width: 42px;
  height: 42px;

  flex: 0 0 42px;

  align-items: center;
  justify-content: center;

  border-radius: 12px;

  background: #f6f3f8;

  font-size: 20px;
}


.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-3:first-child
  h2 {
  color: #0f172a;

  font-size: 18px;
  font-weight: 900;

  letter-spacing: -0.025em;
}


.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-3:first-child
  p {
  margin-top: 3px;

  color: #64748b;

  font-size: 11px;
  font-weight: 500;
}


/* =====================================================
   B2C — NAVEGAÇÃO DAS ETAPAS
====================================================== */

.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-2.overflow-x-auto.pb-1 {
  display: inline-flex;

  width: fit-content;
  max-width: 100%;

  gap: 4px;

  padding: 5px;

  border: 1px solid #e2e8f0;
  border-radius: 14px;

  background: #ffffff;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04);
}


.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-2.overflow-x-auto.pb-1
  button {
  min-height: 38px;

  padding-left: 15px;
  padding-right: 15px;

  border-radius: 10px !important;

  font-size: 11px !important;
  font-weight: 750;

  box-shadow: none !important;
}


/* Aba ativa */
.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-2.overflow-x-auto.pb-1
  button[class*="bg-[#7F2D92]"] {
  background:
    linear-gradient(
      180deg,
      #2a1747 0%,
      #211136 100%
    ) !important;

  color: #ffffff !important;

  box-shadow:
    0 2px 5px rgba(33, 17, 54, 0.18) !important;
}


/* Abas inativas */
.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-2.overflow-x-auto.pb-1
  button:not([class*="bg-[#7F2D92]"]) {
  color: #64748b !important;
}


.b2c-v2
  > .space-y-5
  > .flex.items-center.gap-2.overflow-x-auto.pb-1
  button:not([class*="bg-[#7F2D92]"]):hover {
  background: #f8fafc !important;

  color: #211136 !important;
}

/* =====================================================
   B2C — ALOCAÇÃO FIFO / BARRA OPERACIONAL
====================================================== */

/* Card exclusivo da barra de alocação */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"]) {
  padding: 16px 18px !important;

  border: 1px solid #e2e8f0 !important;
  border-radius: 14px !important;

  background: #ffffff !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03) !important;
}


/* Linha principal: corte + busca + atualizar */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .flex.items-center.gap-4.flex-wrap {
  gap: 12px !important;
}


/* Hora de corte */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  input[type="time"] {
  min-height: 38px;

  padding-left: 10px;
  padding-right: 10px;

  border: 1px solid #dbe1e8 !important;
  border-radius: 9px !important;

  background: #f8fafc !important;

  font-size: 12px !important;
  font-weight: 700;
}


/* Campo de busca */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  input[type="text"] {
  min-height: 40px;

  border-radius: 9px !important;

  background: #ffffff !important;

  font-size: 12px !important;
}


/* Botão atualizar */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .flex.items-center.gap-4.flex-wrap
  > button {
  min-height: 38px;

  padding: 0 12px;

  border: 1px solid #e2e8f0;
  border-radius: 9px;

  background: #ffffff;

  color: #64748b !important;

  font-size: 11px;
  font-weight: 700;
}


.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .flex.items-center.gap-4.flex-wrap
  > button:hover {
  border-color: #c9bdd3;

  background: #f8fafc !important;

  color: #211136 !important;
}


/* =====================================================
   FILTROS DE MARKETPLACE
====================================================== */

.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .mt-3.flex.items-center.gap-2.flex-wrap {
  margin-top: 14px !important;

  padding-top: 13px;

  border-top: 1px solid #f1f5f9;
}


/* Label Marketplace */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .mt-3.flex.items-center.gap-2.flex-wrap
  > span {
  margin-right: 2px;

  color: #64748b !important;

  font-size: 10px !important;
  font-weight: 800 !important;

  letter-spacing: 0.035em;

  text-transform: uppercase;
}


/* Botões dos marketplaces */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .mt-3.flex.items-center.gap-2.flex-wrap
  button {
  min-height: 30px;

  padding: 0 11px !important;

  border: 1px solid #e2e8f0;

  border-radius: 8px !important;

  font-size: 10px !important;
  font-weight: 700 !important;
}


/* Filtro ativo */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .mt-3.flex.items-center.gap-2.flex-wrap
  button[class*="bg-[#7F2D92]"] {
  border-color: #211136 !important;

  background: #211136 !important;

  color: #ffffff !important;
}


/* Filtro inativo */
.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  > .mt-3.flex.items-center.gap-2.flex-wrap
  button:not([class*="bg-[#7F2D92]"]) {
  background: #ffffff !important;

  color: #64748b !important;
}


/* =====================================================
   AVISO DE GRUPO PENDENTE
====================================================== */

.b2c-v2
  .bg-white.rounded-2xl:has(input[type="time"])
  .bg-amber-50.ring-1.ring-amber-200 {
  border: 1px solid #fde68a !important;
  border-left: 3px solid #d97706 !important;

  border-radius: 10px !important;

  box-shadow: none !important;
}
/* =====================================================
   B2C — PICKING / SELEÇÃO DE GRUPOS
====================================================== */

.b2c-v2 .b2c-picking-grupos {
  padding-top: 2px;
}


/* Cabeçalho da fila */
.b2c-v2
  .b2c-picking-grupos
  > .flex.items-center.justify-between {
  min-height: 48px;

  padding: 0 4px 8px;

  border-bottom: 1px solid #e8edf3;
}


.b2c-v2
  .b2c-picking-grupos
  > .flex.items-center.justify-between
  > p {
  color: #475569;

  font-size: 12px;
  font-weight: 700;
}


/* Atualizar */
.b2c-v2
  .b2c-picking-grupos
  > .flex.items-center.justify-between
  > button {
  min-height: 34px;

  padding: 0 11px;

  border: 1px solid #e2e8f0;
  border-radius: 9px;

  background: #ffffff;

  color: #64748b !important;

  font-size: 10px;
  font-weight: 700;

  box-shadow: none !important;
}


.b2c-v2
  .b2c-picking-grupos
  > .flex.items-center.justify-between
  > button:hover {
  border-color: #c9bdd3;

  background: #f8fafc !important;

  color: #211136 !important;
}


/* Grid de grupos */
.b2c-v2
  .b2c-picking-grupos
  > .grid.gap-3 {
  display: grid;

  grid-template-columns:
    repeat(4, minmax(0, 1fr));

  gap: 12px;
}


/* Notebook / tela média */
@media (max-width: 1450px) {
  .b2c-v2
    .b2c-picking-grupos
    > .grid.gap-3 {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}


/* Tablet / janela menor */
@media (max-width: 980px) {
  .b2c-v2
    .b2c-picking-grupos
    > .grid.gap-3 {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}


/* Mobile */
@media (max-width: 640px) {
  .b2c-v2
    .b2c-picking-grupos
    > .grid.gap-3 {
    grid-template-columns: 1fr;
  }
}


/* Cards dos grupos */
.b2c-v2
  .b2c-picking-grupos
  > .grid.gap-3
  > div {
  min-height: 118px;

  padding: 16px !important;

  border-radius: 14px !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03) !important;
}


/* Grupo disponível */
.b2c-v2
  .b2c-picking-grupos
  > .grid.gap-3
  > div[class*="bg-white"] {
  border-color: #e2e8f0 !important;

  background: #ffffff !important;
}


.b2c-v2
  .b2c-picking-grupos
  > .grid.gap-3
  > div[class*="bg-white"]:hover {
  border-color: #bcaec9 !important;

  background: #faf9fb !important;

  box-shadow:
    0 4px 12px rgba(33, 17, 54, 0.06) !important;
}


/* Título Grupo # */
.b2c-v2
  .b2c-picking-grupos
  .font-black.text-slate-800 {
  color: #172033 !important;

  font-size: 13px;
  font-weight: 850;
}


/* Marketplace */
.b2c-v2
  .b2c-picking-grupos
  span[class*="bg-purple-50"] {
  border-color: #ded6e6 !important;

  background: #f6f3f8 !important;

  color: #2a1747 !important;
}


/* Barra de progresso */
.b2c-v2
  .b2c-picking-grupos
  .h-2.bg-slate-100 {
  height: 5px !important;

  margin-top: 2px;

  background: #eef2f6 !important;
}


.b2c-v2
  .b2c-picking-grupos
  .h-2.bg-slate-100
  > div {
  background:
    linear-gradient(
      90deg,
      #2a1747 0%,
      #211136 100%
    ) !important;
}

/* =====================================================
   B2C — PICKING / GRUPO ABERTO
====================================================== */

.b2c-v2 .b2c-picking-grupo-aberto {
  padding-top: 2px;
}


/* Cabeçalho do grupo */
.b2c-v2
  .b2c-picking-grupo-aberto
  > .flex.items-center.gap-3.flex-wrap {
  min-height: 64px;

  padding: 12px 14px;

  border: 1px solid #e2e8f0;
  border-radius: 14px;

  background: #ffffff;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03);
}


/* Botão trocar grupo */
.b2c-v2
  .b2c-picking-grupo-aberto
  > .flex.items-center.gap-3.flex-wrap
  > button {
  min-height: 32px;

  padding: 0 10px;

  border: 1px solid #e2e8f0;
  border-radius: 8px;

  background: #f8fafc;

  color: #64748b !important;

  font-size: 10px;
  font-weight: 700;
}


.b2c-v2
  .b2c-picking-grupo-aberto
  > .flex.items-center.gap-3.flex-wrap
  > button:hover {
  border-color: #c9bdd3;

  background: #f6f3f8 !important;

  color: #211136 !important;
}


/* Nome do grupo */
.b2c-v2
  .b2c-picking-grupo-aberto
  > .flex.items-center.gap-3.flex-wrap
  h3 {
  color: #172033 !important;

  font-size: 14px !important;
  font-weight: 850 !important;
}


/* Quantidade de pedidos */
.b2c-v2
  .b2c-picking-grupo-aberto
  > .flex.items-center.gap-3.flex-wrap
  p {
  margin-top: 2px;

  color: #64748b !important;

  font-size: 10px !important;
  font-weight: 600;
}


/* =====================================================
   KPIs DO GRUPO
====================================================== */

.b2c-v2
  .b2c-picking-grupo-aberto
  > .grid.grid-cols-3.gap-3 {
  gap: 10px;
}


.b2c-v2
  .b2c-picking-grupo-aberto
  > .grid.grid-cols-3.gap-3
  > div {
  min-height: 82px;

  padding: 13px 14px !important;

  border-radius: 12px !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.02) !important;
}


/* Valor principal */
.b2c-v2
  .b2c-picking-grupo-aberto
  > .grid.grid-cols-3.gap-3
  .text-2xl.font-black {
  font-size: 20px !important;
  line-height: 1.1;

  letter-spacing: -0.025em;
}


/* Label */
.b2c-v2
  .b2c-picking-grupo-aberto
  > .grid.grid-cols-3.gap-3
  .text-xs.font-semibold {
  margin-top: 4px;

  font-size: 10px !important;
  font-weight: 750 !important;
}


/* Subtexto / percentual */
.b2c-v2
  .b2c-picking-grupo-aberto
  > .grid.grid-cols-3.gap-3
  .opacity-60 {
  font-size: 10px !important;
}


@media (max-width: 720px) {
  .b2c-v2
    .b2c-picking-grupo-aberto
    > .grid.grid-cols-3.gap-3 {
    grid-template-columns: 1fr;
  }
}

/* =====================================================
   B2C — PICKING / BIPAGEM
====================================================== */

.b2c-v2 .b2c-picking-bipagem {
  padding: 18px !important;

  border: 1px solid #ded6e6 !important;
  border-radius: 16px !important;

  background: #ffffff !important;

  box-shadow:
    0 2px 8px rgba(33, 17, 54, 0.04) !important;
}


/* Barra de progresso */
.b2c-v2
  .b2c-picking-bipagem
  > .h-3.bg-slate-100 {
  height: 6px !important;

  margin-bottom: 16px !important;

  background: #eef2f6 !important;
}


.b2c-v2
  .b2c-picking-bipagem
  > .h-3.bg-slate-100
  > div {
  background:
    linear-gradient(
      90deg,
      #2a1747 0%,
      #211136 100%
    ) !important;
}


/* Título Bipar IMEI */
.b2c-v2
  .b2c-picking-bipagem
  > h3 {
  margin-bottom: 10px !important;

  color: #172033 !important;

  font-size: 12px !important;
  font-weight: 850 !important;
}


/* Linha de bipagem */
.b2c-v2
  .b2c-picking-bipagem
  > form {
  display: grid;

  grid-template-columns:
    minmax(0, 1fr) auto;

  gap: 10px;
}


/* Campo de IMEI */
.b2c-v2
  .b2c-picking-bipagem
  > form
  input {
  min-height: 46px;

  padding-left: 14px;
  padding-right: 14px;

  border: 1px solid #dbe1e8 !important;
  border-radius: 11px !important;

  background: #fbfcfd !important;

  font-size: 13px !important;
  font-weight: 650 !important;
}


/* Botão confirmar */
.b2c-v2
  .b2c-picking-bipagem
  > form
  button {
  min-width: 132px;
  min-height: 46px;

  padding-left: 18px !important;
  padding-right: 18px !important;

  border-radius: 11px !important;

  background:
    linear-gradient(
      180deg,
      #2a1747 0%,
      #211136 100%
    ) !important;

  font-size: 11px !important;
  font-weight: 800 !important;

  box-shadow:
    0 2px 5px rgba(33, 17, 54, 0.16) !important;
}


/* Painel de conferência */
.b2c-v2
  .b2c-picking-bipagem
  > .mt-4.rounded-2xl {
  margin-top: 14px !important;

  padding: 16px !important;

  border: 1px solid #ded6e6 !important;
  border-radius: 13px !important;

  background: #f8f6fa !important;

  box-shadow: none !important;
}


@media (max-width: 720px) {
  .b2c-v2
    .b2c-picking-bipagem
    > form {
    grid-template-columns: 1fr;
  }

  .b2c-v2
    .b2c-picking-bipagem
    > form
    button {
    width: 100%;
  }
}

/* =====================================================
   B2C — PICKING / PEDIDOS DO GRUPO EM GRADE
====================================================== */

.b2c-v2
  .b2c-picking-pedidos-grid {
  display: grid;

  grid-template-columns:
    repeat(4, minmax(0, 1fr));

  gap: 10px;
}


/* Card de cada pedido */
.b2c-v2
  .b2c-picking-pedidos-grid
  > div {
  min-width: 0;
  min-height: 132px;

  display: flex !important;
  flex-direction: column;
  align-items: stretch !important;
  justify-content: space-between !important;

  gap: 10px !important;

  padding: 13px 14px !important;

  border-radius: 12px !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.025) !important;
}


/* Conteúdo principal do pedido */
.b2c-v2
  .b2c-picking-pedidos-grid
  > div
  > .flex-1 {
  width: 100%;
}


/* Pedido */
.b2c-v2
  .b2c-picking-pedidos-grid
  .font-black.text-slate-800.text-xs {
  font-size: 11px !important;
}


/* IMEI */
.b2c-v2
  .b2c-picking-pedidos-grid
  .font-mono.text-xs {
  font-size: 10px !important;
}


/* Produto */
.b2c-v2
  .b2c-picking-pedidos-grid
  p {
  font-size: 10px !important;

  line-height: 1.35;
}


/* Localização e voucher */
.b2c-v2
  .b2c-picking-pedidos-grid
  span[class*="rounded-lg"] {
  font-size: 9px !important;
}


/* Status + Não localizado */
.b2c-v2
  .b2c-picking-pedidos-grid
  > div
  > .flex.items-center.gap-2.shrink-0 {
  width: 100%;

  justify-content: space-between;

  flex-wrap: wrap;
}


/* Botão Não localizado */
.b2c-v2
  .b2c-picking-pedidos-grid
  button {
  min-height: 28px;

  padding: 0 9px !important;

  border-radius: 8px !important;

  font-size: 9px !important;
}


/* Notebook */
@media (max-width: 1450px) {
  .b2c-v2
    .b2c-picking-pedidos-grid {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}


/* Tela menor */
@media (max-width: 980px) {
  .b2c-v2
    .b2c-picking-pedidos-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}


/* Mobile */
@media (max-width: 640px) {
  .b2c-v2
    .b2c-picking-pedidos-grid {
    grid-template-columns: 1fr;
  }
}

/* =====================================================
   B2C — EM ANÁLISE / PEDIDOS EM GRADE
====================================================== */

.b2c-v2
  .b2c-analise-grid {
  display: grid;

  grid-template-columns:
    repeat(4, minmax(0, 1fr));

  gap: 12px;
}


/* Card */
.b2c-v2
  .b2c-analise-grid
  > .bg-white.rounded-2xl {
  min-width: 0;
  min-height: 210px;

  padding: 15px !important;

  border-radius: 14px !important;

  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.03) !important;
}


/* Conteúdo interno vira vertical */
.b2c-v2
  .b2c-analise-grid
  > .bg-white.rounded-2xl
  > .flex.items-start.justify-between {
  height: 100%;

  display: flex;

  flex-direction: column;

  align-items: stretch;

  justify-content: space-between;

  gap: 12px;
}


/* Área das informações */
.b2c-v2
  .b2c-analise-grid
  .flex-1.min-w-0 {
  width: 100%;
}


/* Número do pedido */
.b2c-v2
  .b2c-analise-grid
  .font-black.text-slate-800.text-sm {
  font-size: 12px !important;
}


/* Produto */
.b2c-v2
  .b2c-analise-grid
  p.text-sm {
  font-size: 11px !important;

  line-height: 1.35;
}


/* Informações secundárias */
.b2c-v2
  .b2c-analise-grid
  p.text-xs,
.b2c-v2
  .b2c-analise-grid
  span.text-xs {
  font-size: 9px !important;

  line-height: 1.35;
}


/* Botão Resolver */
.b2c-v2
  .b2c-analise-grid
  > .bg-white.rounded-2xl
  > .flex.items-start.justify-between
  > button {
  width: 100%;
  min-height: 34px;

  justify-content: center;

  border-radius: 9px !important;

  font-size: 10px !important;
  font-weight: 800 !important;
}


/* Notebook */
@media (max-width: 1450px) {
  .b2c-v2
    .b2c-analise-grid {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}


/* Tela menor */
@media (max-width: 980px) {
  .b2c-v2
    .b2c-analise-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}


/* Mobile */
@media (max-width: 640px) {
  .b2c-v2
    .b2c-analise-grid {
    grid-template-columns: 1fr;
  }
}

/* =====================================================
   B2C — AGUARDANDO DEFINIÇÃO / GRADE
====================================================== */

.b2c-v2
  .b2c-definicao-grid {
  display: grid;

  grid-template-columns:
    repeat(4, minmax(0, 1fr));

  gap: 12px;
}


/* Texto de quantidade dos pendentes ocupa a linha inteira */
.b2c-v2
  .b2c-definicao-grid
  > p:first-child {
  grid-column: 1 / -1;

  margin-bottom: 0;
}


/* Cards */
.b2c-v2
  .b2c-definicao-grid
  > .bg-white.rounded-2xl {
  min-width: 0;
  min-height: 190px;

  padding: 15px !important;

  border-radius: 14px !important;

  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.03) !important;
}


/* Estrutura interna vertical */
.b2c-v2
  .b2c-definicao-grid
  > .bg-white.rounded-2xl
  > .flex.items-start.justify-between {
  height: 100%;

  display: flex;

  flex-direction: column;

  align-items: stretch;

  justify-content: space-between;

  gap: 12px;
}


/* Informações */
.b2c-v2
  .b2c-definicao-grid
  .flex-1.min-w-0 {
  width: 100%;
}


/* Número do pedido */
.b2c-v2
  .b2c-definicao-grid
  .font-black.text-slate-800.text-sm {
  font-size: 12px !important;
}


/* Produto */
.b2c-v2
  .b2c-definicao-grid
  p.text-sm {
  font-size: 11px !important;

  line-height: 1.35;
}


/* Informações menores */
.b2c-v2
  .b2c-definicao-grid
  p.text-xs,
.b2c-v2
  .b2c-definicao-grid
  span.text-xs {
  font-size: 9px !important;
}


/* Área dos botões */
.b2c-v2
  .b2c-definicao-grid
  .flex.items-center.gap-2.shrink-0 {
  width: 100%;

  display: grid;

  grid-template-columns:
    repeat(3, minmax(0, 1fr));

  gap: 6px;
}


/* Botões dos pendentes */
.b2c-v2
  .b2c-definicao-grid
  .flex.items-center.gap-2.shrink-0
  button {
  min-width: 0;
  min-height: 34px;

  justify-content: center;

  padding-left: 7px !important;
  padding-right: 7px !important;

  border-radius: 9px !important;

  font-size: 9px !important;
}


/* Notebook */
@media (max-width: 1450px) {
  .b2c-v2
    .b2c-definicao-grid {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}


/* Tela menor */
@media (max-width: 980px) {
  .b2c-v2
    .b2c-definicao-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}


/* Mobile */
@media (max-width: 640px) {
  .b2c-v2
    .b2c-definicao-grid {
    grid-template-columns: 1fr;
  }

  .b2c-v2
    .b2c-definicao-grid
    .flex.items-center.gap-2.shrink-0 {
    grid-template-columns: 1fr;
  }
}

/* =====================================================
   B2C — FATURAMENTO / GRUPOS EM GRADE
====================================================== */

.b2c-v2
  .b2c-faturamento-grid {
  display: grid;

  grid-template-columns:
    repeat(4, minmax(0, 1fr));

  gap: 12px;
}


/* Card de grupo */
.b2c-v2
  .b2c-faturamento-grid
  > .bg-white.rounded-2xl {
  min-width: 0;
  min-height: 190px;

  display: flex;
  flex-direction: column;

  padding: 15px !important;

  border-radius: 14px !important;

  box-shadow:
    0 1px 3px rgba(15, 23, 42, 0.03) !important;
}


/* Cabeçalho */
.b2c-v2
  .b2c-faturamento-grid
  > .bg-white.rounded-2xl
  > .flex.items-start.justify-between {
  width: 100%;

  gap: 10px !important;
}


/* Nome Grupo */
.b2c-v2
  .b2c-faturamento-grid
  .font-black.text-slate-800 {
  font-size: 12px !important;
}


/* Informações */
.b2c-v2
  .b2c-faturamento-grid
  .text-xs {
  font-size: 9px !important;

  line-height: 1.4;
}


/* Área de ações */
.b2c-v2
  .b2c-faturamento-grid
  > .bg-white.rounded-2xl
  > .flex.items-center.gap-2.flex-wrap {
  margin-top: auto;

  padding-top: 12px;

  display: grid;

  grid-template-columns:
    repeat(2, minmax(0, 1fr));

  gap: 7px;
}


/* Botões */
.b2c-v2
  .b2c-faturamento-grid
  button {
  min-width: 0;
  min-height: 34px;

  justify-content: center;

  padding-left: 8px !important;
  padding-right: 8px !important;

  border-radius: 9px !important;

  font-size: 9px !important;
}


/* Conteúdo expandido */
.b2c-v2
  .b2c-faturamento-grid
  .border-t.border-slate-100 {
  width: 100%;
}


/* Notebook */
@media (max-width: 1450px) {
  .b2c-v2
    .b2c-faturamento-grid {
    grid-template-columns:
      repeat(3, minmax(0, 1fr));
  }
}


/* Tela menor */
@media (max-width: 980px) {
  .b2c-v2
    .b2c-faturamento-grid {
    grid-template-columns:
      repeat(2, minmax(0, 1fr));
  }
}


/* Mobile */
@media (max-width: 640px) {
  .b2c-v2
    .b2c-faturamento-grid {
    grid-template-columns: 1fr;
  }
}
      `}</style>

      <PedidosB2COperacaoV2Page />
    </div>
  );
}