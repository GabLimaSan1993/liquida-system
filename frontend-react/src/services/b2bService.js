import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// Extrai a data do pedido do INÍCIO do nome do arquivo (formato aaaammdd).
// Ex: "20260701_GABRISCELL_QUEBRA.xlsx" -> "2026-07-01". Retorna null se não achar.
function extrairDataDoNome(nomeArquivo) {
  if (!nomeArquivo) return null;
  const m = String(nomeArquivo).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  const [, ano, mes, dia] = m;
  const a = parseInt(ano), mi = parseInt(mes), d = parseInt(dia);
  if (mi < 1 || mi > 12 || d < 1 || d > 31 || a < 2020 || a > 2100) return null;
  return `${ano}-${mes}-${dia}`;
}

// Cabeçalhos de arquivos PICKING variam entre fornecedores e podem
// começar em qualquer uma das primeiras 35 linhas de diferentes abas.
function cabecalhoB2B(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}
function prioridadeImeiB2B(v) {
  const chave=cabecalhoB2B(v);
  if (chave==="IMEI") return 100;
  if (/^IMEI(?: ?(?:1|01)| (?:PRINCIPAL|DO APARELHO|APARELHO|DO EQUIPAMENTO|EQUIPAMENTO|DO PRODUTO))$/.test(chave)) return 95;
  if (/^(NUM|NUMERO|NRO|N) (DE )?IMEI( 1)?$/.test(chave)) return 90;
  if (/^(SERIAL IMEI|IMEI SERIAL|IDENTIFICADOR IMEI)$/.test(chave)) return 85;
  // Não selecionar IMEI2 ou números de SKU como IMEI principal.
  return -1;
}
function validarImei(v) {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v==="number") {
    const numero=String(v);
    return Number.isSafeInteger(v)&&/^\d{14,16}$/.test(numero) ? numero : "";
  }
  let bruto=String(v).normalize("NFKC").trim().replace(/\u00A0/g," ");
  if (/^\d+\.0+$/.test(bruto)) bruto=bruto.replace(/\.0+$/,"");
  if (/^\d+(?:[.,]\d+)?e\+?\d+$/i.test(bruto)) {
    // Texto científico com poucos algarismos significativos NÃO identifica
    // unicamente o aparelho: completá-lo com zeros criaria IMEIs falsos.
    const mantissa=bruto.split(/[eE]/)[0].replace(/\D/g,"");
    if(mantissa.length<14) return "";
    const n=Number(bruto.replace(",","."));
    if(!Number.isSafeInteger(n)) return "";
    bruto=String(n);
  }
  const limpo=bruto.replace(/[\s.-]/g,"");
  return /^\d{14,16}$/.test(limpo)?limpo:"";
}
function limparImei(v) { return String(v??"").trim(); }
function acharImeiLinha(linha) { return validarImei(linha?.IMEI); }
function valorMoedaB2B(v){
  if(v===null||v===undefined||v==="") return null;
  if(typeof v==="number")return Number.isFinite(v)?v:null;
  const raw=String(v).replace(/[^\d.,-]/g,"").trim();
  if(!raw)return null;
  const virgula=raw.lastIndexOf(","),ponto=raw.lastIndexOf(".");
  let normalizado=raw;
  if(virgula>=0&&ponto>=0){
    normalizado=virgula>ponto?raw.replace(/\./g,"").replace(",","."):raw.replace(/,/g,"");
  }else if(virgula>=0){
    normalizado=raw.replace(",",".");
  }else if((raw.match(/\./g)||[]).length>1 || /^\d{1,3}(\.\d{3})+$/.test(raw)){
    normalizado=raw.replace(/\./g,"");
  }
  const numero=Number(normalizado);
  return Number.isFinite(numero)?numero:null;
}

