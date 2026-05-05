const MONTH_OPTIONS = [
  { value: "", label: "Todos os meses" },
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const WEEK_OPTIONS = [
  { value: "", label: "Todas as semanas" },
  ...Array.from({ length: 53 }, (_, index) => ({
    value: String(index + 1),
    label: `Semana ${index + 1}`,
  })),
];

export default function TopFilters({
  filters,
  onChange,
  onApply,
  onClear,
  suppliers = [],
  years = [],
  loading = false,
}) {
  function updateField(field, value) {
    onChange({
      ...filters,
      [field]: value,
    });
  }

  return (
    <div className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <select
          value={filters.fornecedor}
          onChange={(e) => updateField("fornecedor", e.target.value)}
          className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
        >
          <option value="">Todos os fornecedores</option>
          {suppliers.map((supplier) => (
            <option key={supplier.normalized || supplier.value} value={supplier.value}>
              {supplier.label}
            </option>
          ))}
        </select>

        <select
          value={filters.ano}
          onChange={(e) => updateField("ano", e.target.value)}
          className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
        >
          <option value="">Todos os anos</option>
          {years.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>

        <select
          value={filters.mes}
          onChange={(e) => updateField("mes", e.target.value)}
          className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
        >
          {MONTH_OPTIONS.map((month) => (
            <option key={month.value || "all"} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>

        <select
          value={filters.semana}
          onChange={(e) => updateField("semana", e.target.value)}
          className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
        >
          {WEEK_OPTIONS.map((week) => (
            <option key={week.value || "all"} value={week.value}>
              {week.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.dataInicial}
          onChange={(e) => updateField("dataInicial", e.target.value)}
          className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
        />

        <input
          type="date"
          value={filters.dataFinal}
          onChange={(e) => updateField("dataFinal", e.target.value)}
          className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
        />
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={onClear}
          disabled={loading}
          className="rounded-2xl border border-[#E9D5FF] bg-white px-5 py-2.5 text-sm font-semibold text-[#6B1F87] disabled:opacity-50"
        >
          Limpar filtros
        </button>

        <button
          type="button"
          onClick={onApply}
          disabled={loading}
          className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "Atualizando..." : "Atualizar"}
        </button>
      </div>
    </div>
  );
}