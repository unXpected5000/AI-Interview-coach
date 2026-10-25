import { useState } from "react";

import { exportInterview } from "../../api/interviewApi.js";

const EXPORTS = [
  ["pdf", "Download PDF"],
  ["json", "Download JSON"],
  ["transcript", "Download transcript"],
];

export default function ExportButtons({ interviewId }) {
  const [activeFormat, setActiveFormat] = useState("");
  const [error, setError] = useState("");

  async function handleExport(format) {
    setActiveFormat(format);
    setError("");
    try {
      const response = await exportInterview(interviewId, format);
      const contentType = response.headers["content-type"] || "application/octet-stream";
      const extension = format === "transcript" ? "txt" : format;
      const filename = `interview-${interviewId}-${format}.${extension}`;
      const blobUrl = URL.createObjectURL(new Blob([response.data], { type: contentType }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (requestError) {
      setError(requestError.response?.data?.detail ?? "The file could not be downloaded.");
    } finally {
      setActiveFormat("");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {EXPORTS.map(([format, label]) => (
          <button
            className="inline-flex rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-800 disabled:opacity-50"
            disabled={Boolean(activeFormat)}
            key={format}
            onClick={() => handleExport(format)}
            type="button"
          >
            {activeFormat === format ? "Preparing…" : label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
