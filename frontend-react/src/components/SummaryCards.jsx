export default function SummaryCards({ cards = [] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]"
        >
          <div className="text-sm text-slate-500">{card.label}</div>
          <div className={`mt-1 text-2xl font-black ${card.valueClassName || "text-[#6B1F87]"}`}>
            {card.value}
          </div>
          {card.helper ? <div className="mt-1 text-xs text-slate-500">{card.helper}</div> : null}
        </div>
      ))}
    </div>
  );
}