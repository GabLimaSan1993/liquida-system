import CargaInicialEstoquePage from "../CargaInicialEstoquePage.jsx";

export default function CargaInicialV2Page() {
  return (
    <div className="carga-inicial-v2">
      <style>{`
        /* =====================================================
           CARGA INICIAL — TEMA ASSURANT WORKSPACE V2

           Apenas visual.
           Não altera nenhuma regra ou operação do WMS.
        ====================================================== */

        .carga-inicial-v2 {
          --v2-violet: #6d28d9;
          --v2-violet-hover: #5b21b6;
          --v2-violet-soft: #f5f3ff;
          --v2-violet-border: #ddd6fe;

          --v2-slate-950: #0f172a;
          --v2-slate-700: #334155;
          --v2-slate-500: #64748b;
          --v2-border: #e2e8f0;
        }

        /* Header antigo -> card claro do Workspace V2 */
        .carga-inicial-v2 > div > section:first-of-type {
          background: #ffffff !important;
          background-image: none !important;
          color: var(--v2-slate-950) !important;

          border: 1px solid var(--v2-border) !important;

          box-shadow:
            0 1px 2px rgba(15, 23, 42, 0.04) !important;
        }

        .carga-inicial-v2
          > div
          > section:first-of-type
          h1 {
          color: var(--v2-slate-950) !important;
        }

        .carga-inicial-v2
          > div
          > section:first-of-type
          p:first-child {
          color: var(--v2-violet) !important;
        }

        .carga-inicial-v2
          > div
          > section:first-of-type
          h1 + p {
          color: var(--v2-slate-500) !important;
        }

        .carga-inicial-v2
          > div
          > section:first-of-type
          svg {
          color: var(--v2-violet) !important;
          opacity: 1 !important;
        }

        /* Roxo legado principal -> violeta oficial V2 */
        .carga-inicial-v2 [class*="bg-[#7F2D92]"] {
          background-color: var(--v2-violet) !important;
        }

        .carga-inicial-v2 [class*="text-[#7F2D92]"] {
          color: var(--v2-violet) !important;
        }

        /* Área escura do AP atual */
        .carga-inicial-v2 [class*="bg-[#16071D]"] {
          background-color: var(--v2-slate-950) !important;
        }

        /* Cards */
        .carga-inicial-v2 [class*="ring-purple-100"] {
          --tw-ring-color: var(--v2-border) !important;
        }

        /* Badges */
        .carga-inicial-v2 [class*="bg-purple-100"] {
          background-color: var(--v2-violet-soft) !important;
        }

        .carga-inicial-v2 [class*="text-purple-700"] {
          color: var(--v2-violet) !important;
        }

        .carga-inicial-v2 [class*="text-purple-300"] {
          color: #c4b5fd !important;
        }

        /* Inputs */
        .carga-inicial-v2 [class*="border-purple-200"] {
          border-color: var(--v2-violet-border) !important;
        }

        .carga-inicial-v2 [class*="focus:border-purple-400"]:focus,
        .carga-inicial-v2 [class*="focus:border-[#7F2D92]"]:focus {
          border-color: var(--v2-violet) !important;
        }

        /* Posição atual no mapa */
        .carga-inicial-v2 [class*="ring-purple-300"] {
          --tw-ring-color: #c4b5fd !important;
        }

        /* Remove sombra magenta antiga dos botões */
        .carga-inicial-v2 [class*="shadow-purple-200"] {
          --tw-shadow-color: transparent !important;
        }

        /* Botões principais */
        .carga-inicial-v2 [class*="bg-[#7F2D92]"]:hover {
          background-color: var(--v2-violet-hover) !important;
        }
      `}</style>

      <CargaInicialEstoquePage />
    </div>
  );
}