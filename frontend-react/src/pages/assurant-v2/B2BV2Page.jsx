import B2BPickingPage from "../B2BPickingPage.jsx";

export default function B2BV2Page() {
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
      `}</style>

      <B2BPickingPage abaInicial="picking" />
    </div>
  );
}