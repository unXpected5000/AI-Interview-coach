import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";

export default function ReportSection({ title, content }) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition-all">
      <button
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
        <div className="border-t border-stone-200 px-6 py-5">
          {Array.isArray(content) ? (
            <ul className="space-y-2 text-sm leading-6 text-stone-700 list-disc pl-5">
              {content.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : (
            <div className="text-sm leading-6 text-stone-700">{content}</div>
          )}
        </div>
      )}
    </div>
  );
}
