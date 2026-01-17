import React, { useEffect, useMemo, useRef, useState } from "react";

import { apiGet, apiPost } from "../api";

const COURT_OPTIONS = ["North", "South", "Other"];

function Spinner({ className = "h-4 w-4" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden="true"
    />
  );
}

export default function AdminPanel({ role, editReservation, onSaveSuccess }) {
  const isAdmin = role?.toLowerCase() === "admin";
  const isMemberPlus = role?.toLowerCase() === "memberplus";

  // Form state for Proposed Dates (Issue #31)
  const [reservations, setReservations] = useState([]);
  const [form, setForm] = useState({
    Id: "",
    Date: "",
    Start: "",
    End: "",
    Court: "North",
    Capacity: 8,
    BaseFee: 5,
    Status: "reserved",
    Visibility: "member",
    VisibleToUserIds: "",
    VisibleToGroups: "", // ✅ add
  });

  // For "Other" court text entry (kept separate so we can still store final value in form.Court)
  const [courtOther, setCourtOther] = useState("");

  const [fee, setFee] = useState({
    ReservationId: "",
    FeeName: "Dinner",
    Amount: 10,
  });
  const [loading, setLoading] = useState(false);

  // Reports
  const [reportMonth, setReportMonth] = useState(
    new Date().toISOString().substring(0, 7),
  ); // YYYY-MM
  const [reportData, setReportData] = useState([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Approvals
  const [approvals, setApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState("");

  const [preCancelStatus, setPreCancelStatus] = useState(null);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Shared UI classes (light + dark)
  const panelWrapClass =
    "mt-8 border rounded p-3 bg-gray-50 text-slate-900 border-slate-200 " +
    "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-700";

  const cardClass =
    "border rounded p-3 bg-white shadow-sm border-slate-200 " +
    "dark:bg-slate-800 dark:border-slate-700";

  const inputClass =
    "border rounded px-2 py-1 w-full bg-white text-slate-900 border-slate-300 placeholder:text-slate-400 " +
    "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-600 dark:placeholder:text-slate-500 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  const selectClass =
    "border rounded px-2 py-1 w-full bg-white text-slate-900 border-slate-300 " +
    "dark:bg-slate-900 dark:text-slate-100 dark:border-slate-600 " +
    "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  const labelClass = "block text-xs text-slate-500 dark:text-slate-400";

  const smallButtonClass =
    "text-xs border px-2 py-1 rounded bg-white text-slate-700 border-slate-300 hover:bg-slate-50 " +
    "dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-700";

  // When editReservation prop changes, pre-fill the form and scroll into view
  useEffect(() => {
    if (editReservation) {
      setForm({
        Id: editReservation.Id,
        Date: editReservation.Date,
        Start: editReservation.Start,
        End: editReservation.End,
        Court: COURT_OPTIONS.includes(editReservation.Court)
          ? editReservation.Court
          : "Other",
        Capacity: editReservation.Capacity || 8,
        BaseFee: editReservation.BaseFee || 5,
        Status: editReservation.Status || "reserved",
        Visibility: editReservation.Visibility || "member",
        VisibleToUserIds: editReservation.VisibleToUserIds || "",
        VisibleToGroups: editReservation.VisibleToGroups || "",
      });

      // ✅ PUT THIS RIGHT HERE
      const court = editReservation.Court || "";
      if (court && !COURT_OPTIONS.includes(court)) setCourtOther(court);
      else setCourtOther("");

      // Scroll to the admin panel form
      document
        .getElementById("admin-reservation-form")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  }, [editReservation]);

  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  function resetForm() {
    setForm({
      Id: "",
      Date: "",
      Start: "",
      End: "",
      Court: "North",
      Capacity: 8,
      BaseFee: 5,
      Status: "reserved",
      Visibility: "member",
      VisibleToUserIds: "",
      VisibleToGroups: "",
    });
    setCourtOther("");
    setPreCancelStatus(null);
  }

  function onClickCancelUpdates() {
    if (loading) return;
    setShowCancelConfirm(true);
  }

  function confirmCancelUpdates() {
    resetForm();
    setShowCancelConfirm(false);
  }

  function dismissCancelUpdates() {
    setShowCancelConfirm(false);
  }

  async function load() {
    setLoading(true);
    try {
      const r = await apiGet({ action: "listreservations" });
      if (mounted && r.ok) setReservations(r.reservations);
      await loadApprovals();
    } catch (e) {
      console.error(e);
    } finally {
      if (mounted) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showCancelConfirm) return;

    function onKeyDown(e) {
      if (e.key === "Escape") dismissCancelUpdates();

      if (e.key === "Enter") {
        const tag = (document.activeElement?.tagName || "").toLowerCase();
        const isTyping =
          tag === "input" || tag === "textarea" || tag === "select";
        if (!isTyping) confirmCancelUpdates();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showCancelConfirm]);

  async function loadApprovals() {
    setApprovalsLoading(true);
    setApprovalsError("");
    try {
      const r = await apiGet({ action: "listapprovals" });
      if (r.ok) {
        setApprovals(r.requests);
      } else {
        setApprovalsError(r.error || "Failed to load approvals");
      }
    } catch (e) {
      console.error(e);
      setApprovalsError(e.message);
    }
    setApprovalsLoading(false);
  }

  async function approveGuest(requestId) {
    if (!confirm("Are you sure you want to approve this guest?")) return;
    try {
      const r = await apiPost("approveguest", { requestId });
      if (r.ok) {
        alert("Guest approved!");
        loadApprovals();
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  async function loadReport() {
    if (!reportMonth) return;
    setReportLoading(true);
    try {
      const r = await apiGet({ action: "listattendance", month: reportMonth });
      if (r.ok) setReportData(r.attendees);
    } catch (e) {
      console.error(e);
    }
    setReportLoading(false);
  }

  async function saveReservation() {
    if (!form.Date || !form.Start || !form.End) {
      alert("Missing fields");
      return;
    }

    let payload = { ...form };
    if (payload.Court === "Other") {
      const typed = (courtOther || "").trim();
      if (!typed) return alert('Please enter a court name for "Other".');
      payload.Court = typed;
    }

    setLoading(true);
    try {
      const r = await apiPost("upsertreservation", payload);
      if (r.ok) {
        resetForm();
        load();
        if (onSaveSuccess) onSaveSuccess();
        alert(form.Id ? "Saved!" : "Session Created!");
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function addFee() {
    if (!fee.ReservationId) return;
    try {
      const r = await apiPost("addfee", fee);
      if (r.ok) {
        setFee({ ReservationId: "", FeeName: "Dinner", Amount: 10 });
        load();
        alert("Fee added!");
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
  }

  const reportStats = useMemo(() => {
    const totalPlayers = reportData.length;
    const uniquePlayers = new Set(reportData.map((r) => r.Player)).size;
    const totalCollected = reportData.reduce(
      (acc, r) => acc + (r.Charge || 0),
      0,
    );
    const unpaidCount = reportData.filter((r) => !r.PAID).length;
    return { totalPlayers, uniquePlayers, totalCollected, unpaidCount };
  }, [reportData]);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  };

  return (
    <div className={panelWrapClass}>
      <div className="flex justify-between items-center mb-3">
        <div className="font-semibold text-lg text-slate-900 dark:text-slate-100">
          Organizer Admin
        </div>
        <button
          onClick={load}
          disabled={loading}
          className={`${smallButtonClass} flex items-center gap-2 ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {loading && <Spinner className="h-3 w-3" />}
          Refresh Data
        </button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {/* Reservation Form */}
        <div id="admin-reservation-form" className={cardClass}>
          <div className="font-medium mb-2 text-blue-800 dark:text-blue-200">
            {isAdmin
              ? form.Id
                ? "Edit Session"
                : "Create Session"
              : "Propose a Session"}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass + " col-span-2"}
              placeholder="(optional) Id to update existing"
              value={form.Id || ""}
              onChange={(e) => setForm({ ...form, Id: e.target.value })}
            />

            <div className="col-span-2">
              <label className={labelClass}>Date</label>
              <input
                className={inputClass}
                type="date"
                value={form.Date}
                onChange={(e) => setForm({ ...form, Date: e.target.value })}
              />
            </div>

            <div>
              <label className={labelClass}>Start</label>
              <input
                className={inputClass}
                type="time"
                value={form.Start}
                onChange={(e) => setForm({ ...form, Start: e.target.value })}
              />
            </div>

            <div>
              <label className={labelClass}>End</label>
              <input
                className={inputClass}
                type="time"
                value={form.End}
                onChange={(e) => setForm({ ...form, End: e.target.value })}
              />
            </div>

            {isAdmin && (
              <>
                {/* ✅ Court dropdown + conditional "Other" input */}
                <div className="col-span-2">
                  <label className={labelClass}>Court</label>
                  <div className="flex gap-2">
                    <select
                      className={selectClass}
                      value={
                        COURT_OPTIONS.includes(form.Court)
                          ? form.Court
                          : "Other"
                      }
                      onChange={(e) => {
                        const next = e.target.value;
                        setForm({ ...form, Court: next });
                        if (next !== "Other") setCourtOther("");
                      }}
                    >
                      {COURT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>

                    {(() => {
                      const isOtherSelected =
                        form.Court === "Other" ||
                        (form.Court && !COURT_OPTIONS.includes(form.Court));
                      if (!isOtherSelected) return null;
                      const shownValue =
                        form.Court !== "Other" &&
                        !COURT_OPTIONS.includes(form.Court)
                          ? form.Court
                          : courtOther;
                      return (
                        <input
                          className={inputClass}
                          placeholder="Enter court name"
                          value={shownValue}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCourtOther(v);
                            setForm({ ...form, Court: "Other" });
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>

                <div>
                  <label className={labelClass}>Capacity</label>
                  <input
                    className={inputClass}
                    placeholder="Capacity"
                    type="number"
                    value={form.Capacity}
                    onChange={(e) =>
                      setForm({ ...form, Capacity: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="col-span-1">
                  <label className={labelClass}>Base Fee ($)</label>
                  <input
                    className={inputClass}
                    placeholder="BaseFee"
                    type="number"
                    value={form.BaseFee}
                    onChange={(e) =>
                      setForm({ ...form, BaseFee: Number(e.target.value) })
                    }
                  />
                </div>

                <div className="col-span-2">
                  <label className={labelClass}>Visibility</label>
                  <select
                    className={selectClass}
                    value={form.Visibility || "member"}
                    onChange={(e) =>
                      setForm({ ...form, Visibility: e.target.value })
                    }
                  >
                    <option value="admin">Admin only</option>
                    <option value="memberplus">MemberPLUS + Admin</option>
                    <option value="member">Members + MemberPLUS + Admin</option>
                    <option value="guest">Guests + Everyone</option>
                  </select>

                  <div className="mt-2">
                    <label className={labelClass}>
                      Allow specific users (optional) — comma-separated UserIds
                    </label>
                    <input
                      className={inputClass}
                      placeholder="Example: 3,8,10"
                      value={form.VisibleToUserIds || ""}
                      onChange={(e) =>
                        setForm({ ...form, VisibleToUserIds: e.target.value })
                      }
                    />

                    <div className="mt-2">
                      <label className={labelClass}>
                        Allow specific groups (optional) — comma-separated group
                        names
                      </label>
                      <input
                        className={inputClass}
                        placeholder="Example: A,B,WednesdayCrew"
                        value={form.VisibleToGroups || ""}
                        onChange={(e) =>
                          setForm({ ...form, VisibleToGroups: e.target.value })
                        }
                      />
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Users with a matching Users.Group can see this event
                        even if their role is too low.
                      </div>
                    </div>

                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      If someone’s role is too low, they can still see this
                      event if their UserId is listed here.
                    </div>
                  </div>
                </div>

                <div className="col-span-2">
                  <label className={labelClass}>Status</label>
                  <select
                    className={`border rounded px-2 py-1 w-full font-bold border-slate-300
                                          dark:border-slate-600 dark:bg-slate-900
                                          ${
                                            form.Status === "cancelled"
                                              ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                                              : form.Status === "proposed"
                                                ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
                                                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                          }`}
                    value={form.Status}
                    onChange={(e) =>
                      setForm({ ...form, Status: e.target.value })
                    }
                  >
                    <option value="reserved">✅ RESERVED (Confirmed)</option>
                    <option value="proposed">⏳ PROPOSED (Draft)</option>
                    <option value="cancelled">🚫 CANCELLED</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <button
                    type="button"
                    className={`w-full border rounded px-3 py-2 font-extrabold tracking-wide transition-colors ${
                      form.Status === "cancelled"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-rose-600 text-white hover:bg-rose-700"
                    }`}
                    onClick={() => {
                      if (form.Status === "cancelled") {
                        setForm({
                          ...form,
                          Status: preCancelStatus || "reserved",
                        });
                        setPreCancelStatus(null);
                      } else {
                        setPreCancelStatus(form.Status);
                        setForm({ ...form, Status: "cancelled" });
                      }
                    }}
                  >
                    {form.Status === "cancelled"
                      ? "RESUME Event"
                      : "CANCEL Event"}
                  </button>

                  {form.Status === "cancelled" && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Cancelled sessions are excluded from reports/charges.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3">
            <button
              disabled={loading}
              className={`border rounded px-3 py-1 w-full font-semibold transition-colors flex items-center justify-center gap-2 ${
                loading
                  ? "bg-slate-400 cursor-not-allowed"
                  : isAdmin
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-amber-500 text-white hover:bg-amber-600"
              }`}
              onClick={saveReservation}
            >
              {loading && <Spinner />}
              {isAdmin ? "Save Reservation" : "Submit Proposal"}
            </button>

            <button
              type="button"
              disabled={loading}
              className="border rounded px-3 py-1 w-full font-semibold bg-white text-slate-700 border-slate-300
             hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed
             dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
              onClick={onClickCancelUpdates}
            >
              {isAdmin ? "Cancel Updates" : "Cancel"}
            </button>
          </div>
        </div>

        {isAdmin && (
          <div className={cardClass}>
            <div className="font-medium mb-2 text-green-800 dark:text-emerald-300">
              Add Extra Fee (e.g., Dinner)
            </div>

            <div className="mb-2">
              <label className={labelClass}>Select Reservation</label>
              <select
                className={selectClass}
                value={fee.ReservationId}
                onChange={(e) =>
                  setFee({ ...fee, ReservationId: e.target.value })
                }
              >
                <option value="">Select reservation…</option>
                {reservations.map((r) => (
                  <option key={r.Id} value={r.Id}>
                    {r.Date} {r.Start}-{r.End} (Ct {r.Court})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className={labelClass}>Fee Name</label>
                <input
                  className={inputClass}
                  placeholder="Dinner"
                  value={fee.FeeName}
                  onChange={(e) => setFee({ ...fee, FeeName: e.target.value })}
                />
              </div>
              <div className="w-24">
                <label className={labelClass}>Amount ($)</label>
                <input
                  className={inputClass}
                  type="number"
                  step="0.01"
                  placeholder="10"
                  value={fee.Amount}
                  onChange={(e) =>
                    setFee({ ...fee, Amount: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <button
              className="border rounded px-3 py-1 mt-3 w-full bg-green-600 text-white font-semibold hover:bg-green-700"
              onClick={addFee}
            >
              Add Fee
            </button>

            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              <p>
                Use this to add shared costs like balls, lights, or post-game
                food to a specific session.
              </p>
            </div>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
              Monthly Report
            </h3>
            <div className="flex gap-2 items-center">
              <input
                type="month"
                className={inputClass}
                value={reportMonth}
                onChange={(e) => setReportMonth(e.target.value)}
              />
              <button
                onClick={loadReport}
                className="bg-gray-800 text-white px-3 py-1 rounded text-sm hover:bg-black
                                           dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                {reportLoading ? "Loading..." : "Load Report"}
              </button>
            </div>
          </div>

          {reportData.length > 0 && (
            <div
              className="bg-white p-4 rounded shadow-sm border border-slate-200
                                        dark:bg-slate-800 dark:border-slate-700"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-center">
                <div className="p-2 bg-blue-50 rounded dark:bg-blue-500/10">
                  <div className="text-xl font-bold text-blue-800 dark:text-blue-200">
                    {reportStats.uniquePlayers}
                  </div>
                  <div className="text-xs text-blue-600 dark:text-blue-300 uppercase">
                    Unique Players
                  </div>
                </div>
                <div className="p-2 bg-green-50 rounded dark:bg-emerald-500/10">
                  <div className="text-xl font-bold text-green-800 dark:text-emerald-200">
                    ${reportStats.totalCollected.toFixed(2)}
                  </div>
                  <div className="text-xs text-green-600 dark:text-emerald-300 uppercase">
                    Total Collected
                  </div>
                </div>
                <div className="p-2 bg-gray-50 rounded dark:bg-slate-700/40">
                  <div className="text-xl font-bold text-gray-800 dark:text-slate-100">
                    {reportStats.totalPlayers}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-slate-300 uppercase">
                    Check-ins
                  </div>
                </div>
                <div className="p-2 bg-red-50 rounded dark:bg-rose-500/10">
                  <div className="text-xl font-bold text-red-800 dark:text-rose-200">
                    {reportStats.unpaidCount}
                  </div>
                  <div className="text-xs text-red-600 dark:text-rose-300 uppercase">
                    Unpaid
                  </div>
                </div>
              </div>

              <div className="flex justify-end mb-2">
                <button
                  onClick={() =>
                    copyToClipboard(reportStats.totalCollected.toFixed(2))
                  }
                  className="text-xs text-blue-600 underline dark:text-blue-300"
                >
                  Copy Total ($)
                </button>
              </div>

              <div className="max-h-60 overflow-y-auto border rounded border-slate-200 dark:border-slate-700">
                <table className="w-full text-sm text-left text-slate-800 dark:text-slate-100">
                  <thead className="bg-slate-100 sticky top-0 dark:bg-slate-700/50">
                    <tr>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                        Date
                      </th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                        Player
                      </th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                        Charge
                      </th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                        Paid
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.map((row, i) => (
                      <tr
                        key={i}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                      >
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700">
                          {row.Date ? String(row.Date).split("T")[0] : ""}
                        </td>
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700">
                          {row.Player}
                        </td>
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700">
                          ${row.Charge}
                        </td>
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700 text-center">
                          {row.PAID ? "✅" : "❌"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
              Pending Guest Approvals
            </h3>
            <button onClick={loadApprovals} className={smallButtonClass}>
              Refresh Approvals
            </button>
          </div>

          <div
            className="bg-white p-4 rounded shadow-sm border border-slate-200
                                    dark:bg-slate-800 dark:border-slate-700"
          >
            {approvalsError && (
              <div
                className="p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded text-sm
                                            dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-200"
              >
                ⚠️ Error: {approvalsError}
              </div>
            )}

            {approvalsLoading ? (
              <div className="text-center py-4 text-slate-500 dark:text-slate-400">
                Loading requests...
              </div>
            ) : approvals.length === 0 ? (
              <div className="text-center py-4 text-slate-500 dark:text-slate-400 italic">
                No pending requests
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto">
                <table className="w-full text-sm text-left border-collapse text-slate-800 dark:text-slate-100">
                  <thead className="bg-slate-100 sticky top-0 dark:bg-slate-700/50">
                    <tr>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                        Name
                      </th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                        Email
                      </th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                        Request Date
                      </th>
                      <th className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvals.map((req) => (
                      <tr
                        key={req.RequestId}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                      >
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700 font-medium">
                          {req.Name}
                        </td>
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                          {req.Email}
                        </td>
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(req.CreatedAt).toLocaleDateString()}
                        </td>
                        <td className="p-2 border-b border-slate-200 dark:border-slate-700 text-right">
                          <button
                            onClick={() => approveGuest(req.RequestId)}
                            className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-500 transition-colors"
                          >
                            Approve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          role="dialog"
          aria-modal="true"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={dismissCancelUpdates}
            aria-hidden="true"
          />

          {/* Modal */}
          <div
            className="relative w-full max-w-md rounded-2xl border bg-white p-4 shadow-xl border-slate-200
                 dark:bg-slate-900 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Discard changes?
            </div>
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              This will clear the form fields. Your existing saved reservations
              won’t be changed.
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <button
                type="button"
                className="border rounded-lg px-3 py-2 text-sm font-semibold bg-white text-slate-700 border-slate-300 hover:bg-slate-50
                     dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600 dark:hover:bg-slate-700"
                onClick={dismissCancelUpdates}
              >
                Keep editing
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={confirmCancelUpdates}
                className="border rounded-lg px-3 py-2 text-sm font-extrabold bg-rose-600 text-white
                     hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading && <Spinner className="h-4 w-4" />}
                Yes, clear it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
