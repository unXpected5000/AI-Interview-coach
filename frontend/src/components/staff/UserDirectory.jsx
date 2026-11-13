import { useCallback, useEffect, useState } from "react";

import { ROLE_LABELS } from "../../auth/roleAccess.js";
import { useProfileOptions } from "../auth/ProfileFields.jsx";
import { getErrorMessage } from "../../utils/errorMessage.js";

const PAGE_SIZE = 25;
const inputClass = "rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function score(value) {
  return typeof value === "number" ? `${Math.round(value)}/100` : "—";
}

/**
 * Shared list/detail screen for HOD and operator user management.
 * `mode` is "department" (HOD) or "admin" (operator); the API enforces scope.
 */
export default function UserDirectory({ mode, api }) {
  const isAdmin = mode === "admin";
  const { options } = useProfileOptions();
  const [filters, setFilters] = useState({ q: "", role: "", department: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ users: [], total: 0 });
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [roleForm, setRoleForm] = useState({ role: "student", department: "" });
  const [status, setStatus] = useState({ loading: true, error: "", message: "" });

  const load = useCallback(async () => {
    setStatus((current) => ({ ...current, loading: true, error: "" }));
    try {
      const params = { page, page_size: PAGE_SIZE };
      if (filters.q.trim()) params.q = filters.q.trim();
      if (isAdmin && filters.role) params.role = filters.role;
      if (isAdmin && filters.department) params.department = filters.department;
      setData(await api.list(params));
      setStatus((current) => ({ ...current, loading: false }));
    } catch (requestError) {
      setStatus({ loading: false, error: getErrorMessage(requestError, "Could not load users."), message: "" });
    }
  }, [api, filters, isAdmin, page]);

  useEffect(() => { load(); }, [load]);

  async function openUser(userId, { keepMessage = false } = {}) {
    setSelectedId(userId);
    if (!keepMessage) {
      setDetail(null);
      setStatus((current) => ({ ...current, error: "", message: "" }));
    }
    try {
      const result = await api.detail(userId);
      setDetail(result);
      const student = result.student;
      setForm({ name: student.name, phone: student.phone ?? "", department: student.department ?? "", year: student.year ?? "" });
      setRoleForm({ role: student.role, department: student.department ?? "" });
    } catch (requestError) {
      setStatus((current) => ({ ...current, error: getErrorMessage(requestError, "Could not load this user.") }));
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    const payload = { name: form.name, phone: form.phone.trim() || null };
    if (isAdmin && form.department) payload.department = form.department;
    if (form.year) payload.year = Number(form.year);
    try {
      await api.update(selectedId, payload);
      await Promise.all([load(), openUser(selectedId, { keepMessage: true })]);
      setStatus((current) => ({ ...current, error: "", message: "Profile saved." }));
    } catch (requestError) {
      setStatus((current) => ({ ...current, message: "", error: getErrorMessage(requestError, "Could not save changes.") }));
    }
  }

  async function saveRole(event) {
    event.preventDefault();
    try {
      await api.setRole(selectedId, roleForm.role, roleForm.department);
      await Promise.all([load(), openUser(selectedId, { keepMessage: true })]);
      setStatus((current) => ({ ...current, error: "", message: "Role updated." }));
    } catch (requestError) {
      setStatus((current) => ({ ...current, message: "", error: getErrorMessage(requestError, "Could not change the role.") }));
    }
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const selected = detail?.student;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <form className="flex flex-wrap gap-3" onSubmit={(event) => { event.preventDefault(); setPage(1); load(); }}>
          <input aria-label="Search by name or email" className={`${inputClass} min-w-48 flex-1`} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Search name or email" value={filters.q} />
          {isAdmin ? (
            <>
              <select aria-label="Filter by role" className={inputClass} onChange={(event) => { setPage(1); setFilters({ ...filters, role: event.target.value }); }} value={filters.role}>
                <option value="">All roles</option>
                {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <select aria-label="Filter by department" className={inputClass} onChange={(event) => { setPage(1); setFilters({ ...filters, department: event.target.value }); }} value={filters.department}>
                <option value="">All departments</option>
                {options.departments.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </>
          ) : null}
          <button className="rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white" type="submit">Search</button>
        </form>

        {status.error ? <p className="mt-4 text-sm text-red-600" role="alert">{status.error}</p> : null}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <tr><th className="py-2 pr-3">Name</th>{isAdmin ? <th className="pr-3">Role</th> : null}<th className="pr-3">Department</th><th className="pr-3">Year</th><th className="pr-3">Interviews</th><th className="pr-3">Average</th><th className="pr-3">Last activity</th></tr>
            </thead>
            <tbody>
              {data.users.map((user) => (
                <tr className={`cursor-pointer border-b border-stone-100 hover:bg-stone-50 ${user.id === selectedId ? "bg-teal-50" : ""}`} key={user.id} onClick={() => openUser(user.id)}>
                  <td className="py-2 pr-3"><button className="text-left font-semibold text-stone-900 underline-offset-2 hover:underline" type="button">{user.name}</button><span className="block text-xs text-stone-500">{user.email}{user.email_verified ? "" : " · unverified"}</span></td>
                  {isAdmin ? <td className="pr-3">{ROLE_LABELS[user.role]}</td> : null}
                  <td className="pr-3">{user.department ?? "—"}</td>
                  <td className="pr-3">{user.year ?? "—"}</td>
                  <td className="pr-3">{user.progress ? `${user.progress.interviews_completed}/${user.progress.interviews_started}` : "—"}</td>
                  <td className="pr-3">{score(user.progress?.average_score)}</td>
                  <td className="pr-3">{formatDate(user.progress?.last_activity_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!status.loading && data.users.length === 0 ? <p className="py-6 text-center text-sm text-stone-500">No users match these filters.</p> : null}
          {status.loading ? <p className="py-6 text-center text-sm text-stone-500">Loading…</p> : null}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm text-stone-600">
          <span>{data.total} user(s)</span>
          <div className="flex gap-2">
            <button className="rounded border border-stone-300 px-3 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">Previous</button>
            <span className="px-2 py-1">Page {page} of {totalPages}</span>
            <button className="rounded border border-stone-300 px-3 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage(page + 1)} type="button">Next</button>
          </div>
        </div>
      </section>

      <aside className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm" aria-live="polite">
        {!selected ? <p className="text-sm text-stone-500">Select a user to view progress and edit profile details.</p> : (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-bold text-stone-950">{selected.name}</h2>
              <p className="text-sm text-stone-600">{selected.email} · {ROLE_LABELS[selected.role]}</p>
            </div>
            {status.message ? <p className="rounded-md bg-teal-50 p-2 text-sm text-teal-900" role="status">{status.message}</p> : null}

            {selected.role === "student" ? (
              <div>
                <h3 className="text-sm font-bold text-stone-900">Practice progress</h3>
                <p className="mt-1 text-xs text-stone-500">Summary scores only. Resumes, answers, and transcripts are not shown.</p>
                <ul className="mt-2 divide-y divide-stone-100 text-sm">
                  {detail.interviews.length === 0 ? <li className="py-2 text-stone-500">No interviews yet.</li> : detail.interviews.map((interview) => (
                    <li className="flex flex-wrap justify-between gap-2 py-2" key={interview.id}>
                      <span>{formatDate(interview.created_at)} · {interview.difficulty?.initial ?? "medium"} / {interview.difficulty?.mode ?? "adaptive"}</span>
                      <span className="font-semibold">{interview.status === "completed" ? `${score(interview.performance_score)} · ${interview.readiness_category}` : "In progress"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <form className="space-y-3" onSubmit={saveProfile}>
              <h3 className="text-sm font-bold text-stone-900">Profile details</h3>
              <label className="block text-sm">Name<input className={`${inputClass} mt-1 w-full`} minLength={2} onChange={(event) => setForm({ ...form, name: event.target.value })} required value={form.name} /></label>
              <label className="block text-sm">Phone<input className={`${inputClass} mt-1 w-full`} onChange={(event) => setForm({ ...form, phone: event.target.value })} type="tel" value={form.phone} /></label>
              <label className="block text-sm">Department
                <select className={`${inputClass} mt-1 w-full disabled:bg-stone-100`} disabled={!isAdmin} onChange={(event) => setForm({ ...form, department: event.target.value })} value={form.department}>
                  <option value="">—</option>
                  {options.departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                {!isAdmin ? <span className="mt-1 block text-xs text-stone-500">Only an operator can move a student to another department.</span> : null}
              </label>
              {selected.role === "student" ? (
                <label className="block text-sm">Year
                  <select className={`${inputClass} mt-1 w-full`} onChange={(event) => setForm({ ...form, year: event.target.value })} value={form.year}>
                    <option value="">—</option>
                    {Array.from({ length: options.max_year || 5 }, (_, index) => index + 1).map((year) => <option key={year} value={year}>Year {year}</option>)}
                  </select>
                </label>
              ) : null}
              <button className="rounded-full bg-stone-950 px-4 py-2 text-sm font-bold text-white" type="submit">Save profile</button>
            </form>

            {isAdmin ? (
              <form className="space-y-3 border-t border-stone-200 pt-4" onSubmit={saveRole}>
                <h3 className="text-sm font-bold text-stone-900">Role</h3>
                <select aria-label="Role" className={`${inputClass} w-full`} onChange={(event) => setRoleForm({ ...roleForm, role: event.target.value })} value={roleForm.role}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                {roleForm.role === "department_faculty" ? (
                  <select aria-label="HOD department" className={`${inputClass} w-full`} onChange={(event) => setRoleForm({ ...roleForm, department: event.target.value })} required value={roleForm.department}>
                    <option value="">Select the HOD's department</option>
                    {options.departments.map((department) => <option key={department} value={department}>{department}</option>)}
                  </select>
                ) : null}
                <p className="text-xs text-stone-500">Roles can be assigned only to verified accounts. You cannot change your own role.</p>
                <button className="rounded-full border border-stone-950 px-4 py-2 text-sm font-bold text-stone-950" type="submit">Update role</button>
              </form>
            ) : null}
          </div>
        )}
      </aside>
    </div>
  );
}