// Ganhador continua sendo a origem obrigatória do cliente, nunca inferida.
function extrairPlanilhaPedidoB2B(wb) {
  const candidatos=[];
  const resumo=[];
  for(const nome of wb.SheetNames){
    const ws=wb.Sheets[nome];
    if(!ws) continue;
    const linhas=XLSX.utils.sheet_to_json(ws,{header:1,defval:null,raw:true});
    resumo.push({nome,linhas});
    for(let indice=0;indice<Math.min(35,linhas.length);indice++){
      const headers=linhas[indice]||[];
      const ranks=headers.map(prioridadeImeiB2B);
      const maior=Math.max(-1,...ranks);
      if(maior<0) continue;
      const imeiIdx=ranks.indexOf(maior);
      const ganhadorIdx=headers.findIndex(h=>["GANHADOR","GANHADOR DO LOTE","CLIENTE GANHADOR"].includes(cabecalhoB2B(h)));
      const entradas=linhas.slice(indice+1).map((celulas,posicao)=>({
        celulas:celulas||[],numero:indice+posicao+2,
      })).filter(({celulas})=>celulas.some(v=>v!==null&&v!==undefined&&String(v).trim()!==""));
      if(!entradas.length) continue;
      const validos=entradas.slice(0,25).filter(({celulas})=>Boolean(validarImei(celulas[imeiIdx]))).length;
      candidatos.push({nome,headers,indice,imeiIdx,ganhadorIdx,entradas,
        pontos:(ganhadorIdx>=0?1000:0)+validos*10+maior});
    }
  }
  candidatos.sort((a,b)=>b.pontos-a.pontos);
  const sel=candidatos[0];
  if(!sel){
    const encontrados=resumo.map(({nome,linhas})=>nome+": "+linhas.slice(0,6)
      .map(row=>(row||[]).filter(Boolean).slice(0,8).join(" / "))
      .filter(Boolean).slice(0,3).join(" | ")).join("; ");
    throw new Error("Coluna IMEI não encontrada em nenhuma aba. Identifique o cabeçalho como IMEI, IMEI 1 ou Número IMEI. Abas: "+encontrados.slice(0,320)+". Nenhum pedido foi criado.");
  }
  if(sel.ganhadorIdx<0){
    throw new Error('Coluna "Ganhador" não encontrada na aba "'+sel.nome+'". É necessária para identificar o cliente. Nenhum pedido foi criado.');
  }
  const cols=sel.headers.map(cabecalhoB2B);
  const aliases={
    RESERVA:["RESERVA"],LOTE:["LOTE"],Ganhador:["GANHADOR","GANHADOR DO LOTE","CLIENTE GANHADOR"],
    MODELO:["MODELO"],CNN:["CNN"],GRADE:["GRADE"],GRADE2:["GRADE2","GRADE 2"],
    DESC_ITEM:["DESC ITEM","DESCRICAO ITEM","DESCRICAO DO ITEM"],
    COD_ITEM:["COD ITEM","CODIGO ITEM","CODIGO DO ITEM"],
  };
  const indices=Object.fromEntries(Object.entries(aliases).map(([k,v])=>[k,cols.findIndex(c=>v.includes(c))]));
  const registros=sel.entradas.map(({celulas,numero})=>{
    const row={IMEI:celulas[sel.imeiIdx],__linhaExcel:numero,__celulas:celulas};
    for(const [chave,i] of Object.entries(indices))if(i>=0)row[chave]=celulas[i];
    return row;
  });
  return {
    registros,aba:sel.nome,linhaCabecalho:sel.indice+1,
    valorIdx:sel.headers.findIndex(h=>cabecalhoB2B(h).includes("ALOCACAO")&&String(h).includes("$")),
  };
}

// O novo WMS e a unica fonte operacional de endereco. Gaia continua apenas
// como historico/diagnostico e nunca completa um endereco ausente no WMS.
async function localizarImeisWms(imeis) {
  const unicos = [...new Set((imeis || []).map(limparImei).filter(Boolean))];
  if (!unicos.length) return new Map();

  const mapa = new Map();
  const BLOCO = 500;
  for (let i = 0; i < unicos.length; i += BLOCO) {
    const { data, error } = await supabase.rpc("wms_localizar_saida", {
      p_imeis: unicos.slice(i, i + BLOCO),
    });
    if (error) throw new Error(`Falha ao consultar o novo WMS: ${error.message}`);
    (data || []).forEach(item => mapa.set(limparImei(item.imei), item));
  }
  return mapa;
}

function normalizarCnpjUpload(valor) {
  const cnpj = String(valor ?? "").replace(/\D/g, "");
  if (cnpj.length !== 14) {
    throw new Error("CNPJ do upload inválido ou ausente: informe 14 dígitos. Nenhum dado foi alterado.");
  }
  return cnpj;
}

