import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import EstoqueMaquinasLinhaBranca from "./EstoqueMaquinasLinhaBranca.jsx";

/**
 * Acesso único à gestão das lavadoras.
 * Peças, insumos, requisições, compras e demais registros permanecem
 * nas tabelas originais para auditoria; seus menus foram apenas ocultados.
 */
export default function GestaoEstoqueLinhaBrancaPage() {
  return (
    <div className="mx-auto max-w-[1600px] space-y-5 text-slate-900">
      <header>
        <Link to="/v2/linha-branca"
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#43284F]">
          <ArrowLeft size={16}/> Linha Branca
        </Link>
        <p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-[#765D81]">
          Liquida System · Linha Branca
        </p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Estoque de Lavadoras</h1>
        <p className="mt-2 text-sm text-slate-500">
          Consulta das OSs de lavadoras e lava e seca, por etapa e situação operacional.
          Acompanhe triagem, reparo, necessidade de peças, conclusão e destinação.
        </p>
      </header>
      <EstoqueMaquinasLinhaBranca/>
    </div>
  );
}
