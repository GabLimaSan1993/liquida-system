import { useMemo, useState } from "react";
import {
  Save,
  RotateCcw,
  ClipboardList,
  RefreshCcw,
  UploadCloud,
  FileText,
} from "lucide-react";
import {
  buildLote,
  buildNumeroOs,
  createOrdemServico,
  parseXmlNfe,
} from "../services/osService.js";

const EMPTY_FORM = {
  numero_os: "",
  dt_entrada: new Date().toISOString().slice(0, 10),
  dt_fabricacao: "",
  lote: "",
  fornecedor: "",
  fornecedor_cnpj: "",
  origem: "Compra",

  nf_entrada_id: null,
  nf_entrada_item_id: null,
  chave_nfe: "",
  numero_nf: "",
  serie_nf: "",
  item_xml_index: "",

  linha_produto: "",
  categoria: "",
  marca: "",
  modelo: "",
  descricao_produto: "",
  serial_number: "",
  imei: "",
  voltagem: "",
  valor_entrada: "",

  estado_visual: "OK",
  possui_avaria: false,
  descricao_avaria: "",
  acessorios_recebidos: "",
  observacoes_logistica: "",

  status_atual: "Recebido",
  etapa_atual: "Aguardando triagem",
  prioridade: "Normal",
};

const LINHAS_PRODUTO = [
  "Linha Branca",
  "Linha Marrom",
  "Celulares",
  "Diversos",
];

function SectionCard({ children }) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function inputClass(disabled = false) {
  return `w-full rounded-2xl border border-[#E9D5FF] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#F59E0B]/40 ${
    disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"
  }`;
}