export async function importarPedidoB2B(file, userId, extras = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, {type:"binary"});
        const {registros:rows,valorIdx,aba,linhaCabecalho} = extrairPlanilhaPedidoB2B(wb);
        if(!rows.length)throw new Error("Planilha não contém linhas de aparelhos.");
        const invalidas=rows.map(r=>({numero:r.__linhaExcel,valor:r.IMEI,imei:acharImeiLinha(r)})).filter(r=>!r.imei);
        if(invalidas.length){
          const exemplo=invalidas.slice(0,12).map(r=>
            "linha "+r.numero+" ("+(String(r.valor??"").trim().slice(0,26)||"vazio")+")").join(", ");
          throw new Error("Importação interrompida: "+invalidas.length+
            " IMEI(s) inválidos na aba "+aba+" (cabeçalho na linha "+linhaCabecalho+
            "). Exemplos: "+exemplo+
            ". IMEI deve ter 14 a 16 dígitos preservados (notação científica arredondada não é recuperável). Nenhum pedido foi criado.");
        }
        const imeisConferidos=rows.map(acharImeiLinha);
        const repetidos=[...new Set(imeisConferidos.filter((imei,i)=>imeisConferidos.indexOf(imei)!==i))];
        if(repetidos.length)throw new Error("Planilha contém "+repetidos.length+
          " IMEI(s) duplicados (ex.: "+repetidos.slice(0,5).join(", ")+"). Nenhum pedido foi criado.");

        const loteColuna = rows.find(r => r["RESERVA"] || r["LOTE"])?.[("RESERVA")] ||
                           rows.find(r => r["RESERVA"] || r["LOTE"])?.[("LOTE")];
        const loteArquivo = file.name
          .replace(/^PICKING[\s_|]+/i, "").replace(/\.xlsx?$/i, "")
          .replace(/\s*\(\d+\)\s*$/, "").replace(/__\d+_$/g, "")
          .replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
        const lote = loteColuna || loteArquivo || "SEM_LOTE";

        // Origem do cliente: exclusivamente Ganhador da planilha.
        const ganhadores = [...new Set(rows.map(r => String(r["Ganhador"] ?? "").trim()).filter(Boolean))];
        if (ganhadores.length !== 1 || rows.some(r => !String(r["Ganhador"] ?? "").trim())) {
          throw new Error("Planilha deve ter um único Ganhador preenchido em todas as linhas. Nenhum pedido foi criado.");
        }
        const cliente = ganhadores[0];
        const cnpjUpload = normalizarCnpjUpload(extras.cnpj_agregado);
        const condicaoPagamentoUpload = String(extras.condicao_pagamento ?? "").trim();
        if (!condicaoPagamentoUpload) {
          throw new Error("Informe a condição de pagamento no upload. Nenhum pedido foi criado.");
        }

        const { data: existing } = await supabase.from("b2b_pedidos").select("id").eq("lote", lote).single();
        if (existing) throw new Error(`Pedido "${lote}" já foi importado.`);

        const { data: pedido, error: errPedido } = await supabase
          .from("b2b_pedidos")
          .insert({
            lote,
            cliente,
            data_pedido:        extrairDataDoNome(file.name),
            total_itens:        rows.length,
            criado_por:         userId,
            condicao_pagamento: condicaoPagamentoUpload,
            cnpj_agregado:      cnpjUpload,
            status_picking:     "em_andamento",
            status_faturamento: "pendente",
          })
          .select().single();
        if (errPedido) throw new Error(errPedido.message);

        // IMEIs da planilha, já normalizados (trim) para o match com a triagem
        const imeisLista = rows
          .map(r => acharImeiLinha(r))
          .filter(i => i.length > 5);

        const wmsMap = await localizarImeisWms(imeisLista);

        const itens = rows.map((r, rowIdx) => {
          const imei = acharImeiLinha(r);
          const wms = wmsMap.get(imei) || null;
          let valor = null;
          if (valorIdx >= 0) valor = valorMoedaB2B(r.__celulas[valorIdx]);
          return {
            pedido_id: pedido.id, imei,
            voucher:       wms?.voucher || null,
            modelo:        r["MODELO"]  || r["CNN"]  || null,
            grade:         r["GRADE"]   || null,
            grade2:        r["GRADE2"]  || null,
            desc_item:     r["DESC_ITEM"] || null,
            cod_item:      r["COD_ITEM"]  || null,
            local_estoque: wms?.disponivel ? wms.local : null,
            aging:         wms?.aging_dias ?? null,
            valor,
            // Fora do WMS ou já comprometido com outro pedido: análise direta.
            status:        wms?.disponivel ? "pendente" : "em_analise",
          };
        }).filter(i => i.imei && i.imei.length > 5);

        await supabase.from("b2b_pedidos").update({ total_itens: itens.length }).eq("id", pedido.id);

        const CHUNK = 500;
        for (let i = 0; i < itens.length; i += CHUNK) {
          const { error } = await supabase.from("b2b_itens").insert(itens.slice(i, i + CHUNK));
          if (error) throw new Error(error.message);
        }
        resolve({ pedido, total: itens.length, lote, cliente });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

