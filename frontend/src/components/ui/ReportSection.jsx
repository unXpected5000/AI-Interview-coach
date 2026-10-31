import { useId, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

function ContentValue({ value }) {
  if (Array.isArray(value)) return <ul className="mt-1 list-disc space-y-1 pl-5">{value.length ? value.map((item, index) => <li key={index}><ContentValue value={item} /></li>) : <li>None recorded</li>}</ul>;
  if (value && typeof value === "object") return <dl className="mt-2 grid gap-2 sm:grid-cols-2">{Object.entries(value).map(([key, nested]) => <div className="rounded-md bg-stone-50 p-3" key={key}><dt className="text-xs font-semibold capitalize text-stone-600">{key.replaceAll("_", " ")}</dt><dd className="mt-1 text-sm text-stone-800"><ContentValue value={nested} /></dd></div>)}</dl>;
  if (value === null || value === undefined || value === "") return <span>—</span>;
  return <span>{String(value)}</span>;
}

export default function ReportSection({ title, content }) {
  const [isOpen, setIsOpen] = useState(true);
  const contentId = useId();

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition-all">
      <button
        aria-controls={contentId}
        aria-expanded={isOpen}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between bg-stone-50 px-6 py-4 text-left transition hover:bg-stone-100"
      >
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-900">{title}</h3>
        {isOpen ? (
          <ChevronUpIcon className="h-5 w-5 text-stone-500" />
        ) : (
          <ChevronDownIcon className="h-5 w-5 text-stone-500" />
        )}
      </button>
      
      {isOpen && (
        <div id={contentId} className="border-t border-stone-200 px-6 py-5">
          {Array.isArray(content) ? (
            <ul className="space-y-2 text-sm leading-6 text-stone-700 list-disc pl-5">
              {content.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm leading-6 text-stone-700"><ContentValue value={content} /></div>
          )}
        </div>
      )}
    </div>
  );
}
