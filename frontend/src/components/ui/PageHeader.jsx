export default function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-teal-700">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-stone-950">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-stone-600">{description}</p>
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
