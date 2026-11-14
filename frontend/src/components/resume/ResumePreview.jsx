import { SECTION_LABELS, SIDEBAR_SECTIONS, parseEntries } from "../../utils/resumeContent.js";

function SectionHeading({ template, children }) {
  const accent = { color: template.accent, borderColor: template.accent };
  if (template.heading === "band") {
    return <h2 className="mb-2 px-2 py-1 text-xs font-bold uppercase tracking-widest text-white" style={{ background: template.accent }}>{children}</h2>;
  }
  if (template.heading === "plain") return <h2 className="mb-1 text-sm font-bold uppercase text-black">{children}</h2>;
  if (template.heading === "light") return <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.3em]" style={{ color: template.accent }}>{children}</h2>;
  if (template.heading === "caps") return <h2 className="mb-2 border-b pb-1 text-sm font-bold uppercase tracking-wider" style={accent}>{children}</h2>;
  return <h2 className="mb-2 border-b-2 pb-1 text-xs font-black uppercase tracking-widest" style={accent}>{children}</h2>;
}

function Section({ name, text, template, compact }) {
  const plainList = name === "skills" || name === "summary";
  return (
    <section className={`${compact ? "mt-3" : "mt-5"} break-inside-avoid`}>
      <SectionHeading template={template}>{SECTION_LABELS[name]}</SectionHeading>
      {plainList ? (
        <p className="text-[13px] leading-6 text-stone-800">{text}</p>
      ) : (
        <div className={compact ? "space-y-2" : "space-y-3"}>
          {parseEntries(text).map((entry, index) => (
            <div className="break-inside-avoid" key={`${entry.title}-${index}`}>
              {entry.title ? (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[13px] font-bold text-stone-900">{entry.title}{entry.meta[0] ? <span className="font-normal text-stone-700">, {entry.meta[0]}</span> : null}</p>
                  {entry.meta.length > 1 ? <p className="text-[12px] text-stone-600">{entry.meta.slice(1).join(" · ")}</p> : null}
                </div>
              ) : null}
              {entry.extra.map((line) => <p className="text-[12px] text-stone-700" key={line}>{line}</p>)}
              {entry.bullets.length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] leading-5 text-stone-800">
                  {entry.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A4-proportioned resume preview; also what gets printed. */
export default function ResumePreview({ form, template, sections }) {
  const contact = [form.email, form.phone, form.location, ...String(form.links ?? "").split(/[,\n]/)].map((item) => item?.trim()).filter(Boolean);
  const fontClass = template.font === "serif" ? "font-serif" : "font-sans";
  const twoColumn = template.columns === 2;
  const main = twoColumn ? sections.filter((name) => !SIDEBAR_SECTIONS.has(name)) : sections;
  const side = twoColumn ? sections.filter((name) => SIDEBAR_SECTIONS.has(name)) : [];
  const header = (
    <header
      className={`${template.banner ? "-mx-8 -mt-8 mb-2 px-8 py-6 text-white sm:-mx-12 sm:-mt-12 sm:px-12" : "pb-3"} ${template.centered ? "text-center" : ""}`}
      style={template.banner ? { background: template.accent } : { borderBottom: template.heading === "plain" || template.heading === "light" ? "none" : `2px solid ${template.accent}` }}
    >
      <p className={`text-3xl font-black tracking-tight ${template.banner ? "text-white" : "text-stone-950"}`}>{form.fullName || "Your Name"}</p>
      <p className={`mt-1 text-[12.5px] ${template.banner ? "text-white/90" : "text-stone-600"}`}>{contact.join("  ·  ") || "email · phone · city · linkedin.com/in/you"}</p>
    </header>
  );
  return (
    <article className={`resume-print mx-auto w-full max-w-[210mm] bg-white p-8 text-stone-900 shadow-lg sm:p-12 ${fontClass}`} style={{ minHeight: "297mm" }}>
      {header}
      {!sections.length ? <p className="mt-8 text-sm text-stone-400">Your resume preview will appear here as you add details.</p> : null}
      {twoColumn ? (
        <div className="mt-2 grid gap-6 sm:grid-cols-[1fr_2fr] print:grid-cols-[1fr_2fr]">
          <div>{side.map((name) => <Section compact key={name} name={name} template={template} text={form[name]} />)}</div>
          <div>{main.map((name) => <Section compact={template.dense} key={name} name={name} template={template} text={form[name]} />)}</div>
        </div>
      ) : (
        main.map((name) => <Section compact={template.dense} key={name} name={name} template={template} text={form[name]} />)
      )}
    </article>
  );
}
