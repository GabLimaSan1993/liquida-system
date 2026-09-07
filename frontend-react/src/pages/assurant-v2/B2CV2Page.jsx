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
      `}</style>

      <PedidosB2CPage />
    </div>
  );
}