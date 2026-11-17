import * as XLSX from "xlsx";

function normalizarColuna(valor) {
  return String(valor ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[\uFEFF\u200B-\u200D]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

const ehVoucher = nome =>
  /^(voucher|voucher id|id voucher|codigo voucher|codigo do voucher|numero voucher|numero do voucher|voucher recebido|voucher do aparelho|voucher recebimento)$/.test(normalizarColuna(nome));
const ehImei = nome => /^(imei|imei 1|imei 2|numero imei|numero do imei|imei serie|serial imei|serie imei)$/.test(normalizarColuna(nome));
const ehOsGaia = nome =>
  /^(os|os gaia|osgaia|n os|numero os|numero da os|numero de os|numero os gaia|ordem de servico|ordem servico|ordem de servico gaia|os numero|os numero gaia)$/.test(normalizarColuna(nome));

function voucherNormalizado(value) {
  const texto = (typeof value === "number" && Number.isSafeInteger(value) ? value.toFixed(0) : String(value ?? ""))
    .normalize("NFKC").replace(/[\uFEFF\u200B-\u200D\u00A0]/g,"")
    .trim().replace(/^['"]+|['"]+$/g,"").toUpperCase().replace(/\s+/g,"");
  if (/^\d{15}$/.test(texto)) return null; // Parece IMEI, jamais usar como voucher.
  if (/^\d+$/.test(texto)) return "YBV" + texto.replace(/^0+(?=\d)/,"");
  if (/^YBV\d+$/.test(texto)) return "YBV" + texto.slice(3).replace(/^0+(?=\d)/,"");
  return /^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(texto) &&
    !/^(VOUCHER|IMEI|OS|TOTAL|PEDIDO|NUMERO)$/.test(texto) ? texto : null;
}

async function lerArquivo(arquivo, aceitarImei=false) {
  if (!arquivo || !/\.(xlsx|xls|csv|ods)$/i.test(arquivo.name))
    throw new Error("Selecione uma planilha XLSX, XLS, ODS ou CSV.");
  if (arquivo.size > 15 * 1024 * 1024 || !arquivo.size)
    throw new Error("Arquivo vazio ou maior que 15 MB.");
  const livro = XLSX.read(await arquivo.arrayBuffer(), { type: "array", raw: true, codepage: 65001 });
  for (const aba of livro.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(livro.Sheets[aba], { header: 1, raw: true, defval: "" });
    if (!linhas.length) continue;
    for (let i=0; i<Math.min(35,linhas.length); i++) {
      const cabecalho = linhas[i] || [];
      const colVoucher = cabecalho.findIndex(ehVoucher);
      const colImei = cabecalho.findIndex(ehImei);
      if (colVoucher >= 0 || (aceitarImei && colImei >= 0))
        return { arquivo: arquivo.name, aba, linhas, cabecalho: i, colVoucher, colImei, colOs: cabecalho.findIndex(ehOsGaia) };
    }
  }
  throw new Error(aceitarImei ? "Não encontrei a coluna Voucher nem IMEI." : "Não encontrei a coluna Voucher. Confira o cabeçalho do arquivo.");
}

export async function lerVoucherOsGaia(arquivo) {
  const dados = await lerArquivo(arquivo, true);
  if (dados.colOs < 0 || dados.colOs === dados.colVoucher || dados.colOs === dados.colImei)
    throw new Error("A planilha deve conter duas colunas: Voucher e OS GAIA.");
  const pares = [];
  const porVoucher = new Set(), porImei = new Set(), porOs = new Set(), erros = [];
  for (let i=dados.cabecalho+1;i<dados.linhas.length;i++) {
    const linha = dados.linhas[i] || [];
    if (linha.every(v => String(v ?? "").trim() === "")) continue;
    const valorVoucher=dados.colVoucher>=0 ? linha[dados.colVoucher] : null;
    const voucher=String(valorVoucher??'').trim() ? voucherNormalizado(valorVoucher) : null;
    const rawImei=dados.colImei>=0 ? linha[dados.colImei] : '';
    const imei=(typeof rawImei==='number' && Number.isSafeInteger(rawImei) ? rawImei.toFixed(0) : String(rawImei??'')).trim().replace(/\\.0$/,'');
    const imeiPresente=Boolean(String(rawImei??'').trim());
    const imeiValido=imeiPresente && /^\\d{15}$/.test(imei);
    const os_gaia = String(linha[dados.colOs] ?? "").trim().replace(/\.0$/,"");
    if ((String(valorVoucher??'').trim() && !voucher) || (imeiPresente && !imeiValido) || (!voucher && !imeiValido) || !/^[A-Za-z0-9._/-]{2,60}$/.test(os_gaia)) {
      erros.push("Linha " + (i+1) + ": voucher ou OS GAIA inválido");
      continue;
    }
    if ((voucher && porVoucher.has(voucher)) || (imeiValido && porImei.has(imei)) || porOs.has(os_gaia.toUpperCase())) {
      erros.push("Linha " + (i+1) + ": voucher ou OS GAIA duplicado");
      continue;
    }
    if(voucher)porVoucher.add(voucher);
    if(imeiValido)porImei.add(imei);
    porOs.add(os_gaia.toUpperCase());
    pares.push({ voucher, imei:imeiValido?imei:null, os_gaia });
    if (pares.length>5000) throw new Error("Limite de 5.000 registros por arquivo.");
  }
  if (!pares.length) throw new Error("Não encontrei registros de Voucher/IMEI + OS GAIA.");
  return { ...dados, pares, erros };
}

export async function lerVouchersMinuta(arquivo) {
  const dados = await lerArquivo(arquivo, true);
  const identificadores=[], unicos=new Set(), erros=[];
  const normalizar = valor => {
    const bruto=(typeof valor==='number' && Number.isSafeInteger(valor) ? valor.toFixed(0) : String(valor??''))
      .trim().replace(/\\.0$/,'').toUpperCase();
    if (/^\\d{15}$/.test(bruto)) return bruto; // IMEI
    return voucherNormalizado(bruto);
  };
  for (let i=dados.cabecalho+1;i<dados.linhas.length;i++){
    const linha=dados.linhas[i]||[];
    const vVoucher=dados.colVoucher>=0 ? linha[dados.colVoucher] : '';
    const vImei=dados.colImei>=0 ? linha[dados.colImei] : '';
    if (!String(vVoucher??'').trim()&&!String(vImei??'').trim())continue;
    const id=normalizar(vVoucher) || normalizar(vImei);
    if(!id){erros.push('Linha '+(i+1)+': Voucher/IMEI inválido');continue;}
    if(unicos.has(id)){erros.push('Linha '+(i+1)+': identificador repetido '+id);continue;}
    unicos.add(id);identificadores.push(id);
    if(identificadores.length>5000)throw new Error('Limite de 5.000 aparelhos por minuta.');
  }
  if(erros.length)throw new Error(erros.slice(0,12).join('; ')+'. Corrija a planilha.');
  if(!identificadores.length)throw new Error('Nenhum Voucher/IMEI válido na planilha.');
  return {...dados,identificadores};
}
