import B2CEmbalagemMesaPage from "../B2CEmbalagemMesaPage.jsx";
import ExpedicaoPage from "../ExpedicaoPage.jsx";
import EtiquetasEnvioPage from "../EtiquetasEnvioPage.jsx";
import B2CPainelGestorPage from "../B2CPainelGestorPage.jsx";

const PAGINAS = {
  embalagem: B2CEmbalagemMesaPage,
  expedicao: ExpedicaoPage,
  etiquetas: EtiquetasEnvioPage,
  gestao: B2CPainelGestorPage,
};

export default function B2CFluxoComplementarV2Page({ tipo }) {
  const Pagina = PAGINAS[tipo];

  if (!Pagina) return null;

  return (
    <div
      className="b2c-complementar-v2"
      data-tipo={tipo}
    >
      <style>{`
        /* =====================================================
           B2C — FLUXO COMPLEMENTAR V2
           Embalagem / Expedição / Etiquetas / Gestão
        ====================================================== */

        .b2c-complementar-v2 {
          --plum: #211136;
          --plum-light: #2A1747;
          --plum-hover: #190D2A;

          --soft: #F6F3F8;
          --soft-hover: #EEE8F2;
          --border: #DED6E6;

          width: 100%;
        }


        /* =====================================================
           ROXO LEGADO → PLUM V2
        ====================================================== */

        .b2c-complementar-v2 [class*="bg-[#7F2D92]"] {
          background-color: var(--plum) !important;
        }

        .b2c-complementar-v2 button[class*="bg-[#7F2D92]"] {
          background:
            linear-gradient(
              180deg,
              #2A1747 0%,
              #211136 100%
            ) !important;

          box-shadow:
            0 2px 5px rgba(33, 17, 54, 0.15) !important;
        }

        .b2c-complementar-v2
          button[class*="bg-[#7F2D92]"]:hover {
          background: #190D2A !important;
        }

        .b2c-complementar-v2 [class*="text-[#7F2D92]"] {
          color: var(--plum-light) !important;
        }

        .b2c-complementar-v2 [class*="ring-[#7F2D92]"] {
          --tw-ring-color: var(--plum) !important;
        }

        .b2c-complementar-v2 [class*="border-[#7F2D92]"] {
          border-color: var(--plum) !important;
        }

        .b2c-complementar-v2 [class*="bg-purple-50"] {
          background-color: var(--soft) !important;
        }

        .b2c-complementar-v2 [class*="bg-purple-100"] {
          background-color: #EEE8F2 !important;
        }

        .b2c-complementar-v2 [class*="text-purple-700"],
        .b2c-complementar-v2 [class*="text-purple-800"] {
          color: var(--plum-light) !important;
        }

        .b2c-complementar-v2 [class*="text-purple-500"] {
          color: #654A82 !important;
        }

        .b2c-complementar-v2 [class*="ring-purple-200"],
        .b2c-complementar-v2 [class*="ring-purple-300"] {
          --tw-ring-color: var(--border) !important;
        }

        .b2c-complementar-v2 [class*="hover:bg-purple-50"]:hover {
          background-color: var(--soft) !important;
        }

        .b2c-complementar-v2 [class*="hover:text-purple-700"]:hover {
          color: var(--plum) !important;
        }


        /* =====================================================
           CARDS
        ====================================================== */

        .b2c-complementar-v2 .bg-white.rounded-2xl {
          border-color: #E2E8F0 !important;

          box-shadow:
            0 1px 3px rgba(15, 23, 42, 0.035) !important;
        }

        .b2c-complementar-v2 h2,
        .b2c-complementar-v2 h3,
        .b2c-complementar-v2 h4 {
          letter-spacing: -0.02em;
        }


        /* =====================================================
           INPUTS
        ====================================================== */

        .b2c-complementar-v2 input,
        .b2c-complementar-v2 select,
        .b2c-complementar-v2 textarea {
          border-color: #DBE1E8 !important;

          transition:
            border-color 150ms ease,
            box-shadow 150ms ease;
        }

        .b2c-complementar-v2 input:focus,
        .b2c-complementar-v2 select:focus,
        .b2c-complementar-v2 textarea:focus {
          border-color: #80619F !important;

          box-shadow:
            0 0 0 3px rgba(42, 23, 71, 0.08) !important;

          outline: none;
        }


        /* =====================================================
           TABELAS
        ====================================================== */

        .b2c-complementar-v2 table thead tr {
          background: #F8FAFC !important;
        }

        .b2c-complementar-v2 table th {
          color: #64748B;

          font-size: 10px;
          font-weight: 800;

          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .b2c-complementar-v2 table tbody tr:hover {
          background: #FAF9FB !important;
        }


        /* =====================================================
           CABEÇALHOS EMBALAGEM / ETIQUETAS
        ====================================================== */

        .b2c-complementar-v2[data-tipo="embalagem"]
          > .space-y-4
          > .flex.items-center.justify-between:first-child,

        .b2c-complementar-v2[data-tipo="etiquetas"]
          > .space-y-4
          > .flex.items-center.gap-3:first-child {
          min-height: 88px;

          padding: 18px 20px;

          border: 1px solid #E2E8F0;
          border-radius: 16px;

          background: #FFFFFF;

          box-shadow:
            0 1px 3px rgba(15, 23, 42, 0.035);
        }


        /* =====================================================
           EMBALAGEM — BIPAGEM
        ====================================================== */

        .b2c-complementar-v2[data-tipo="embalagem"]
          form.flex.gap-2
          input {
          min-height: 46px;

          border-radius: 11px !important;

          background: #FBFCFD !important;
        }

        .b2c-complementar-v2[data-tipo="embalagem"]
          form.flex.gap-2
          button {
          min-height: 46px;

          border-radius: 11px !important;
        }


        /* =====================================================
           EMBALAGEM — GRUPOS EM GRADE
        ====================================================== */

        .b2c-complementar-v2[data-tipo="embalagem"]
          .space-y-3 {
          display: grid;

          grid-template-columns:
            repeat(4, minmax(0, 1fr));

          gap: 12px;

          margin-top: 0 !important;
        }

        .b2c-complementar-v2[data-tipo="embalagem"]
          .space-y-3
          > .rounded-xl {
          min-width: 0;

          margin-top: 0 !important;

          border: 1px solid #E2E8F0;

          border-radius: 13px !important;

          background: #FFFFFF;

          overflow: hidden;

          box-shadow:
            0 1px 3px rgba(15, 23, 42, 0.025);
        }

        .b2c-complementar-v2[data-tipo="embalagem"]
          .space-y-3
          > .rounded-xl
          > .bg-slate-50 {
          min-height: 46px;

          padding: 10px 12px !important;

          background: #F8FAFC !important;
        }

        .b2c-complementar-v2[data-tipo="embalagem"]
          .space-y-3
          > .rounded-xl
          .divide-y
          > div {
          padding: 10px 12px !important;
        }


        /* =====================================================
           EXPEDIÇÃO
        ====================================================== */

        .b2c-complementar-v2[data-tipo="expedicao"] {
          max-width: none !important;
        }

        .b2c-complementar-v2[data-tipo="expedicao"]
          > .max-w-4xl {
          max-width: none !important;

          margin: 0 !important;

          padding: 20px;

          border: 1px solid #E2E8F0;
          border-radius: 16px;

          background: #FFFFFF;

          box-shadow:
            0 1px 3px rgba(15, 23, 42, 0.035);
        }

        .b2c-complementar-v2[data-tipo="expedicao"]
          .grid.grid-cols-4.gap-2 {
          gap: 10px !important;
        }

        .b2c-complementar-v2[data-tipo="expedicao"]
          .grid.grid-cols-4.gap-2
          button {
          min-height: 44px;

          border-radius: 10px !important;

          font-size: 11px;

          font-weight: 750;
        }

        .b2c-complementar-v2[data-tipo="expedicao"]
          .flex.gap-3.mb-3 {
          padding: 15px;

          border: 1px solid #E2E8F0;
          border-radius: 13px;

          background: #F8FAFC;
        }

        .b2c-complementar-v2[data-tipo="expedicao"]
          .flex.gap-3.mb-3
          input {
          min-height: 44px;

          border-radius: 9px !important;

          background: #FFFFFF;
        }

        .b2c-complementar-v2[data-tipo="expedicao"]
          .border.rounded-xl.overflow-hidden {
          border-color: #E2E8F0 !important;

          border-radius: 13px !important;
        }


        /* =====================================================
           ETIQUETAS
        ====================================================== */

        .b2c-complementar-v2[data-tipo="etiquetas"]
          .border-dashed {
          border-color: #D8CFE0 !important;

          border-radius: 14px !important;

          background: #FBFAFC;
        }

        .b2c-complementar-v2[data-tipo="etiquetas"]
          .border-dashed:hover {
          border-color: #80619F !important;

          background: #F6F3F8 !important;
        }


        /* Últimos lotes em grade */
        .b2c-complementar-v2[data-tipo="etiquetas"]
          .space-y-2 {
          display: grid;

          grid-template-columns:
            repeat(4, minmax(0, 1fr));

          gap: 10px;

          margin-top: 0 !important;
        }

        .b2c-complementar-v2[data-tipo="etiquetas"]
          .space-y-2
          > div {
          min-width: 0;
          min-height: 88px;

          margin-top: 0 !important;

          align-content: space-between;

          border: 1px solid #E2E8F0;

          border-radius: 12px !important;

          background: #F8FAFC !important;
        }


        /* =====================================================
           GESTÃO
        ====================================================== */

        .b2c-complementar-v2[data-tipo="gestao"] {
          width: 100%;
        }

        .b2c-complementar-v2[data-tipo="gestao"]
          [class*="xl:grid-cols-4"] {
          gap: 12px !important;
        }

        .b2c-complementar-v2[data-tipo="gestao"]
          [class*="text-2xl"][class*="font-black"] {
          color: #172033 !important;

          font-size: 21px !important;
        }


        /* =====================================================
           RESPONSIVO — 4 / 3 / 2 / 1
        ====================================================== */

        @media (max-width: 1450px) {
          .b2c-complementar-v2[data-tipo="embalagem"]
            .space-y-3,

          .b2c-complementar-v2[data-tipo="etiquetas"]
            .space-y-2 {
            grid-template-columns:
              repeat(3, minmax(0, 1fr));
          }
        }

        @media (max-width: 980px) {
          .b2c-complementar-v2[data-tipo="embalagem"]
            .space-y-3,

          .b2c-complementar-v2[data-tipo="etiquetas"]
            .space-y-2 {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }

          .b2c-complementar-v2[data-tipo="expedicao"]
            .grid.grid-cols-4.gap-2 {
            grid-template-columns:
              repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 640px) {
          .b2c-complementar-v2[data-tipo="embalagem"]
            .space-y-3,

          .b2c-complementar-v2[data-tipo="etiquetas"]
            .space-y-2 {
            grid-template-columns: 1fr;
          }

          .b2c-complementar-v2[data-tipo="expedicao"]
            .grid.grid-cols-4.gap-2 {
            grid-template-columns: 1fr;
          }

          .b2c-complementar-v2[data-tipo="expedicao"]
            .flex.gap-3.mb-3 {
            flex-direction: column;
          }
        }
      `}</style>

      {tipo === "expedicao" && (
        <div className="mb-4 flex min-h-[88px] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F6F3F8] text-xl">
            🚚
          </span>

          <div>
            <h2 className="text-lg font-black text-slate-800">
              Expedição B2C
            </h2>

            <p className="text-xs text-slate-500">
              Romaneio, conferência de NF, etiqueta e liberação dos volumes
            </p>
          </div>
        </div>
      )}

      <Pagina />
    </div>
  );
}