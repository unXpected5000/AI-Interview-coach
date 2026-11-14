import test from "node:test";
import assert from "node:assert/strict";

import { RESUME_TYPES, ROLE_SUGGESTIONS, TEMPLATES, orderedSections, parseEntries, resumeToForm } from "../src/utils/resumeContent.js";

const parsed = {
  extracted_skills: ["SolidWorks", "MATLAB"],
  structured_resume: {
    experience: [
      { title: "Team Lead", company: "UC Davis AeroBrick", dates: "Sep 2025 - Present", location: "Davis, CA", kind: "work",
        highlights: ["Led a team of 8 through the design process.", "Prototyped components in AutoCAD."] },
      { title: "Undergraduate Researcher", company: "Chemical Engineering Lab", dates: "2023 - Present", kind: "research", highlights: ["Improved SNR by 89%."] },
    ],
    projects: [{ name: "Smart Irrigation", technologies: ["Arduino"], highlights: ["Built a soil moisture controller."] }],
    education: [{ degree: "B.E. Mechanical", institution: "University of Mumbai", year: "2027", score: "CGPA: 8.4/10", details: [] }],
    skills: ["SolidWorks", "ANSYS"],
    achievements: ["Dean's list 2024"],
  },
};

test("parsed resume becomes editable entries with bullets", () => {
  const form = resumeToForm(parsed);
  assert.match(form.experience, /^Team Lead \| UC Davis AeroBrick \| Sep 2025 - Present \| Davis, CA\n- Led a team of 8/);
  assert.match(form.experience, /Undergraduate Researcher/);
  assert.match(form.projects, /Smart Irrigation \| Arduino/);
  assert.match(form.education, /B\.E\. Mechanical \| University of Mumbai \| 2027 \| CGPA: 8\.4\/10/);
  assert.equal(form.achievements, "- Dean's list 2024");
  assert.deepEqual(form.skills.split(", "), ["SolidWorks", "ANSYS", "MATLAB"]);
});

test("entries parse back into title, meta and bullets", () => {
  const [lead, research] = parseEntries(resumeToForm(parsed).experience);
  assert.equal(lead.title, "Team Lead");
  assert.deepEqual(lead.meta, ["UC Davis AeroBrick", "Sep 2025 - Present", "Davis, CA"]);
  assert.equal(lead.bullets.length, 2);
  assert.equal(research.bullets[0], "Improved SNR by 89%.");
  assert.deepEqual(parseEntries("  \n\n "), []);
});

test("resume types reorder sections and skip empty ones", () => {
  const form = resumeToForm(parsed);
  assert.deepEqual(orderedSections(form, "fresher").slice(0, 2), ["education", "projects"]);
  assert.deepEqual(orderedSections(form, "technical").slice(0, 2), ["skills", "projects"]);
  assert.equal(orderedSections(form, "experienced")[0], "experience");
  assert.ok(!orderedSections(form, "fresher").includes("internships"));
  for (const type of RESUME_TYPES) assert.equal(new Set(type.order).size, type.order.length);
});

test("templates and role suggestions cover every department", () => {
  assert.ok(TEMPLATES.length >= 8);
  assert.ok(TEMPLATES.some((template) => template.id === "ats" && template.columns === 1));
  for (const department of ["AI and DS", "Comps", "IT", "Mechatronics", "ELX", "EXTC", "Mech", "Civil"]) {
    assert.ok(ROLE_SUGGESTIONS[department]?.length >= 3, department);
  }
});
