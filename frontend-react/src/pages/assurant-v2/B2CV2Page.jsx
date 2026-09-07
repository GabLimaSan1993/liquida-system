import PedidosB2CPage from "../PedidosB2CPage.jsx";

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

      `}</style>

      <PedidosB2CPage />
    </div>
  );
}