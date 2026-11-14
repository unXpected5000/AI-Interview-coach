// Shared resume-builder and optimiser data: role suggestions per department,
// resume types (section order), templates, and conversion from parsed resume
// data into editable text. Pure so it can be unit-tested.

export const ROLE_SUGGESTIONS = {
  "AI and DS": ["Data Analyst", "Machine Learning Engineer", "Data Scientist (Fresher)", "AI Engineer Intern"],
  Comps: ["Software Engineer", "Full Stack Developer", "Backend Developer", "SDE Intern"],
  IT: ["Software Developer", "Cloud Support Engineer", "Network Engineer", "QA / Test Engineer"],
  Mechatronics: ["Automation Engineer", "Robotics Engineer", "Embedded Systems Engineer", "Controls Engineer Trainee"],
  ELX: ["Embedded Engineer", "Hardware Design Engineer", "VLSI Design Trainee", "Electronics Test Engineer"],
  EXTC: ["Telecom Engineer", "RF Engineer Trainee", "Embedded Engineer", "Network Engineer"],
  Mech: ["Design Engineer", "Production Engineer", "Quality Engineer", "Graduate Engineer Trainee"],
  Civil: ["Site Engineer", "Structural Design Engineer", "Quantity Surveyor", "Planning Engineer Trainee"],
  default: ["Software Engineer", "Data Analyst", "Design Engineer", "Graduate Engineer Trainee"],
};

export const SCORE_CATEGORIES = [
  ["ats_score", "Keyword match"],
  ["impact_statements", "Impact of bullet points"],
  ["experience_strength", "Experience"],
  ["project_quality", "Projects"],
  ["technical_depth", "Technical depth"],
  ["resume_structure", "Structure and contact"],
];

/** Resume types decide which sections come first. */
export const RESUME_TYPES = [
  { id: "fresher", name: "Fresher / student", description: "Education and projects first, for internships and first jobs.",
    order: ["summary", "education", "projects", "internships", "experience", "skills", "achievements", "certifications", "activities"] },
  { id: "technical", name: "Technical / software", description: "Skills and projects up front for engineering roles.",
    order: ["summary", "skills", "projects", "experience", "internships", "education", "achievements", "certifications", "activities"] },
  { id: "experienced", name: "Experienced", description: "Work history leads; for candidates with internships or jobs.",
    order: ["summary", "experience", "internships", "projects", "skills", "education", "certifications", "achievements", "activities"] },
  { id: "core", name: "Core engineering", description: "Mech, Civil, ELX: tools, projects and internships emphasised.",
    order: ["summary", "education", "internships", "projects", "skills", "certifications", "experience", "achievements", "activities"] },
  { id: "research", name: "Academic / research", description: "Education, research and publications for higher studies.",
    order: ["summary", "education", "experience", "projects", "achievements", "skills", "certifications", "activities", "internships"] },
];

export const SECTION_LABELS = {
  summary: "Summary",
  education: "Education",
  experience: "Experience",
  internships: "Internships",
  projects: "Projects",
  skills: "Skills",
  achievements: "Achievements",
  certifications: "Certifications",
  activities: "Leadership and activities",
};

/** Visual templates. `columns: 2` puts skills, education and extras in a sidebar. */
export const TEMPLATES = [
  { id: "modern", name: "Modern", description: "Teal accent, clean sans-serif", columns: 1, font: "sans", accent: "#0f766e", heading: "rule" },
  { id: "classic", name: "Classic", description: "Serif, traditional and formal", columns: 1, font: "serif", accent: "#1f2937", heading: "caps" },
  { id: "ats", name: "ATS plain", description: "No colour or columns; safest for applicant tracking systems", columns: 1, font: "sans", accent: "#111827", heading: "plain" },
  { id: "compact", name: "Compact", description: "Dense spacing to fit more on one page", columns: 1, font: "sans", accent: "#334155", heading: "rule", dense: true },
  { id: "sidebar", name: "Two-column", description: "Sidebar for skills and education", columns: 2, font: "sans", accent: "#1d4ed8", heading: "rule" },
  { id: "executive", name: "Executive", description: "Centred name, strong headings", columns: 1, font: "serif", accent: "#7c2d12", heading: "band", centered: true },
  { id: "creative", name: "Creative", description: "Colour header band for design or product roles", columns: 2, font: "sans", accent: "#7c3aed", heading: "band", banner: true },
  { id: "minimal", name: "Minimal", description: "Lots of white space, light headings", columns: 1, font: "sans", accent: "#6b7280", heading: "light" },
];

export const SIDEBAR_SECTIONS = new Set(["skills", "education", "certifications", "achievements", "activities"]);

function entryText(header, bullets) {
  return [header.filter(Boolean).join(" | "), ...bullets.filter(Boolean).map((bullet) => `- ${bullet}`)].join("\n");
}

/** Convert a parsed resume into editable text, one entry per block. */
export function resumeToForm(resume) {
  const data = resume?.structured_resume ?? {};
  const roles = (items) => (items ?? []).map((item) => entryText(
    [item.title ?? item.role, item.company, item.dates, item.location],
    item.highlights?.length ? item.highlights : [item.description],
  )).join("\n\n");
  const projects = (data.projects ?? []).map((item) => entryText(
    [item.name, item.technologies?.length ? item.technologies.join(", ") : "", item.dates],
    item.highlights?.length ? item.highlights : [item.description],
  )).join("\n\n");
  const education = (data.education ?? []).map((item) => entryText(
    [item.degree || item.text, item.institution, item.year, item.score],
    item.details ?? [],
  )).join("\n\n");
  const research = (data.experience ?? []).filter((item) => item.kind === "research");
  const work = (data.experience ?? []).filter((item) => item.kind !== "research");
  const list = (items) => (items ?? []).map((item) => `- ${item}`).join("\n");
  return {
    fullName: data.name ?? "",
    email: data.email ?? "",
    phone: data.phone ?? "",
    location: data.location ?? "",
    links: "",
    summary: (data.summary_lines ?? []).join(" "),
    skills: [...new Set([...(data.skills ?? []), ...(data.tools ?? []), ...(resume?.extracted_skills ?? [])])].join(", "),
    experience: [roles(work), roles(research)].filter(Boolean).join("\n\n"),
    internships: roles(data.internships),
    projects,
    education,
    achievements: list(data.achievements),
    certifications: list(data.certifications),
    activities: list(data.activities),
  };
}

/**
 * Parse an editable section into entries: blank lines separate entries, the
 * first line is a heading ("Role | Company | Dates"), lines starting with "-"
 * or "•" are bullets.
 */
export function parseEntries(text) {
  return String(text ?? "")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean))
    .filter((lines) => lines.length)
    .map((lines) => {
      const isBullet = (line) => /^[-•*]\s+/.test(line);
      const headingLines = lines.filter((line) => !isBullet(line));
      const bullets = lines.filter(isBullet).map((line) => line.replace(/^[-•*]\s+/, ""));
      const [title = "", ...meta] = (headingLines[0] ?? "").split("|").map((part) => part.trim()).filter(Boolean);
      return { title, meta, extra: headingLines.slice(1), bullets };
    });
}

export function orderedSections(form, typeId) {
  const type = RESUME_TYPES.find((item) => item.id === typeId) ?? RESUME_TYPES[0];
  return type.order.filter((key) => String(form[key] ?? "").trim());
}

export const DRAFT_KEY = "ai-interview-coach-resume-draft";