function Button({ children, primary = false, ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
        primary
          ? "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white"
          : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]"
      }`}
    >
      {children}
    </button>
  );
}

export default function AberturaOsPage() {
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    numero_os: buildNumeroOs("Diversos"),
    lote: buildLote("Diversos"),
  });

  const [xmlData, setXmlData] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [readingXml, setReadingXml] = useState(false);
  const [status, setStatus] = useState("");

  const xmlLoaded = Boolean(xmlData);

  const canSave = useMemo(() => {
    return (
      xmlLoaded &&
      form.numero_os &&
      form.dt_entrada &&
      form.linha_produto &&
      form.marca &&
      form.fornecedor &&
      form.numero_nf &&
      form.item_xml_index !== ""
    );
  }, [form, xmlLoaded]);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleLinhaProdutoChange(value) {
    setForm((current) => ({
      ...current,
      linha_produto: value,
      numero_os: buildNumeroOs(value),
      lote: buildLote(value),
    }));
  }

  function regenerateNumeroOs() {
    setForm((current) => ({
      ...current,
      numero_os: buildNumeroOs(current.linha_produto || "Diversos"),
    }));
  }

  function regenerateLote() {
    setForm((current) => ({
      ...current,
      lote: buildLote(current.linha_produto || "Diversos"),
    }));
  }

  async function handleXmlUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setReadingXml(true);
      setStatus("Lendo XML da NF...");

      const parsed = await parseXmlNfe(file);
      setXmlData(parsed);
      setSelectedItem(null);

      setForm((current) => ({
        ...current,
        fornecedor: parsed.fornecedor,
        fornecedor_cnpj: parsed.fornecedor_cnpj,
        numero_nf: parsed.numero_nf,
        serie_nf: parsed.serie_nf,
        chave_nfe: parsed.chave_nfe,
        item_xml_index: "",
        lote: current.lote || buildLote(current.linha_produto || "Diversos"),
      }));

      setStatus(`XML lido com sucesso. NF ${parsed.numero_nf} com ${parsed.itens.length} item(ns).`);
    } catch (error) {
      console.error(error);
      setStatus(`Erro ao ler XML: ${error.message || "falha ao processar NF"}`);
    } finally {
      setReadingXml(false);
    }
  }

  function handleItemChange(indexValue) {
    if (!xmlData) return;

    const item = xmlData.itens.find((current) => String(current.index) === String(indexValue));
    setSelectedItem(item || null);

    setForm((current) => ({
      ...current,
      item_xml_index: indexValue,
      descricao_produto: item?.descricao || "",
      categoria: item?.descricao || "",
      valor_entrada: item?.valor_unitario || item?.valor_total || "",
    }));
  }

  function resetForm() {
    setXmlData(null);
    setSelectedItem(null);
    setForm({
      ...EMPTY_FORM,
      numero_os: buildNumeroOs("Diversos"),
      lote: buildLote("Diversos"),
    });
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSave) {
      setStatus("Suba o XML da NF, selecione o item e preencha linha do produto e marca.");
      return;
    }

    if (form.dt_fabricacao && form.dt_fabricacao > new Date().toISOString().slice(0, 10)) {
      setStatus("A data de fabricação não pode ser futura.");
      return;
    }

    try {
      setSaving(true);
      setStatus("Salvando OS e alimentando aging operacional...");

      await createOrdemServico({
        ...form,
        possui_avaria: Boolean(form.possui_avaria),
        valor_entrada: form.valor_entrada === "" ? null : Number(form.valor_entrada),
        nf_entrada_item_id: form.item_xml_index === "" ? null : Number(form.item_xml_index),
      });

      setStatus(`OS ${form.numero_os} criada com sucesso.`);

      setForm((current) => ({
        ...EMPTY_FORM,
        numero_os: buildNumeroOs(current.linha_produto || "Diversos"),
        lote: current.lote,
        fornecedor: current.fornecedor,
        fornecedor_cnpj: current.fornecedor_cnpj,
        numero_nf: current.numero_nf,
        serie_nf: current.serie_nf,
        chave_nfe: current.chave_nfe,
        linha_produto: current.linha_produto,
      }));

      setSelectedItem(null);
    } catch (error) {
      console.error(error);
      setStatus(`Erro ao salvar OS: ${error.message || "falha no cadastro"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#6B1F87]">
              Abertura de OS
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Suba o XML da NF para amarrar fornecedor, item, lote, NF e OS.
            </p>
          </div>

          <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
            <div className="text-xs font-semibold text-slate-500">Status inicial</div>
            <div className="text-sm font-bold text-[#6B1F87]">
              Recebido / Aguardando triagem
            </div>
          </div>
        </div>
      </SectionCard>

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard>
          <div className="mb-5 flex items-center gap-2">
            <UploadCloud className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">XML da NF de entrada</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
            <div className="rounded-3xl border border-dashed border-[#D8B4FE] bg-[#FCFAFF] p-5">
              <input
                type="file"
                accept=".xml,text/xml,application/xml"
                onChange={handleXmlUpload}
                className="block w-full text-sm text-slate-600"
              />

              <div className="mt-4 text-sm text-slate-500">
                {readingXml
                  ? "Processando XML..."
                  : xmlLoaded
                  ? `NF ${xmlData.numero_nf} carregada`
                  : "Selecione o XML da NF de entrada"}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Fornecedor">
                <input
                  value={form.fornecedor}
                  disabled
                  className={inputClass(true)}
                />
              </Field>

              <Field label="CNPJ fornecedor">
                <input
                  value={form.fornecedor_cnpj}
                  disabled
                  className={inputClass(true)}
                />
              </Field>

              <Field label="Número NF">
                <input
                  value={form.numero_nf}
                  disabled
                  className={inputClass(true)}
                />
              </Field>

              <Field label="Chave NF-e">
                <input
                  value={form.chave_nfe}
                  disabled
                  className={inputClass(true)}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="mb-5 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">Identificação da OS</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Linha do produto">
              <select
                value={form.linha_produto}
                onChange={(e) => handleLinhaProdutoChange(e.target.value)}
                className={inputClass()}
              >
                <option value="">Selecione</option>
                {LINHAS_PRODUTO.map((linha) => (
                  <option key={linha} value={linha}>
                    {linha}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Número da OS">
              <div className="flex gap-2">
                <input
                  value={form.numero_os}
                  disabled
                  className={inputClass(true)}
                />
                <button
                  type="button"
                  onClick={regenerateNumeroOs}
                  className="rounded-2xl bg-white px-3 text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>
            </Field>

            <Field label="Lote automático">
              <div className="flex gap-2">
                <input
                  value={form.lote}
                  disabled
                  className={inputClass(true)}
                />
                <button
                  type="button"
                  onClick={regenerateLote}
                  className="rounded-2xl bg-white px-3 text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>
            </Field>

            <Field label="Data de entrada">
              <input
                type="date"
                value={form.dt_entrada}
                onChange={(e) => update("dt_entrada", e.target.value)}
                className={inputClass()}
              />
            </Field>

            <Field label="Data de fabricação">
              <input
                type="date"
                value={form.dt_fabricacao}
                onChange={(e) => update("dt_fabricacao", e.target.value)}
                className={inputClass()}
              />
            </Field>

            <Field label="Origem">
              <input value={form.origem} disabled className={inputClass(true)} />
            </Field>

            <Field label="Prioridade">
              <select
                value={form.prioridade}
                onChange={(e) => update("prioridade", e.target.value)}
                className={inputClass()}
              >
                <option>Baixa</option>
                <option>Normal</option>
                <option>Alta</option>
                <option>Urgente</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="mb-5 flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">Item da NF</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2">
              <Field label="Item da NF">
                <select
                  value={form.item_xml_index}
                  onChange={(e) => handleItemChange(e.target.value)}
                  disabled={!xmlLoaded}
                  className={inputClass(!xmlLoaded)}
                >
                  <option value="">Selecione um item da NF</option>
                  {xmlData?.itens?.map((item) => (
                    <option key={item.index} value={item.index}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label="Quantidade NF">
              <input
                value={selectedItem?.quantidade || ""}
                disabled
                className={inputClass(true)}
              />
            </Field>

            <Field label="Valor unitário NF">
              <input
                value={selectedItem?.valor_unitario || ""}
                disabled
                className={inputClass(true)}
              />
            </Field>

            <div className="md:col-span-2">
              <Field label="Descrição do produto">
                <input
                  value={form.descricao_produto}
                  disabled
                  className={inputClass(true)}
                />
              </Field>
            </div>

            <Field label="Valor de entrada">
              <input
                value={form.valor_entrada}
                disabled
                className={inputClass(true)}
              />
            </Field>
          </div>
        </SectionCard>

        <SectionCard>
          <h2 className="mb-5 text-lg font-bold text-[#6B1F87]">Dados complementares do produto</h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Categoria">
              <input
                value={form.categoria}
                onChange={(e) => update("categoria", e.target.value)}
                className={inputClass()}
              />
            </Field>

            <Field label="Marca">
              <input
                value={form.marca}
                onChange={(e) => update("marca", e.target.value)}
                className={inputClass()}
              />
            </Field>

            <Field label="Modelo">
              <input
                value={form.modelo}
                onChange={(e) => update("modelo", e.target.value)}
                className={inputClass()}
              />
            </Field>

            <Field label="Serial">
              <input
                value={form.serial_number}
                onChange={(e) => update("serial_number", e.target.value)}
                className={inputClass()}
              />
            </Field>

            <Field label="IMEI / patrimônio">
              <input
                value={form.imei}
                onChange={(e) => update("imei", e.target.value)}
                className={inputClass()}
              />
            </Field>

            <Field label="Voltagem">
              <select
                value={form.voltagem}
                onChange={(e) => update("voltagem", e.target.value)}
                className={inputClass()}
              >
                <option value="">Selecione</option>
                <option>110V</option>
                <option>127V</option>
                <option>220V</option>
                <option>Bivolt</option>
                <option>Não aplicável</option>
              </select>
            </Field>
          </div>
        </SectionCard>

        <SectionCard>
          <h2 className="mb-5 text-lg font-bold text-[#6B1F87]">Condição de entrada</h2>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Estado visual">
              <select
                value={form.estado_visual}
                onChange={(e) => update("estado_visual", e.target.value)}
                className={inputClass()}
              >
                <option>OK</option>
                <option>Leve</option>
                <option>Médio</option>
                <option>Grave</option>
              </select>
            </Field>

            <Field label="Possui avaria?">
              <select
                value={form.possui_avaria ? "Sim" : "Não"}
                onChange={(e) => update("possui_avaria", e.target.value === "Sim")}
                className={inputClass()}
              >
                <option>Não</option>
                <option>Sim</option>
              </select>
            </Field>

            <div className="md:col-span-2">
              <Field label="Descrição da avaria">
                <input
                  value={form.descricao_avaria}
                  onChange={(e) => update("descricao_avaria", e.target.value)}
                  className={inputClass()}
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Acessórios recebidos">
                <textarea
                  value={form.acessorios_recebidos}
                  onChange={(e) => update("acessorios_recebidos", e.target.value)}
                  rows={3}
                  className={inputClass()}
                />
              </Field>
            </div>

            <div className="md:col-span-2">
              <Field label="Observações da logística">
                <textarea
                  value={form.observacoes_logistica}
                  onChange={(e) => update("observacoes_logistica", e.target.value)}
                  rows={3}
                  className={inputClass()}
                />
              </Field>
            </div>
          </div>
        </SectionCard>

        {status ? (
          <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button primary type="submit" disabled={saving || !canSave}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar OS"}
          </Button>

          <Button type="button" onClick={resetForm}>
            <RotateCcw className="h-4 w-4" />
            Limpar formulário
          </Button>
        </div>
      </form>
    </div>
  );
}