import { Link } from "react-router-dom";

export default function Breadcrumbs({ items = [] }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="flex items-center gap-2">
          {item.to ? (
            <Link to={item.to} className="font-medium text-[#6B1F87] hover:underline">
              {item.label}
            </Link>
          ) : (
            <span className="font-medium text-slate-700">{item.label}</span>
          )}
          {index < items.length - 1 ? <span>/</span> : null}
        </div>
      ))}
    </div>
  );
}