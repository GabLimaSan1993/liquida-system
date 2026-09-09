import B2BPickingPage from "../B2BPickingPage.jsx";
import B2BPainelGestorPage from "../B2BPainelGestorPage.jsx";

export default function B2BV2Page({ tipo = "picking" }) {
  const abaInicial =
    tipo === "faturamento"
      ? "pedidos"
      : tipo;
  return (
    <div className="b2b-v2">
      <style>{`
        /* =====================================================
           B2B — ASSURANT WORKSPACE V2

           Tema visual exclusivo da versão V2.
           Não altera nenhuma regra operacional.
        ====================================================== */

        .b2b-v2 {
          --b2b-plum: #211136;
          --b2b-plum-light: #2A1747;
          --b2b-plum-hover: #190D2A;

          --b2b-soft: #F6F3F8;
          --b2b-soft-hover: #EEE8F2;
          --b2b-border: #DED6E6;
        }

        /* =====================================================
           COR PRINCIPAL ANTIGA
        ====================================================== */

        .b2b-v2 [class*="bg-[#7F2D92]"] {
          background-color: var(--b2b-plum) !important;
        }

        .b2b-v2 [class*="text-[#7F2D92]"] {
          color: var(--b2b-plum-light) !important;
        }

        .b2b-v2 [class*="border-t-[#7F2D92]"] {
          border-top-color: var(--b2b-plum) !important;
        }

        /* =====================================================
           BOTÕES PRINCIPAIS
        ====================================================== */

        .b2b-v2 button[class*="bg-[#7F2D92]"] {
          background-color: var(--b2b-plum) !important;

          box-shadow:
            0 1px 2px rgba(15, 23, 42, 0.08),
            0 4px 12px rgba(33, 17, 54, 0.12) !important;
        }

        .b2b-v2 button[class*="bg-[#7F2D92]"]:hover {
          background-color: var(--b2b-plum-hover) !important;
        }

        .b2b-v2 [class*="hover:bg-[#5B1E74]"]:hover {
          background-color: var(--b2b-plum-hover) !important;
        }

        /* =====================================================
           PURPLE LEGADO -> PLUM V2
        ====================================================== */

        .b2b-v2 [class*="bg-purple-50"] {
          background-color: var(--b2b-soft) !important;
        }

        .b2b-v2 [class*="bg-purple-100"] {
          background-color: #EEE8F2 !important;
        }

        .b2b-v2 [class*="text-purple-700"] {
          color: var(--b2b-plum-light) !important;
        }

        .b2b-v2 [class*="text-purple-600"] {
          color: #3B2455 !important;
        }

        .b2b-v2 [class*="text-purple-500"] {
          color: #654A82 !important;
        }

        .b2b-v2 [class*="border-purple-200"] {
          border-color: var(--b2b-border) !important;
        }

        .b2b-v2 [class*="ring-purple-100"] {
          --tw-ring-color: #EEE8F2 !important;
        }

        .b2b-v2 [class*="ring-purple-200"] {
          --tw-ring-color: var(--b2b-border) !important;
        }

        .b2b-v2 [class*="ring-purple-300"] {
          --tw-ring-color: #C9BDD3 !important;
        }

        /* =====================================================
           HOVERS
        ====================================================== */

        .b2b-v2 [class*="hover:bg-purple-50"]:hover {
          background-color: var(--b2b-soft) !important;
        }

        .b2b-v2 [class*="hover:bg-purple-100"]:hover {
          background-color: var(--b2b-soft-hover) !important;
        }

        .b2b-v2 [class*="hover:text-purple-700"]:hover {
          color: var(--b2b-plum) !important;
        }

        .b2b-v2 [class*="hover:ring-purple-300"]:hover {
          --tw-ring-color: #A995BA !important;
        }

        /* =====================================================
           INPUTS
        ====================================================== */

        .b2b-v2 [class*="focus:ring-[#7F2D92]"]:focus {
          --tw-ring-color: rgba(42, 23, 71, 0.22) !important;
        }

        /* =====================================================
           BARRAS DE PROGRESSO / LOADERS
        ====================================================== */

        .b2b-v2 [class*="border-purple-200"] {
          border-color: #D8CFE0 !important;
        }

        /* =====================================================
           CARDS
        ====================================================== */

        .b2b-v2 .shadow-sm {
          box-shadow:
            0 1px 2px rgba(15, 23, 42, 0.04),
            0 1px 3px rgba(15, 23, 42, 0.03);
        }

        /* =====================================================
           BOTÕES E INTERAÇÕES
        ====================================================== */

        .b2b-v2 button {
          letter-spacing: -0.005em;
        }

        .b2b-v2 input,
        .b2b-v2 select,
        .b2b-v2 textarea {
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease,
            background-color 150ms ease;
        }
        /* =====================================================
   CABEÇALHO B2B V2
====================================================== */

.b2b-v2 > .space-y-5 > div:first-of-type {
  min-height: 92px;
  padding: 20px 22px;

  border: 1px solid #e2e8f0;
  border-radius: 18px;

  background: #ffffff;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 1px 3px rgba(15, 23, 42, 0.03);
}

.b2b-v2 > .space-y-5 > div:first-of-type > div:first-child {
  gap: 14px;
}

.b2b-v2 > .space-y-5 > div:first-of-type > div:first-child > span {
  display: flex;
  width: 42px;
  height: 42px;

  align-items: center;
  justify-content: center;

  border-radius: 12px;

  background: #f6f3f8;

  font-size: 20px;
}

.b2b-v2 > .space-y-5 > div:first-of-type h2 {
  color: #0f172a;

  font-size: 18px;
  font-weight: 900;

  letter-spacing: -0.025em;
}

.b2b-v2 > .space-y-5 > div:first-of-type h2 + p {
  margin-top: 3px;

  color: #64748b;

  font-size: 11px;
  font-weight: 500;
}


/* =====================================================
   ABAS B2B
====================================================== */

.b2b-v2 > .space-y-5 > div:nth-of-type(2) {
  display: inline-flex;
  width: fit-content;

  gap: 4px;

  padding: 5px;

  border: 1px solid #e2e8f0;
  border-radius: 14px;

  background: #ffffff;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04);
}

.b2b-v2 > .space-y-5 > div:nth-of-type(2) button {
  min-height: 38px;

  border-radius: 10px;

  padding-left: 16px;
  padding-right: 16px;

  font-size: 12px;
  font-weight: 700;

  box-shadow: none !important;
}


/* Aba selecionada */
.b2b-v2
  > .space-y-5
  > div:nth-of-type(2)
  button[class*="bg-[#7F2D92]"] {
  background: linear-gradient(
    180deg,
    #2a1747 0%,
    #211136 100%
  ) !important;

  color: #ffffff !important;

  box-shadow:
    0 2px 5px rgba(33, 17, 54, 0.18) !important;
}


/* Aba não selecionada */
.b2b-v2
  > .space-y-5
  > div:nth-of-type(2)
  button:not([class*="bg-[#7F2D92]"]) {
  color: #64748b !important;
}

.b2b-v2
  > .space-y-5
  > div:nth-of-type(2)
  button:not([class*="bg-[#7F2D92]"]):hover {
  background: #f8fafc !important;
  color: #211136 !important;
}


/* =====================================================
   ÁREA DE CONTEÚDO
====================================================== */

.b2b-v2 > .space-y-5 {
  gap: 18px;
}

.b2b-v2 .rounded-2xl {
  border-radius: 14px;
}

.b2b-v2 table thead {
  background: #f8fafc;
}

.b2b-v2 table th {
  color: #64748b;

  font-size: 10px;
  font-weight: 800;

  letter-spacing: 0.04em;
  text-transform: uppercase;
}

/* =====================================================
   CARDS OPERACIONAIS
====================================================== */

.b2b-v2 .bg-white.rounded-2xl.p-5.ring-1 {
  border: 1px solid #e2e8f0 !important;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03),
    0 4px 12px rgba(15, 23, 42, 0.025) !important;
}


/* =====================================================
   LISTAS DE PEDIDOS
====================================================== */

.b2b-v2 button.bg-white.rounded-2xl.ring-1 {
  border: 1px solid #e2e8f0 !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03) !important;

  transition:
    border-color 150ms ease,
    background-color 150ms ease,
    box-shadow 150ms ease,
    transform 150ms ease !important;
}

.b2b-v2 button.bg-white.rounded-2xl.ring-1:hover {
  background-color: #fbfafc !important;
  border-color: #cfc3d8 !important;

  box-shadow:
    0 4px 12px rgba(33, 17, 54, 0.06) !important;

  transform: translateY(-1px);
}


/* =====================================================
   KPIs
====================================================== */

.b2b-v2 .grid > div.rounded-xl.p-4.ring-1 {
  border: 1px solid rgba(148, 163, 184, 0.18);

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.025);
}

.b2b-v2 .grid > div.rounded-xl.p-4.ring-1 .text-2xl {
  letter-spacing: -0.03em;
}


/* =====================================================
   INPUTS / BUSCAS / BIPAGEM
====================================================== */

.b2b-v2 input,
.b2b-v2 select,
.b2b-v2 textarea {
  border-color: #dbe1e8 !important;
  background-color: #ffffff;
}

.b2b-v2 input:focus,
.b2b-v2 select:focus,
.b2b-v2 textarea:focus {
  border-color: #80619f !important;

  box-shadow:
    0 0 0 3px rgba(42, 23, 71, 0.08) !important;
}


/* =====================================================
   TABELAS
====================================================== */

.b2b-v2 table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.b2b-v2 table thead tr {
  background: #f8fafc !important;
}

.b2b-v2 table th {
  border-bottom: 1px solid #e2e8f0;
  padding-top: 10px !important;
  padding-bottom: 10px !important;
}

.b2b-v2 table td {
  padding-top: 10px !important;
  padding-bottom: 10px !important;
}

.b2b-v2 table tbody tr {
  transition: background-color 120ms ease;
}

.b2b-v2 table tbody tr:hover {
  background-color: #faf9fb !important;
}


/* =====================================================
   BOTÕES DE FILTRO
====================================================== */

.b2b-v2 button[class*="bg-slate-100"] {
  border: 1px solid #e2e8f0;
  background-color: #ffffff !important;
}

.b2b-v2 button[class*="bg-slate-100"]:hover {
  background-color: #f8fafc !important;
  border-color: #cbd5e1;
}


/* =====================================================
   TIPOGRAFIA OPERACIONAL
====================================================== */

.b2b-v2 h3 {
  letter-spacing: -0.015em;
}

.b2b-v2 .font-mono {
  letter-spacing: -0.01em;
}

/* =====================================================
   LISTA DE PEDIDOS — DENSIDADE CORPORATIVA
====================================================== */

/* Duas colunas em telas grandes */
@media (min-width: 1180px) {
  .b2b-v2
    .grid.gap-3:has(
      > button.bg-white.rounded-2xl
    ) {
    grid-template-columns:
      repeat(
        2,
        minmax(0, 1fr)
      );
  }
}


/* Card do pedido */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1 {
  min-height: 108px;

  padding: 16px 18px !important;

  background: #ffffff !important;

  border: 1px solid #e2e8f0 !important;

  border-radius: 14px !important;
}


/* Nome do lote */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .font-bold.text-slate-800 {
  color: #0f172a !important;

  font-size: 13px !important;
  font-weight: 800 !important;

  letter-spacing: -0.015em;
}


/* Cliente */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .text-slate-500 {
  color: #64748b !important;
}


/* Barra de fundo */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .h-2.bg-slate-100 {
  height: 6px !important;

  background: #edf0f4 !important;
}


/* Progresso aberto -> plum do menu lateral */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .h-2
  > .h-full {
  background: #211136 !important;
}


/* Pedido concluído continua verde */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1:has(
    .bg-emerald-50
  )
  .h-2
  > .h-full {
  background: #1d9e75 !important;
}


/* Hover mais discreto */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1:hover {
  background: #fbfbfc !important;

  border-color: #b9adc5 !important;

  box-shadow:
    0 5px 14px
    rgba(
      33,
      17,
      54,
      0.06
    ) !important;

  transform:
    translateY(-1px);
}

/* =====================================================
   AVISO DE IMPORTAÇÃO — VISUAL CORPORATIVO
====================================================== */

.b2b-v2
  .bg-blue-50.ring-1.ring-blue-200.rounded-2xl {
  background: #ffffff !important;

  border: 1px solid #e2e8f0 !important;
  border-left: 4px solid #211136 !important;

  color: #475569 !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03) !important;
}

.b2b-v2
  .bg-blue-50.ring-1.ring-blue-200.rounded-2xl
  strong {
  color: #211136 !important;
}


/* =====================================================
   TOOLBAR "SELECIONE UM PEDIDO"
====================================================== */

.b2b-v2
  .space-y-4
  > .flex.items-center.justify-between.flex-wrap.gap-2:has(
    > p.text-sm.text-slate-500
  ) {
  min-height: 54px;

  padding: 9px 12px;

  border: 1px solid #e2e8f0;
  border-radius: 14px;

  background: #ffffff;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03);
}


/* Título da toolbar */
.b2b-v2
  .space-y-4
  > .flex.items-center.justify-between.flex-wrap.gap-2
  > p.text-sm.text-slate-500 {
  color: #334155 !important;

  font-size: 11px !important;
  font-weight: 800 !important;

  letter-spacing: 0.035em;

  text-transform: uppercase;
}


/* Botões da toolbar */
.b2b-v2
  .space-y-4
  > .flex.items-center.justify-between.flex-wrap.gap-2
  > .flex.items-center.gap-2
  button {
  min-height: 32px;

  padding-left: 12px;
  padding-right: 12px;

  border-radius: 9px !important;

  font-size: 11px !important;
}


/* Atualizar */
.b2b-v2
  .space-y-4
  > .flex.items-center.justify-between.flex-wrap.gap-2
  > .flex.items-center.gap-2
  button:last-child {
  width: 32px;
  padding: 0 !important;

  display: inline-flex;
  align-items: center;
  justify-content: center;

  border: 1px solid #e2e8f0;

  background: #ffffff;

  color: #64748b !important;
}

.b2b-v2
  .space-y-4
  > .flex.items-center.justify-between.flex-wrap.gap-2
  > .flex.items-center.gap-2
  button:last-child:hover {
  background: #f8fafc !important;
  color: #211136 !important;
}

/* =====================================================
   CARDS DE PEDIDOS — HIERARQUIA EXECUTIVA
====================================================== */

.b2b-v2
  button.bg-white.rounded-2xl.ring-1 {
  position: relative;
  overflow: hidden;
}


/* Pequeno detalhe lateral da identidade V2 */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1::before {
  content: "";

  position: absolute;
  top: 0;
  left: 0;

  width: 3px;
  height: 100%;

  background: #211136;

  opacity: 0;
  transition: opacity 150ms ease;
}

.b2b-v2
  button.bg-white.rounded-2xl.ring-1:hover::before {
  opacity: 1;
}


/* Cabeçalho do card */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  > .flex.items-start.justify-between {
  margin-bottom: 14px !important;
}


/* Nome do lote */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .font-bold.text-slate-800.text-sm {
  max-width: 82%;

  color: #0f172a !important;

  font-size: 13px !important;
  font-weight: 850 !important;

  line-height: 1.35;
}


/* Cliente */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .text-xs.text-slate-500.mt-0\\.5 {
  margin-top: 4px !important;

  color: #64748b !important;

  font-size: 10px !important;
  font-weight: 650 !important;

  letter-spacing: 0.025em;

  text-transform: uppercase;
}


/* =====================================================
   PROGRESSO — TRANSFORMA EM MINI BLOCO DE KPI
====================================================== */

.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .space-y-1 {
  margin-top: 4px;

  padding-top: 12px;

  border-top: 1px solid #f1f5f9;
}


/* Linha quantidade + percentual */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .space-y-1
  > .flex.justify-between {
  margin-bottom: 7px;
}


/* "143 de 145" */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .space-y-1
  > .flex.justify-between
  > span:first-child {
  color: #64748b !important;

  font-size: 10px !important;
  font-weight: 650;
}


/* "99%" */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .space-y-1
  > .flex.justify-between
  > span:last-child {
  color: #211136 !important;

  font-size: 12px !important;
  font-weight: 900 !important;
}


/* Barra */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  .space-y-1
  .h-2.bg-slate-100 {
  height: 5px !important;

  border-radius: 999px;

  background: #edf0f4 !important;
}


/* =====================================================
   STATUS DO CARD
====================================================== */

.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  span[class*="bg-blue-50"] {
  border: 1px solid #bfdbfe;

  background: #eff6ff !important;

  font-size: 10px !important;
  font-weight: 750;
}

.b2b-v2
  button.bg-white.rounded-2xl.ring-1
  span[class*="bg-emerald-50"] {
  border: 1px solid #a7f3d0;

  font-size: 10px !important;
  font-weight: 750;
}


/* Pedido concluído não ganha detalhe plum */
.b2b-v2
  button.bg-white.rounded-2xl.ring-1:has(
    span[class*="bg-emerald-50"]
  )::before {
  background: #1d9e75;
}

/* =====================================================
   PEDIDO ATIVO — CABEÇALHO OPERACIONAL
====================================================== */

.b2b-v2
  .space-y-4
  > .flex.items-center.gap-3.flex-wrap {
  min-height: 62px;

  padding: 12px 16px;

  border: 1px solid #e2e8f0;
  border-radius: 14px;

  background: #ffffff;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.03);
}


/* Botão trocar pedido */
.b2b-v2
  .space-y-4
  > .flex.items-center.gap-3.flex-wrap
  > button:first-child {
  min-height: 34px;

  padding: 0 11px;

  border: 1px solid #e2e8f0;
  border-radius: 9px;

  background: #ffffff;

  color: #64748b !important;

  font-weight: 700;
}

.b2b-v2
  .space-y-4
  > .flex.items-center.gap-3.flex-wrap
  > button:first-child:hover {
  border-color: #c7bdd0;

  background: #f8fafc !important;

  color: #211136 !important;
}


/* Nome do pedido ativo */
.b2b-v2
  .space-y-4
  > .flex.items-center.gap-3.flex-wrap
  h3 {
  color: #0f172a !important;

  font-size: 14px !important;
  font-weight: 850 !important;

  letter-spacing: -0.02em;
}


/* Cliente */
.b2b-v2
  .space-y-4
  > .flex.items-center.gap-3.flex-wrap
  h3 + p {
  margin-top: 3px;

  color: #64748b !important;

  font-size: 10px !important;
  font-weight: 650;

  letter-spacing: 0.025em;

  text-transform: uppercase;
}


/* =====================================================
   KPIs DO PEDIDO
====================================================== */

.b2b-v2
  .grid.grid-cols-2.lg\\:grid-cols-4.gap-3
  > div {
  min-height: 92px;

  padding: 14px 16px !important;

  border-radius: 13px !important;

  box-shadow: none !important;
}

.b2b-v2
  .grid.grid-cols-2.lg\\:grid-cols-4.gap-3
  .text-2xl {
  color: #0f172a;

  font-size: 22px !important;
  font-weight: 900;

  letter-spacing: -0.035em;
}


/* KPI roxo legado fica neutro/plum */
.b2b-v2
  .grid.grid-cols-2.lg\\:grid-cols-4.gap-3
  > .bg-purple-50 {
  background: #f8f7fa !important;

  border-color: #ded6e6 !important;

  color: #211136 !important;
}


/* =====================================================
   CARDS INTERNOS DO PEDIDO
====================================================== */

.b2b-v2
  .space-y-4
  > .bg-white.rounded-2xl {
  border: 1px solid #e2e8f0 !important;

  border-radius: 14px !important;

  background: #ffffff !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.025) !important;
}


/* =====================================================
   BIPAGEM — CAMPO MAIS OPERACIONAL
====================================================== */

.b2b-v2
  form.flex.gap-3
  input {
  min-height: 46px;

  border-radius: 10px !important;

  background: #ffffff !important;

  font-size: 13px !important;
}

.b2b-v2
  form.flex.gap-3
  button[type="submit"] {
  min-width: 130px;

  border-radius: 10px !important;

  background: #211136 !important;

  font-size: 12px !important;
  font-weight: 800;

  box-shadow:
    0 3px 8px rgba(33, 17, 54, 0.14) !important;
}

.b2b-v2
  form.flex.gap-3
  button[type="submit"]:hover {
  background: #190d2a !important;
}


/* =====================================================
   FILTROS DE RUA / STATUS
====================================================== */

.b2b-v2
  .flex.items-center.gap-2.flex-wrap
  button {
  border-radius: 9px !important;
}

.b2b-v2
  .flex.items-center.gap-2.flex-wrap
  button[class*="bg-[#7F2D92]"] {
  background: #211136 !important;
  color: #ffffff !important;
}

/* =====================================================
   FATURAMENTO B2B — VISUAL CORPORATIVO
====================================================== */


/* -----------------------------------------------------
   KPIs GERAIS DO FATURAMENTO
------------------------------------------------------ */

.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  > div {
  position: relative;
  overflow: hidden;

  min-height: 100px;

  padding: 16px 17px !important;

  background: #ffffff !important;

  border: 1px solid #e2e8f0 !important;
  border-radius: 14px !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.025) !important;

  color: #334155 !important;
}


/* Faixa semântica superior */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  > div::before {
  content: "";

  position: absolute;

  top: 0;
  left: 0;
  right: 0;

  height: 3px;
}


/* Aguardando */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  > div:nth-child(1)::before {
  background: #f59e0b;
}


/* Faturado */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  > div:nth-child(2)::before {
  background: #10b981;
}


/* Não faturar */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  > div:nth-child(3)::before {
  background: #ef4444;
}


/* Erro NF */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  > div:nth-child(4)::before {
  background: #dc2626;
}


/* Valor principal dos KPIs */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  .text-2xl {
  color: #0f172a !important;

  font-size: 21px !important;
  font-weight: 900 !important;

  letter-spacing: -0.04em;
}


/* Label KPI */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  .text-xs.font-semibold {
  color: #475569 !important;
}


/* Subtexto KPI */
.b2b-v2
  .grid.grid-cols-1.lg\:grid-cols-4.gap-3
  .text-xs.opacity-60 {
  color: #94a3b8 !important;

  opacity: 1 !important;
}



/* =====================================================
   CARDS DOS PEDIDOS DE FATURAMENTO
====================================================== */

.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm {
  position: relative;

  padding: 18px 20px !important;

  border: 1px solid #e2e8f0 !important;
  border-left: 3px solid #cbd5e1 !important;

  border-radius: 14px !important;

  background: #ffffff !important;

  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.025),
    0 3px 10px rgba(15, 23, 42, 0.025) !important;
}


/* Erro de NF */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm:has(
    span.bg-red-100
  ) {
  border-left-color: #dc2626 !important;
}


/* Faturamento parcial */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm:has(
    span.bg-blue-100
  ) {
  border-left-color: #3b82f6 !important;
}


/* Em faturamento */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm:has(
    span.bg-purple-100
  ) {
  border-left-color: #211136 !important;
}


/* Em separação */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm:has(
    span.bg-yellow-100
  ) {
  border-left-color: #d97706 !important;
}



/* =====================================================
   CABEÇALHO DO PEDIDO
====================================================== */

.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  > .flex.items-start.justify-between {
  padding-bottom: 13px;

  margin-bottom: 13px !important;

  border-bottom: 1px solid #f1f5f9;
}


/* Lote */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  .font-bold.text-slate-800.text-sm {
  color: #0f172a !important;

  font-size: 13px !important;
  font-weight: 850 !important;

  letter-spacing: -0.015em;
}


/* Cliente */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  .text-xs.text-slate-500 {
  color: #64748b !important;
}


/* Valor total à direita */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  .text-sm.font-black.text-slate-800 {
  color: #0f172a !important;

  font-size: 13px !important;
}



/* =====================================================
   MINI KPIs DENTRO DE CADA PEDIDO
====================================================== */

.b2b-v2
  .grid.grid-cols-2.lg\:grid-cols-4.gap-2.mb-4
  > div {
  min-height: 72px;

  padding: 11px 12px !important;

  background: #fafbfc !important;

  border: 1px solid #e8edf2 !important;
  border-radius: 11px !important;

  box-shadow: none !important;
}


.b2b-v2
  .grid.grid-cols-2.lg\:grid-cols-4.gap-2.mb-4
  p {
  line-height: 1.3;
}



/* =====================================================
   PROGRESSO
====================================================== */

/* Converte barras antigas roxas para o plum do menu */
.b2b-v2
  [style*="#7F2D92"] {
  background: #211136 !important;
}


/* Barra um pouco mais fina */
.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  .h-2.bg-slate-100 {
  height: 5px !important;

  background: #edf0f4 !important;
}



/* =====================================================
   AÇÕES DO FATURAMENTO
====================================================== */

.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  .flex.gap-2.flex-wrap.items-center
  button,

.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  .flex.gap-2.flex-wrap.items-center
  label {
  min-height: 34px;

  border-radius: 9px !important;

  padding-left: 12px;
  padding-right: 12px;

  font-size: 11px !important;
  font-weight: 750 !important;
}



/* =====================================================
   STATUS
====================================================== */

.b2b-v2
  .space-y-3
  > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
  span[class*="rounded-lg"][class*="ring-1"] {
  font-size: 10px !important;

  font-weight: 750 !important;

  border-radius: 8px !important;
}

/* =====================================================
   FATURAMENTO — OCULTA KPIs GLOBAIS
   Mantém somente os indicadores de cada pedido
====================================================== */

.b2b-v2
  .grid.grid-cols-1[class~="lg:grid-cols-4"].gap-3 {
  display: none !important;
}

/* =====================================================
   FATURAMENTO — 2 PEDIDOS POR LINHA
====================================================== */

@media (min-width: 1180px) {

  /* Grid dos pedidos do faturamento */
  .b2b-v2
    .space-y-3:has(
      > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
    ) {
    display: grid !important;

    grid-template-columns:
      repeat(2, minmax(0, 1fr));

    gap: 14px !important;
  }


  /* Remove espaçamento vertical herdado do space-y */
  .b2b-v2
    .space-y-3:has(
      > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
    )
    > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm {
    margin-top: 0 !important;
  }


  /* Indicadores internos do pedido ficam 2 x 2 */
  .b2b-v2
    .space-y-3
    > .bg-white.rounded-2xl.p-5.ring-1.shadow-sm
    .grid.grid-cols-2[class~="lg:grid-cols-4"].gap-2.mb-4 {
    grid-template-columns:
      repeat(2, minmax(0, 1fr)) !important;
  }
}
      `}</style>

      {tipo === "gestao" ? (
  <B2BPainelGestorPage />
) : (
  <B2BPickingPage
  abaInicial={abaInicial}
  usarPermissoesV2
/>
)}
    </div>
  );
}