export async function listarPedidosB2B() {
  const { data, error } = await supabase.from("b2b_pedidos").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarItens(pedidoId) {
  const { data, error } = await supabase.from("b2b_itens").select("*").eq("pedido_id", pedidoId).order("local_estoque", { ascending: true });
  if (error) throw new Error(error.message);
  const itens = data || [];
  const wmsMap = await localizarImeisWms(itens.map(i => i.imei));
  return itens.map(item => {
    const wms = wmsMap.get(limparImei(item.imei));
    return {
      ...item,
      local_estoque: wms?.local || null,
      posicao_wms_encontrada: Boolean(wms),
      aging: wms?.aging_dias ?? null,
    };
  });
}

export async function listarItensComStatusGaia(pedidoId) {
  const itens = await listarItens(pedidoId);
  if (!itens?.length) return [];

  const imeis = itens.map(i => i.imei).filter(Boolean);
  const { data: triagem } = await supabase
    .from("assurant_triagem").select("imei, status_atual, local").in("imei", imeis);

  const gaiaMap = {};
  (triagem || []).forEach(t => { if (t.imei) gaiaMap[t.imei] = t; });

  return itens.map(i => ({
    ...i,
    status_gaia: gaiaMap[i.imei]?.status_atual || null,
    local_gaia:  gaiaMap[i.imei]?.local || null,
  }));
}

export async function listarExportacoes(pedidoId) {
  const { data, error } = await supabase.from("b2b_exportacoes").select("*").eq("pedido_id", pedidoId).order("exportado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function registrarBipagem(imeiDigitado, pedidoId, userId) {
  const imei = String(imeiDigitado).trim();
  const { data: item, error: errItem } = await supabase.from("b2b_itens").select("*").eq("pedido_id", pedidoId).eq("imei", imei).single();
  if (errItem || !item) {
    const { data: outroItem } = await supabase.from("b2b_itens").select("pedido_id, status").eq("imei", imei).eq("status", "bipado").single();
    if (outroItem) return { ok: false, erro: "IMEI já bipado em outro pedido — reservado." };
    return { ok: false, erro: "IMEI não encontrado neste pedido." };
  }
  if (item.status === "bipado") return { ok: false, erro: "IMEI já bipado neste pedido.", item };
  const { error: errUpdate } = await supabase.from("b2b_itens")
    .update({ status: "bipado", imei_bipado: imei, bipado_em: new Date().toISOString(), bipado_por: userId })
    .eq("id", item.id);
  if (errUpdate) return { ok: false, erro: errUpdate.message };
  await supabase.rpc("b2b_atualizar_contador", { p_pedido_id: pedidoId });
  await verificarConclusaoPicking(pedidoId);
  await verificarConclusaoFaturamento(pedidoId);
  return { ok: true, item };
}

export async function marcarNaoLocalizado(itemId, userId) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "nao_localizado",
      nao_localizado_em:  new Date().toISOString(),
      nao_localizado_por: userId,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function marcarEmAnalise(itemId, userId) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "em_analise",
      nao_localizado_em:  new Date().toISOString(),
      nao_localizado_por: userId,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function marcarLocalizado(itemId, _novaLocalizacao, userId) {
  const { data: itemAtual, error: errItem } = await supabase
    .from("b2b_itens")
    .select("imei")
    .eq("id", itemId)
    .single();
  if (errItem || !itemAtual?.imei) throw new Error("Item B2B não encontrado.");

  const wms = (await localizarImeisWms([itemAtual.imei])).get(limparImei(itemAtual.imei));
  if (!wms?.local) {
    throw new Error("IMEI não possui posição confirmada no novo WMS.");
  }

  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "bipado",
      local_estoque:      wms.local,
      localizado_em:      new Date().toISOString(),
      localizado_por:     userId,
      localizado_local:   wms.local,
      nao_localizado_em:  null,
      nao_localizado_por: null,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  const { data: item } = await supabase.from("b2b_itens").select("pedido_id").eq("id", itemId).single();
  if (item?.pedido_id) {
    await supabase.rpc("b2b_atualizar_contador", { p_pedido_id: item.pedido_id });
    await verificarConclusaoPicking(item.pedido_id);
    await verificarConclusaoFaturamento(item.pedido_id);
  }
}

export async function marcarNaoFaturar(itemId, motivo, observacao, userId) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "nao_faturar",
      motivo_nao_faturar: motivo,
      obs_nao_faturar:    observacao || null,
      nao_faturar_em:     new Date().toISOString(),
      nao_faturar_por:    userId,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  const { data: item } = await supabase.from("b2b_itens").select("pedido_id").eq("id", itemId).single();
  if (item?.pedido_id) {
    await verificarConclusaoPicking(item.pedido_id);
    await verificarConclusaoFaturamento(item.pedido_id);
  }
}

export async function reverterNaoLocalizado(itemId) {
  const { data: itemAtual, error: errItem } = await supabase
    .from("b2b_itens")
    .select("imei")
    .eq("id", itemId)
    .single();
  if (errItem || !itemAtual?.imei) throw new Error("Item B2B não encontrado.");

  const wms = (await localizarImeisWms([itemAtual.imei])).get(limparImei(itemAtual.imei));
  if (!wms?.local) {
    throw new Error("IMEI não possui posição confirmada no novo WMS.");
  }

  const { error } = await supabase.from("b2b_itens")
    .update({
      status:               "pendente",
      local_estoque:        wms.local,
      nao_localizado_em:    null,
      nao_localizado_por:   null,
      nao_localizado_local: wms.local,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  const { data: item } = await supabase.from("b2b_itens").select("pedido_id").eq("id", itemId).single();
  if (item?.pedido_id) await reabrirPickingSeNecessario(item.pedido_id);
}

export async function exportarFaturamento(pedidoId, userId, nomeUsuario) {
  // Cada download contém a situação atual, inclusive itens já exportados.
  const { count: totalExportacoes, error: errHistorico } = await supabase
    .from("b2b_exportacoes")
    .select("id", { count: "exact", head: true })
    .eq("pedido_id", pedidoId);
  if (errHistorico) throw new Error(errHistorico.message);

  const itensBipados = [];
  const PAGE_SIZE = 1000;
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data: pagina, error: errItens } = await supabase
      .from("b2b_itens").select("*")
      .eq("pedido_id", pedidoId)
      .eq("status", "bipado")
      .order("local_estoque")
      .order("id")
      .range(offset, offset + PAGE_SIZE - 1);
    if (errItens) throw new Error(errItens.message);
    itensBipados.push(...(pagina || []));
    if ((pagina || []).length < PAGE_SIZE) break;
  }
  if (!itensBipados.length) throw new Error("Nenhum item bipado para exportar.");

  const { data: pedido, error: errPedido } = await supabase.from("b2b_pedidos").select("*").eq("id", pedidoId).single();
  if (errPedido || !pedido) throw new Error(errPedido?.message || "Pedido não encontrado.");
  // Faturamento não consulta b2b_clientes: dados são os do próprio upload.
  const cliente = String(pedido.cliente ?? "").trim();
  if (!cliente) throw new Error("Faturamento bloqueado: cliente ausente no pedido.");
  const cnpj = normalizarCnpjUpload(pedido.cnpj_agregado);
  const condicaoPagamento = String(pedido.condicao_pagamento ?? "").trim();
  if (!condicaoPagamento) {
    throw new Error("Faturamento bloqueado: condição de pagamento ausente no upload. Regularize o pedido antes de exportar.");
  }

  const { data: novaExportacao, error: errExp } = await supabase.from("b2b_exportacoes")
    .insert({ pedido_id: pedidoId, exportado_por: userId, nome_usuario: nomeUsuario, total_itens: itensBipados.length })
    .select().single();
  if (errExp) throw new Error(errExp.message);

  const CHUNK = 500;
  const linksItens = itensBipados.map(i => ({ exportacao_id: novaExportacao.id, item_id: i.id }));
  for (let i = 0; i < linksItens.length; i += CHUNK) {
    const { error: errLinks } = await supabase.from("b2b_itens_exportados").insert(linksItens.slice(i, i + CHUNK));
    if (errLinks) throw new Error(errLinks.message);
  }

  const numeroExportacao = (totalExportacoes || 0) + 1;
  const rows = itensBipados.map(i => ({
    "LOTE":      pedido.lote,
    "CLIENTE":   cliente,
    "CNPJ":      cnpj,
    "CONDIÇÃO DE PAGAMENTO": condicaoPagamento,
    "VOUCHER":   i.voucher,
    "IMEI":      i.imei,
    "MODELO":    i.modelo,
    "GRADE":     i.grade,
    "DESC_ITEM": i.desc_item,
    "COD_ITEM":  i.cod_item,
    "LOCAL":     i.local_estoque,
    "VALOR":     i.valor != null ? i.valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
    "BIPADO_EM": i.bipado_em ? new Date(i.bipado_em).toLocaleString("pt-BR") : "",
    "NF":        i.nf || "",
    "STATUS":    "OK",
    "MOTIVO":    "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Faturamento");
  const nomeArquivo = `faturamento_${pedido.lote}_v${numeroExportacao}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);

  return { bloqueado: false, total: itensBipados.length, numeroExportacao, nomeArquivo };
}

// ══════════════════════════════════════════════════════════
// CONCLUSÃO DE PICKING — independente de NF
// ══════════════════════════════════════════════════════════
async function verificarConclusaoPicking(pedidoId) {
  const { data: itens } = await supabase
    .from("b2b_itens").select("status")
    .eq("pedido_id", pedidoId);

  const todos           = itens || [];
  const total           = todos.length;
  const totalPendentes  = todos.filter(i => i.status === "pendente").length;
  const totalAnalise    = todos.filter(i => ["nao_localizado", "em_analise"].includes(i.status)).length;
  const totalBipados    = todos.filter(i => i.status === "bipado").length;
  const totalNaoFaturar = todos.filter(i => i.status === "nao_faturar").length;

  const pickingCompleto = total > 0
    && totalPendentes === 0
    && totalAnalise === 0
    && (totalBipados + totalNaoFaturar) === total;

  if (pickingCompleto) {
    await supabase
      .from("b2b_pedidos")
      .update({ status_picking: "concluido" })
      .eq("id", pedidoId);
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════
// CONCLUSÃO DE FATURAMENTO — depende de NF
// ══════════════════════════════════════════════════════════
async function verificarConclusaoFaturamento(pedidoId) {
  const {
    data: itens,
    error: erroItens,
  } = await supabase
    .from("b2b_itens")
    .select("status, nf")
    .eq("pedido_id", pedidoId);

  if (erroItens) {
    throw new Error(erroItens.message);
  }

  const {
    data: todasNFs,
    error: erroNFs,
  } = await supabase
    .from("b2b_nfs")
    .select(
      "numero_nf, total_itens, status"
    )
    .eq("pedido_id", pedidoId);

  if (erroNFs) {
    throw new Error(erroNFs.message);
  }

  const todos =
    itens || [];

  const nfs =
    todasNFs || [];

  const totalBipados =
    todos.filter(
      (item) =>
        item.status === "bipado"
    ).length;

  const totalNaoFaturar =
    todos.filter(
      (item) =>
        item.status ===
        "nao_faturar"
    ).length;

  const nfsErro =
    nfs.filter(
      (nf) =>
        nf.status === "erro"
    );

  const nfsOk =
    nfs.filter(
      (nf) =>
        nf.status !== "erro"
    );

  const numerosErro =
    new Set(
      nfsErro.map(
        (nf) =>
          String(nf.numero_nf)
      )
    );

  const numerosOk =
    new Set(
      nfsOk.map(
        (nf) =>
          String(nf.numero_nf)
      )
    );

  /*
   * A NF pode estar vinculada diretamente
   * aos itens ou registrada somente com
   * a quantidade de aparelhos.
   *
   * Utilizamos a maior evidência disponível
   * sem somar as duas e duplicar o volume.
   */
  const bipadosComNFok =
    todos.filter(
      (item) =>
        item.status ===
          "bipado" &&
        item.nf &&
        numerosOk.has(
          String(item.nf)
        )
    ).length;

  const bipadosComNFErro =
    todos.filter(
      (item) =>
        item.status ===
          "bipado" &&
        item.nf &&
        numerosErro.has(
          String(item.nf)
        )
    ).length;

  const totalItensNFok =
    nfsOk.reduce(
      (total, nf) =>
        total +
        Number(
          nf.total_itens || 0
        ),
      0
    );

  const totalItensNFErro =
    nfsErro.reduce(
      (total, nf) =>
        total +
        Number(
          nf.total_itens || 0
        ),
      0
    );

  const coberturaNFok =
    Math.max(
      bipadosComNFok,
      totalItensNFok
    );

  const coberturaNFErro =
    Math.max(
      bipadosComNFErro,
      totalItensNFErro
    );

  const coberturaFaturamento =
    coberturaNFok +
    coberturaNFErro;

  /*
   * Regra operacional:
   *
   * Faturados
   * + Não faturar
   * + Erro de NF
   * >= Total do pedido
   */
  const totalCoberto =
    Math.min(
      todos.length,

      totalNaoFaturar +
        coberturaFaturamento
    );

  const faturamentoCoberto =
    todos.length > 0 &&
    totalCoberto >=
      todos.length;

  let statusFaturamento;

  if (totalBipados === 0) {
    statusFaturamento =
      "concluido";
  } else if (
    faturamentoCoberto &&
    nfsErro.length > 0
  ) {
    /*
     * Mantém o alerta de erro,
     * mas não bloqueia a conclusão.
     */
    statusFaturamento =
      "erro_nf";
  } else if (
    faturamentoCoberto
  ) {
    statusFaturamento =
      "concluido";
  } else if (
    nfsErro.length > 0
  ) {
    statusFaturamento =
      "erro_nf";
  } else if (
    coberturaFaturamento > 0
  ) {
    statusFaturamento =
      "parcial";
  } else {
    statusFaturamento =
      "pendente";
  }

  const {
    error: erroAtualizacao,
  } = await supabase
    .from("b2b_pedidos")
    .update({
      status_faturamento:
        statusFaturamento,
    })
    .eq("id", pedidoId);

  if (erroAtualizacao) {
    throw new Error(
      erroAtualizacao.message
    );
  }

  const {
    data: pedido,
    error: erroPedido,
  } = await supabase
    .from("b2b_pedidos")
    .select("status_picking")
    .eq("id", pedidoId)
    .single();

  if (erroPedido) {
    throw new Error(
      erroPedido.message
    );
  }

  /*
   * A presença de erro de NF não impede
   * mais a conclusão e o disparo do e-mail.
   */
  if (
    pedido?.status_picking ===
      "concluido" &&
    faturamentoCoberto
  ) {
    const {
      error: erroConclusao,
    } = await supabase
      .from("b2b_pedidos")
      .update({
        status: "concluido",
      })
      .eq("id", pedidoId);

    if (erroConclusao) {
      throw new Error(
        erroConclusao.message
      );
    }
  }

  return statusFaturamento;
}

// ══════════════════════════════════════════════════════════
// REABRIR PICKING — quando um item volta para pendente/análise
// ══════════════════════════════════════════════════════════
async function reabrirPickingSeNecessario(pedidoId) {
  const { data: itens } = await supabase
    .from("b2b_itens").select("status")
    .eq("pedido_id", pedidoId);

  const todos          = itens || [];
  const temNaoTerminal = todos.some(i => ["pendente", "nao_localizado", "em_analise"].includes(i.status));

  if (temNaoTerminal) {
    await supabase
      .from("b2b_pedidos")
      .update({ status_picking: "em_andamento", status: "aberto" })
      .eq("id", pedidoId);
  }
}

export async function importarNFPlanilha(file, pedidoId, userId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: "binary" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

        if (!rows.length) throw new Error("Planilha vazia.");

        const ehErro    = (v) => String(v ?? "").trim().toLowerCase() === "erro";
        const lerMotivo = (r) =>
          r["MOTIVO"] ?? r["Motivo"] ?? r["OBSERVAÇÕES"] ?? r["OBSERVACOES"] ?? null;

        const linhasComNF = rows.filter(r => r["NF"] && String(r["NF"]).trim() !== "");
        if (!linhasComNF.length) throw new Error("Nenhuma linha com NF preenchida encontrada.");

        const { data: pedido, error: errPedido } = await supabase
          .from("b2b_pedidos").select("*").eq("id", pedidoId).single();
        if (errPedido || !pedido) throw new Error("Pedido não encontrado.");

        const nfMap = {};
        for (const row of linhasComNF) {
          const nf       = String(row["NF"]).trim();
          const imei     = String(row["IMEI"] || "").trim();
          const valorRaw = row["VALOR"] ? String(row["VALOR"]).replace(/,/g, "") : "0";
          const valor    = parseFloat(valorRaw) || 0;

          if (!nfMap[nf]) nfMap[nf] = { itens: [], valorTotal: 0, status: "ok", motivo: null };
          nfMap[nf].itens.push(imei);
          nfMap[nf].valorTotal += valor;
          if (ehErro(row["STATUS"])) {
            nfMap[nf].status = "erro";
            const m = lerMotivo(row);
            if (m && !nfMap[nf].motivo) nfMap[nf].motivo = String(m).trim();
          }
        }

        const { data: nfsExistentes } = await supabase
          .from("b2b_nfs").select("id, numero_nf").eq("pedido_id", pedidoId);
        const idPorNumero = {};
        (nfsExistentes || []).forEach(n => { idPorNumero[String(n.numero_nf)] = n.id; });

        let nfsOkCount = 0, nfsErroCount = 0;
        const nfsProcessadas = [];

        for (const [numeroNf, dados] of Object.entries(nfMap)) {
          const ehErroNf = dados.status === "erro";
          const payload = {
            total_itens:  dados.itens.length,
            valor_total:  ehErroNf ? 0 : dados.valorTotal,
            status:       dados.status,
            motivo_erro:  ehErroNf ? (dados.motivo || null) : null,
          };

          if (idPorNumero[numeroNf]) {
            await supabase.from("b2b_nfs").update(payload).eq("id", idPorNumero[numeroNf]);
          } else {
            await supabase.from("b2b_nfs").insert({
              pedido_id:        pedidoId,
              numero_nf:        numeroNf,
              total_caixas:     0,
              data_faturamento: new Date().toISOString(),
              importado_por:    userId,
              ...payload,
            });
          }

          const imeisNF = dados.itens.filter(i => i.length > 5);
          if (imeisNF.length > 0) {
            const CHUNK = 500;
            for (let i = 0; i < imeisNF.length; i += CHUNK) {
              await supabase
                .from("b2b_itens")
                .update({ nf: numeroNf })
                .eq("pedido_id", pedidoId)
                .in("imei", imeisNF.slice(i, i + CHUNK));
            }
          }

          nfsProcessadas.push(numeroNf);
          if (ehErroNf) nfsErroCount++; else nfsOkCount++;
        }

        if (!nfsProcessadas.length) throw new Error("Nenhuma NF foi processada.");

        await verificarConclusaoFaturamento(pedidoId);

        resolve({
          ok:         true,
          totalNFs:   nfsProcessadas.length,
          nfsOk:      nfsOkCount,
          nfsErro:    nfsErroCount,
          totalItens: linhasComNF.length,
          nfs:        nfsProcessadas,
        });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

export async function importarNFPedido(pedidoId, numeroNf, totalItens, totalCaixas, userId) {
  const { data: itensData } = await supabase
    .from("b2b_itens").select("valor").eq("pedido_id", pedidoId).eq("status", "bipado");
  const valor = (itensData || []).reduce((s, i) => s + (i.valor || 0), 0);

  const { data, error } = await supabase.from("b2b_nfs")
    .insert({
      pedido_id:        pedidoId,
      numero_nf:        numeroNf,
      total_itens:      totalItens,
      total_caixas:     totalCaixas,
      valor_total:      valor,
      data_faturamento: new Date().toISOString(),
      importado_por:    userId,
    })
    .select().single();
  if (error) throw new Error(error.message);

  await verificarConclusaoFaturamento(pedidoId);
  return data;
}

// ══════════════════════════════════════════════════════════
// REGISTRAR NF COM ERRO MANUALMENTE (pela tela, sem planilha)
// ══════════════════════════════════════════════════════════
export async function registrarNFErro(pedidoId, numeroNf, qtdItens, motivo, userId) {
  const nf = String(numeroNf || "").trim();
  if (!nf) return { ok: false, erro: "Informe o número da NF." };
  const qtd = parseInt(qtdItens, 10);
  if (!qtd || qtd < 1) return { ok: false, erro: "Informe a quantidade de itens da NF." };

  const { data: existente } = await supabase
    .from("b2b_nfs").select("id")
    .eq("pedido_id", pedidoId).eq("numero_nf", nf).maybeSingle();

  const payload = {
    status:       "erro",
    motivo_erro:  (motivo || "").trim() || null,
    total_itens:  qtd,
  };

  if (existente) {
    const { error } = await supabase.from("b2b_nfs").update(payload).eq("id", existente.id);
    if (error) return { ok: false, erro: error.message };
  } else {
    const { error } = await supabase.from("b2b_nfs").insert({
      pedido_id:        pedidoId,
      numero_nf:        nf,
      total_caixas:     0,
      valor_total:      0,
      data_faturamento: new Date().toISOString(),
      importado_por:    userId,
      ...payload,
    });
    if (error) return { ok: false, erro: error.message };
  }

  await verificarConclusaoFaturamento(pedidoId);
  return { ok: true };
}

// ══════════════════════════════════════════════════════════
// REMOVER NF COM ERRO
// ══════════════════════════════════════════════════════════
export async function removerNFErro(pedidoId, numeroNf) {
  const nf = String(numeroNf || "").trim();
  if (!nf) return { ok: false, erro: "NF inválida." };

  const { error } = await supabase
    .from("b2b_nfs")
    .delete()
    .eq("pedido_id", pedidoId).eq("numero_nf", nf).eq("status", "erro");
  if (error) return { ok: false, erro: error.message };

  await verificarConclusaoFaturamento(pedidoId);
  return { ok: true };
}

export async function buscarResumoValorPedido(pedidoId) {
  const [{ data: itensData }, { data: nfsData }] = await Promise.all([
    supabase.from("b2b_itens").select("status, valor").eq("pedido_id", pedidoId),
    supabase.from("b2b_nfs").select("numero_nf, total_itens, valor_total, status, motivo_erro").eq("pedido_id", pedidoId),
  ]);

  const itens = itensData || [];
  const nfs   = nfsData   || [];

  const totalValor      = itens.reduce((s, i) => s + (i.valor || 0), 0);
  const itensBipados    = itens.filter(i => i.status === "bipado");
  const valorBipado     = itensBipados.reduce((s, i) => s + (i.valor || 0), 0);
  const qtdBipados      = itensBipados.length;
  const itensNaoFaturar = itens.filter(i => i.status === "nao_faturar");
  const valorNaoFaturar = itensNaoFaturar.reduce((s, i) => s + (i.valor || 0), 0);
  const qtdNaoFaturar   = itensNaoFaturar.length;
  const qtdEmAnalise    = itens.filter(i => ["nao_localizado", "em_analise"].includes(i.status)).length;

  const nfsOk      = nfs.filter(n => n.status !== "erro");
  const nfsErroArr = nfs.filter(n => n.status === "erro");
  const nfsErro    = nfsErroArr.map(n => ({ numero: n.numero_nf, qtd: n.total_itens || 0, motivo: n.motivo_erro || "" }));
  const qtdNfsErro = nfsErro.length;
  const qtdNfsOk   = nfsOk.length;
  const qtdErro    = nfsErro.reduce((s, n) => s + (n.qtd || 0), 0);

  const valorFaturado = nfsOk.reduce((s, n) => s + (n.valor_total || 0), 0);
  const qtdFaturada   = nfsOk.reduce((s, n) => s + (n.total_itens || 0), 0);

  return {
    totalValor, valorBipado, qtdBipados,
    valorFaturado, qtdFaturada,
    valorNaoFaturar, qtdNaoFaturar, qtdEmAnalise,
    nfsErro, qtdNfsErro, qtdNfsOk, qtdErro,
  };
}

export async function listarNFsPedido(pedidoId) {
  const { data: nfs } = await supabase
    .from("b2b_nfs")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("data_faturamento", { ascending: true });

  if (!nfs?.length) return [];

  const userIds = [...new Set(nfs.map(n => n.importado_por).filter(Boolean))];
  let nomeMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, nome")
      .in("id", userIds);
    (profiles || []).forEach(p => { nomeMap[p.id] = p.nome; });
  }

  return nfs.map(n => ({
    ...n,
    nome_importador: nomeMap[n.importado_por] || "—",
  }));
}

export async function listarExportacoesPedido(pedidoId) {
  const { data } = await supabase
    .from("b2b_exportacoes")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("exportado_em", { ascending: true });
  return data || [];
}

export async function listarPedidosConcluidos() {
  const { data: pedidos, error } = await supabase
    .from("b2b_pedidos").select("*").eq("status", "concluido").order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  if (!pedidos?.length) return [];

  const pedidoIds = pedidos.map(p => p.id);

  const { data: nfsRaw } = await supabase
    .from("b2b_nfs")
    .select("*")
    .in("pedido_id", pedidoIds)
    .order("data_faturamento", { ascending: true });

  const nfUserIds = [...new Set((nfsRaw || []).map(n => n.importado_por).filter(Boolean))];
  let nfNomeMap = {};
  if (nfUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, nome")
      .in("id", nfUserIds);
    (profiles || []).forEach(p => { nfNomeMap[p.id] = p.nome; });
  }

  const nfs = (nfsRaw || []).map(n => ({
    ...n,
    nome_importador: nfNomeMap[n.importado_por] || "—",
  }));

  const { data: exportacoesRaw } = await supabase
    .from("b2b_exportacoes")
    .select("*")
    .in("pedido_id", pedidoIds)
    .order("exportado_em", { ascending: true });

  const { data: itens } = await supabase
    .from("b2b_itens").select("pedido_id, valor, status")
    .in("pedido_id", pedidoIds);

  return pedidos.map(p => {
    const nfsPedido         = nfs.filter(n => n.pedido_id === p.id);
    const exportacoesPedido = (exportacoesRaw || []).filter(e => e.pedido_id === p.id);
    const itensPedido       = (itens || []).filter(i => i.pedido_id === p.id);

    const valorFat = nfsPedido.length > 0
      ? nfsPedido.reduce((s, n) => s + (n.valor_total || 0), 0)
      : itensPedido.filter(i => i.status === "bipado").reduce((s, i) => s + (i.valor || 0), 0);

    const dataPedido = p.data_pedido ? new Date(p.data_pedido) : new Date(p.criado_em);
    const datasNF    = nfsPedido.map(n => new Date(n.data_faturamento || n.importado_em));
    const tempoMedio = datasNF.length > 0
      ? datasNF.reduce((s, d) => s + (d - dataPedido), 0) / datasNF.length / (1000 * 60 * 60 * 24)
      : null;

    return {
      ...p,
      nfs:         nfsPedido,
      exportacoes: exportacoesPedido,
      valorFat,
      tempoMedio:  tempoMedio ? Math.round(tempoMedio) : null,
      anoPedido:   dataPedido.getFullYear(),
      mesPedido:   dataPedido.getMonth() + 1,
    };
  });
}
