import { supabase } from "../lib/supabase.js";

function periodoIso(ano, mes) {
  const a = Number(ano);
  const m = mes ? Number(mes) : null;

  if (!m) {
    return {
      inicio: `${a}-01-01T00:00:00-03:00`,
      fim: `${a + 1}-01-01T00:00:00-03:00`,
    };
  }

  const proxAno = m === 12 ? a + 1 : a;
  const proxMes = m === 12 ? 1 : m + 1;

  return {
    inicio: `${a}-${String(m).padStart(2, "0")}-01T00:00:00-03:00`,
    fim: `${proxAno}-${String(proxMes).padStart(2, "0")}-01T00:00:00-03:00`,
  };
}

export async function buscarResumoMargemB2C({ ano, mes = null }) {
  const { inicio, fim } = periodoIso(ano, mes);

  const { data, error } = await supabase.rpc("margem_b2c_resumo_gabriel", {
    p_inicio: inicio,
    p_fim: fim,
  });

  if (error) throw new Error(error.message);

  return data?.[0] || {
    itens_faturados: 0,
    itens_com_margem: 0,
    itens_sem_margem: 0,
    cobertura_pct: 0,
    receita_vinculada: 0,
    custo_entrada: 0,
    margem_rs: 0,
    margem_pct_ponderada: 0,
    aging_medio_dias: null,
  };
}

export async function buscarMargemMensalB2C(ano) {
  const { data, error } = await supabase.rpc("margem_b2c_mensal_gabriel", {
    p_ano: Number(ano),
  });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function buscarDetalheMargemB2C({
  ano,
  mes = null,
  status = "todos",
  busca = "",
  pagina = 1,
  porPagina = 50,
}) {
  const { inicio, fim } = periodoIso(ano, mes);
  const offset = Math.max(0, (pagina - 1) * porPagina);

  const { data, error } = await supabase.rpc("margem_b2c_detalhe_gabriel", {
    p_inicio: inicio,
    p_fim: fim,
    p_status: status,
    p_busca: busca.trim(),
    p_limit: porPagina,
    p_offset: offset,
  });

  if (error) throw new Error(error.message);

  const rows = data || [];
  const total = rows.length ? Number(rows[0].total_count || 0) : 0;

  return {
    rows,
    total,
    pagina,
    porPagina,
  };
}
