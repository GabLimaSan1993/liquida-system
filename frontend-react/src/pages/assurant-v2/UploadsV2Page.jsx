import UploadPage from "../UploadPage.jsx";

export default function UploadsV2Page() {
  return (
    <div className="uploads-v2">
      <style>{`
        /* =====================================================
           UPLOADS — ASSURANT WAREHOUSE V2
           Apenas camada visual.
           Nenhuma regra de upload é alterada.
        ====================================================== */

        .uploads-v2 {
          --upload-plum: #211136;
          --upload-plum-light: #2A1747;
          --upload-plum-hover: #190D2A;

          --upload-soft: #F6F3F8;
          --upload-soft-hover: #EEE8F2;
          --upload-border: #DED6E6;
          --upload-border-strong: #C9BDD3;
        }


        /* =====================================================
           TÍTULOS / TEXTOS ROXOS LEGADOS
        ====================================================== */

        .uploads-v2 [class*="text-[#6B1F87]"],
        .uploads-v2 [class*="text-[#7F2D92]"] {
          color: var(--upload-plum-light) !important;
        }


        /* =====================================================
           BOTÕES PRINCIPAIS E ÍCONES
           Remove o laranja da tela antiga
        ====================================================== */

        .uploads-v2 [class*="bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)]"] {
          background: var(--upload-plum) !important;

          box-shadow:
            0 2px 6px rgba(33, 17, 54, 0.14) !important;
        }

        .uploads-v2 button[class*="bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)]"]:hover {
          background: var(--upload-plum-hover) !important;
          opacity: 1 !important;
        }


        /* =====================================================
           BADGE OPERACIONAL
        ====================================================== */

        .uploads-v2 [class*="bg-[#F59E0B]"] {
          background-color: var(--upload-soft) !important;
          color: var(--upload-plum-light) !important;
          border: 1px solid var(--upload-border) !important;
        }


        /* =====================================================
           CARDS E FUNDOS
        ====================================================== */

        .uploads-v2 [class*="bg-[#FCFAFF]"] {
          background-color: #FFFFFF !important;
        }

        .uploads-v2 [class*="shadow-violet-100"] {
          box-shadow:
            0 1px 2px rgba(15, 23, 42, 0.04),
            0 1px 3px rgba(15, 23, 42, 0.03) !important;
        }


        /* =====================================================
           BORDAS ROXAS LEGADAS
        ====================================================== */

        .uploads-v2 [class*="border-[#D8B4FE]"] {
          border-color: var(--upload-border) !important;
        }

        .uploads-v2 [class*="border-[#E9D5FF]"] {
          border-color: var(--upload-border) !important;
        }

        .uploads-v2 [class*="ring-[#E9D5FF]"] {
          --tw-ring-color: var(--upload-border) !important;
        }


        /* =====================================================
           BOTÕES OUTLINE
        ====================================================== */

        .uploads-v2 button[class*="border-[#E9D5FF]"] {
          background: #FFFFFF !important;
          color: var(--upload-plum-light) !important;
          border-color: var(--upload-border) !important;
        }

        .uploads-v2 button[class*="border-[#E9D5FF]"]:hover {
          background: var(--upload-soft) !important;
          border-color: var(--upload-border-strong) !important;
        }


        /* =====================================================
           PROGRESS BAR
        ====================================================== */

        .uploads-v2 [class*="bg-[#F3E8FF]"] {
          background-color: var(--upload-soft-hover) !important;
        }

        .uploads-v2 [class*="bg-[linear-gradient(90deg,#7F2D92_0%,#F97316_100%)]"] {
          background: var(--upload-plum) !important;
        }


        /* =====================================================
           INPUTS
        ====================================================== */

        .uploads-v2 input,
        .uploads-v2 select,
        .uploads-v2 textarea {
          border-color: #DBE1E8 !important;

          transition:
            border-color 150ms ease,
            box-shadow 150ms ease;
        }

        .uploads-v2 input:focus,
        .uploads-v2 select:focus,
        .uploads-v2 textarea:focus {
          border-color: #80619F !important;

          box-shadow:
            0 0 0 3px rgba(42, 23, 71, 0.08) !important;
        }


        /* =====================================================
           AVISOS QUE ERAM PURPLE
        ====================================================== */

        .uploads-v2 [class*="bg-purple-50"] {
          background-color: var(--upload-soft) !important;
        }

        .uploads-v2 [class*="ring-purple-200"] {
          --tw-ring-color: var(--upload-border) !important;
        }


        /* =====================================================
           TIPOGRAFIA
        ====================================================== */

        .uploads-v2 h1,
        .uploads-v2 h2,
        .uploads-v2 h3 {
          letter-spacing: -0.02em;
        }

        .uploads-v2 button {
          letter-spacing: -0.005em;
        }
      `}</style>

      <UploadPage warehouseV2 />
    </div>
  );
}