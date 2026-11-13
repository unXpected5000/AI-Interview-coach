import { useEffect, useState } from "react";

import { getProfileOptions } from "../../api/userApi.js";

const inputClass = "mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-950 outline-none focus:border-gray-950 disabled:bg-gray-100 disabled:text-gray-500";

export function useProfileOptions() {
  const [options, setOptions] = useState({ departments: [], max_year: 5 });
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getProfileOptions()
      .then((data) => { if (active) setOptions(data); })
      .catch(() => { if (active) setError("Department list could not load. Refresh to try again."); });
    return () => { active = false; };
  }, []);
  return { options, error };
}

// Department, year, and phone inputs shared by registration, profile completion,
// and staff edit forms. `lockDepartment` keeps HODs inside their department.
export default function ProfileFields({ value, onChange, options, showYear = true, lockDepartment = false, required = true }) {
  const years = Array.from({ length: options.max_year || 5 }, (_, index) => index + 1);
  const update = (field) => (event) => onChange({ ...value, [field]: event.target.value });
  return (
    <>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Department</span>
        <select className={inputClass} disabled={lockDepartment} name="department" onChange={update("department")} required={required} value={value.department ?? ""}>
          <option value="">Select a department</option>
          {options.departments.map((department) => <option key={department} value={department}>{department}</option>)}
        </select>
      </label>
      {showYear ? (
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Year of study</span>
          <select className={inputClass} name="year" onChange={update("year")} required={required} value={value.year ?? ""}>
            <option value="">Select a year</option>
            {years.map((year) => <option key={year} value={year}>Year {year}</option>)}
          </select>
        </label>
      ) : null}
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Phone (optional)</span>
        <input autoComplete="tel" className={inputClass} maxLength={32} name="phone" onChange={update("phone")} type="tel" value={value.phone ?? ""} />
      </label>
    </>
  );
}

export function profilePayload(value, { includeYear = true } = {}) {
  const payload = { department: value.department || null, phone: value.phone?.trim() ? value.phone.trim() : null };
  if (includeYear) payload.year = value.year ? Number(value.year) : null;
  return payload;
}
