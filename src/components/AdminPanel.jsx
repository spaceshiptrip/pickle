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

  // Reports (upgraded)
  const [reportPreset, setReportPreset] = useState("month"); // week|month|30d|range|all
  const [reportFrom, setReportFrom] = useState(
    new Date().toISOString().substring(0, 10),
  ); // YYYY-MM-DD
  const [reportTo, setReportTo] = useState(
    new Date().toISOString().substring(0, 10),
  );
  const [reportUserId, setReportUserId] = useState(""); // optional filter
  const [reportTab, setReportTab] = useState("reservation"); // reservation|user
  const [reportRes, setReportRes] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");

  // Approvals
  const [approvals, setApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(false);
  const [approvalsError, setApprovalsError] = useState("");

  const [preCancelStatus, setPreCancelStatus] = useState(null);

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // keys: date, player, status, charge, paid, balance, reservationId, userId
  const [ledgerSort, setLedgerSort] = useState({ key: "date", dir: "desc" });

  const ledgerRows = useMemo(() => {
    const raw = reportRes?.rows || [];
    const normalized = raw.map((r) => {
      const charge = Number(r.charge || 0);
      const paid = Number(r.paid || 0);
      return {
        ...r,
        charge,
        paid,
        balance: charge - paid, // owed if >0; credit if <0
      };
    });
    return sortRows(normalized, ledgerSort);
  }, [reportRes, ledgerSort]);

  // keys for the "By User" table
  const [userSort, setUserSort] = useState({ key: "userId", dir: "asc" });

  // map of userId -> user object (Name, etc.)
  const [usersById, setUsersById] = useState({});

  const userRows = useMemo(() => {
    const raw = reportRes?.byUser || [];

    const normalized = raw.map((u) => {
      const userId = String(u.userId ?? "").trim();
      const userObj = usersById[userId];
      const userName = String(
        u.userName ?? userObj?.Name ?? userObj?.name ?? "",
      ).trim();

      return {
        ...u,
        userId,
        userName,
        uniquePlayers: Number(u.uniquePlayers || 0),
        checkinsActive: Number(u.checkinsActive || 0),
        netCollected: Number(u.netCollected || 0),
        creditCanceled: Number(u.creditCanceled || 0),
        outstandingActive: Number(u.outstandingActive || 0),
      };
    });

    return sortRows(normalized, userSort);
  }, [reportRes, userSort, usersById]);

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
      if (isAdmin) await loadUsersIndex();

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

  async function loadUsersIndex() {
    try {
      const r = await apiGet({ action: "listusers" });
      if (r?.ok && Array.isArray(r.users)) {
        const m = {};
        r.users.forEach((u) => {
          const id = String(u.UserId ?? u.userId ?? "").trim();
          if (id) m[id] = u;
        });
        if (mounted) setUsersById(m);
      }
    } catch (e) {
      // non-fatal: the report still works without names
      console.warn("listusers failed:", e);
    }
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

  function ymd(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function computeReportRange(preset) {
    const today = new Date();
    const start = new Date(today);

    if (preset === "all") {
      return { from: "2000-01-01", to: ymd(today) }; // arbitrary “early” date
    }

    if (preset === "range") {
      const from = (reportFrom || "").trim() || ymd(today);
      const to = (reportTo || "").trim() || ymd(today);
      return { from, to };
    }

    if (preset === "week") {
      // Monday start
      const day = today.getDay(); // 0 Sun
      const diff = day === 0 ? -6 : 1 - day;
      start.setDate(today.getDate() + diff);
      return { from: ymd(start), to: ymd(today) };
    }

    if (preset === "month") {
      start.setDate(1);
      return { from: ymd(start), to: ymd(today) };
    }

    // 30d
    start.setDate(today.getDate() - 30);
    return { from: ymd(start), to: ymd(today) };
  }

  async function loadReport() {
    setReportLoading(true);
    setReportError("");
    setReportRes(null);

    try {
      const range = computeReportRange(reportPreset);

      const r = await apiGet({
        action: "adminreport",
        preset: reportPreset,
        from: range.from,
        to: range.to,
        userId: (reportUserId || "").trim(),
      });

      if (r?.ok) setReportRes(r);
      else setReportError(r?.error || "Failed to load report");
    } catch (e) {
      setReportError(e?.message || "Failed to load report");
    } finally {
      setReportLoading(false);
    }
  }

  function money(n) {
    const v = Number(n || 0);
    return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  function safeStr(v) {
    return String(v ?? "");
  }

  function compare(a, b) {
    if (a === b) return 0;
    return a > b ? 1 : -1;
  }

  function sortRows(rows, sort) {
    const { key, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;

    return [...rows].sort((ra, rb) => {
      const a = ra[key];
      const b = rb[key];

      // numeric keys
      const numericKeys = new Set([
        "charge",
        "paid",
        "balance",
        "uniquePlayers",
        "checkinsActive",
        "netCollected",
        "creditCanceled",
        "outstandingActive",
      ]);

      if (numericKeys.has(key)) {
        return sign * compare(Number(a || 0), Number(b || 0));
      }

      // date sorts as ymd string (YYYY-MM-DD) => lex works
      return sign * compare(safeStr(a).toLowerCase(), safeStr(b).toLowerCase());
    });
  }

  function toggleSort(setter, current, key) {
    if (current.key !== key) return setter({ key, dir: "asc" });
    return setter({ key, dir: current.dir === "asc" ? "desc" : "asc" });
  }

  function sortIcon(current, key) {
    if (current.key !== key) return "↕";
    return current.dir === "asc" ? "↑" : "↓";
  }

  function fmtTime(v) {
    if (v === null || v === undefined) return "";

    // Normalize to string when possible
    if (typeof v === "string") {
      const s = v.trim();
      if (!s) return "";

      // ✅ Handle Sheets "time-only" that turns into ISO around 1899-12-30/31
      // Examples:
      // 1899-12-30T19:00:00.000Z
      // 1899-12-31T03:00:00.000Z
      if (/^1899-12-3[01]T/.test(s)) {
        const d = new Date(s);
        if (!isNaN(d)) {
          return d.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
        }
      }

      // If the backend ever sends a full ISO datetime for a real date,
      // still try to render it as a time (safe fallback).
      if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
        const d = new Date(s);
        if (!isNaN(d)) {
          return d.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          });
        }
      }

      // Plain time string (HH:MM[:SS]) -> normalize
      if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
        const [hh, mm] = s.split(":");
        const d = new Date();
        d.setHours(Number(hh), Number(mm), 0, 0);
        return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }

      return s;
    }

    // If it's a Date object or number
    const d = new Date(v);
    if (!isNaN(d)) {
      return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    return "";
  }

  function fmtTimeRange(start, end) {
    const a = fmtTime(start);
    const b = fmtTime(end);
    if (!a && !b) return "";
    if (a && !b) return a;
    if (!a && b) return b;
    return `${a}–${b}`;
  }

  function balanceColorClass(n) {
    const v = Number(n || 0);
    if (Math.abs(v) <= 0.0001) return "";
    return v > 0
      ? "text-rose-700 dark:text-rose-300"
      : "text-emerald-700 dark:text-emerald-300";
  }

  function StatusPill({ status }) {
    const s = String(status || "").toLowerCase();
    const isCanceled = s === "canceled";
    const cls = isCanceled
      ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-200 dark:border-rose-900"
      : "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400";
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}
      >
        {isCanceled ? "Canceled" : "Reserved"}
      </span>
    );
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
                                            form.Status === "canceled"
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
                    <option value="canceled">🚫 CANCELED</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <button
                    type="button"
                    className={`w-full border rounded px-3 py-2 font-extrabold tracking-wide transition-colors ${
                      form.Status === "canceled"
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-rose-600 text-white hover:bg-rose-700"
                    }`}
                    onClick={() => {
                      if (form.Status === "canceled") {
                        setForm({
                          ...form,
                          Status: preCancelStatus || "reserved",
                        });
                        setPreCancelStatus(null);
                      } else {
                        setPreCancelStatus(form.Status);
                        setForm({ ...form, Status: "canceled" });
                      }
                    }}
                  >
                    {form.Status === "canceled"
                      ? "RESUME Event"
                      : "CANCEL Event"}
                  </button>

                  {form.Status === "canceled" && (
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Canceled sessions are excluded from reports/charges.
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
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h3 className="font-semibold text-lg text-slate-900 dark:text-slate-100">
                  Reports
                </h3>

                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    className={selectClass}
                    value={reportPreset}
                    onChange={(e) => setReportPreset(e.target.value)}
                  >
                    <option value="week">This week</option>
                    <option value="month">This month</option>
                    <option value="30d">Last 30 days</option>
                    <option value="range">Range</option>
                    <option value="all">All-time</option>
                  </select>

                  {reportPreset === "range" && (
                    <>
                      <input
                        type="date"
                        className={inputClass}
                        value={reportFrom}
                        onChange={(e) => setReportFrom(e.target.value)}
                      />
                      <input
                        type="date"
                        className={inputClass}
                        value={reportTo}
                        onChange={(e) => setReportTo(e.target.value)}
                      />
                    </>
                  )}

                  <input
                    className={inputClass}
                    placeholder="Filter by UserId (optional)"
                    value={reportUserId}
                    onChange={(e) => setReportUserId(e.target.value)}
                    style={{ maxWidth: 220 }}
                  />

                  <button
                    onClick={loadReport}
                    className="bg-gray-800 text-white px-3 py-1 rounded text-sm hover:bg-black
                 dark:bg-slate-700 dark:hover:bg-slate-600 flex items-center gap-2"
                  >
                    {reportLoading && <Spinner className="h-4 w-4" />}
                    {reportLoading ? "Loading..." : "Load"}
                  </button>
                </div>
              </div>

              {reportError && (
                <div
                  className="p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded text-sm
                    dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-200"
                >
                  ⚠️ {reportError}
                </div>
              )}

              {reportRes?.ok && (
                <div
                  className="bg-white p-4 rounded shadow-sm border border-slate-200
                    dark:bg-slate-800 dark:border-slate-700"
                >
                  <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                    {reportRes.range?.from} → {reportRes.range?.to}
                    {reportUserId ? ` · UserId ${reportUserId}` : ""}
                  </div>

                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4 text-center">
                    <div className="p-2 bg-blue-50 rounded dark:bg-blue-500/10">
                      <div className="text-xl font-bold text-blue-800 dark:text-blue-200">
                        {reportRes.totals.uniquePlayers}
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-300 uppercase">
                        Unique Players
                      </div>
                    </div>

                    <div className="p-2 bg-gray-50 rounded dark:bg-slate-700/40">
                      <div className="text-xl font-bold text-gray-800 dark:text-slate-100">
                        {reportRes.totals.checkinsActive}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-slate-300 uppercase">
                        Active Check-ins
                      </div>
                    </div>

                    <div className="p-2 bg-green-50 rounded dark:bg-emerald-500/10">
                      <div className="text-xl font-bold text-green-800 dark:text-emerald-200">
                        {money(reportRes.totals.netCollected)}
                      </div>
                      <div className="text-xs text-green-600 dark:text-emerald-300 uppercase">
                        Net Collected
                      </div>
                    </div>

                    <div className="p-2 bg-red-50 rounded dark:bg-rose-500/10">
                      <div
                        className={`text-xl font-bold ${balanceColorClass(reportRes.totals.outstandingActive)}`}
                      >
                        {money(reportRes.totals.outstandingActive)}
                      </div>
                      <div className="text-xs text-red-600 dark:text-rose-300 uppercase">
                        Outstanding (Active)
                      </div>
                    </div>

                    <div className="p-2 bg-purple-50 rounded dark:bg-purple-500/10">
                      <div className="text-xl font-bold text-purple-800 dark:text-purple-200">
                        {money(reportRes.totals.creditCanceled)}
                      </div>
                      <div className="text-xs text-purple-600 dark:text-purple-300 uppercase">
                        Canceled Credits
                      </div>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-2 mb-3">
                    <button
                      className={
                        "text-sm border px-3 py-1 rounded " +
                        (reportTab === "reservation"
                          ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                          : "bg-white text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600")
                      }
                      onClick={() => setReportTab("reservation")}
                    >
                      By Reservation
                    </button>
                    <button
                      className={
                        "text-sm border px-3 py-1 rounded " +
                        (reportTab === "user"
                          ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                          : "bg-white text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600")
                      }
                      onClick={() => setReportTab("user")}
                    >
                      By User
                    </button>
                    <button
                      className={
                        "text-sm border px-3 py-1 rounded " +
                        (reportTab === "ledger"
                          ? "bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white"
                          : "bg-white text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-600")
                      }
                      onClick={() => setReportTab("ledger")}
                    >
                      Ledger
                    </button>
                  </div>

                  {/* Tables */}
                  <div className="max-h-72 overflow-y-auto border rounded border-slate-200 dark:border-slate-700">
                    {reportTab === "reservation" ? (
                      <table className="w-full text-sm text-left text-slate-800 dark:text-slate-100">
                        <thead className="bg-slate-100 sticky top-0 dark:bg-slate-700/50">
                          <tr>
                            <th
                              className="p-2 border-b border-slate-200 dark:border-slate-700"
                              style={{ width: "200px" }}
                            >
                              Date
                            </th>

                            <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                              Status
                            </th>
                            <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                              Players
                            </th>
                            <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                              Charges
                            </th>
                            <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                              Paid
                            </th>
                            <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                              Canceled Credit
                            </th>
                            <th className="p-2 border-b border-slate-200 dark:border-slate-700">
                              Outstanding
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(reportRes.byReservation || []).map((r, i) => (
                            <tr
                              key={r.reservationId || i}
                              className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                            >
                              <td
                                className="p-2 border-b border-slate-200 dark:border-slate-700"
                                style={{ width: "200px" }}
                              >
                                <div className="font-medium whitespace-nowrap">
                                  {r.date}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {fmtTimeRange(r.start, r.end)}
                                </div>
                              </td>

                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                <StatusPill status={r.status} />
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700">
                                {Array.isArray(r.players)
                                  ? r.players.join(", ")
                                  : ""}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {money(r.chargesActive)}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {money(r.paidActive)}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {money(r.creditCanceled)}
                              </td>
                              <td
                                className={`p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap font-semibold ${balanceColorClass(r.outstandingActive)}`}
                              >
                                {money(r.outstandingActive)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : reportTab === "ledger" ? (
                      <table className="w-full text-sm text-left text-slate-800 dark:text-slate-100">
                        <thead className="bg-slate-100 sticky top-0 dark:bg-slate-700/50">
                          <tr>
                            {[
                              ["date", "Date"],
                              ["player", "Player"],
                              ["status", "Status"],
                              ["charge", "Charge"],
                              ["paid", "Paid"],
                              ["balance", "Net"],
                              ["reservationId", "ResId"],
                              ["userId", "UserId"],
                            ].map(([key, label]) => (
                              <th
                                key={key}
                                className="p-2 border-b border-slate-200 dark:border-slate-700 cursor-pointer select-none"
                                style={
                                  key === "date"
                                    ? { width: "200px" }
                                    : undefined
                                }
                                onClick={() =>
                                  toggleSort(setLedgerSort, ledgerSort, key)
                                }
                                title="Click to sort"
                              >
                                <span className="inline-flex items-center gap-2">
                                  {label}
                                  <span className="text-xs opacity-70">
                                    {sortIcon(ledgerSort, key)}
                                  </span>
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {ledgerRows.map((r, i) => (
                            <tr
                              key={`${r.reservationId}-${r.player}-${i}`}
                              className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                            >
                              <td
                                className="p-2 border-b border-slate-200 dark:border-slate-700"
                                style={{ width: "200px" }}
                              >
                                <div className="font-medium whitespace-nowrap">
                                  {r.date}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                  {fmtTimeRange(r.start, r.end)}
                                </div>
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700">
                                {r.player}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                <StatusPill status={r.status} />
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {money(r.charge)}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {money(r.paid)}
                              </td>
                              <td
                                className={`p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap font-semibold ${balanceColorClass(r.balance)}`}
                              >
                                {money(r.balance)}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {r.reservationId}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {r.userId || ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <table className="w-full text-sm text-left text-slate-800 dark:text-slate-100">
                        <thead className="bg-slate-100 sticky top-0 dark:bg-slate-700/50">
                          <tr>
                            {[
                              ["userId", "User"],
                              ["uniquePlayers", "Unique Players"],
                              ["checkinsActive", "Check-ins"],
                              ["netCollected", "Net Collected"],
                              ["creditCanceled", "Canceled Credit"],
                              ["outstandingActive", "Outstanding"],
                            ].map(([key, label]) => (
                              <th
                                key={key}
                                className="p-2 border-b border-slate-200 dark:border-slate-700 cursor-pointer select-none"
                                onClick={() =>
                                  toggleSort(setUserSort, userSort, key)
                                }
                                title="Click to sort"
                              >
                                <span className="inline-flex items-center gap-2">
                                  {label}
                                  <span className="text-xs opacity-70">
                                    {sortIcon(userSort, key)}
                                  </span>
                                </span>
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {userRows.map((u, i) => (
                            <tr
                              key={u.userId || i}
                              className="hover:bg-slate-50 dark:hover:bg-slate-700/40"
                            >
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                <div className="font-medium">{u.userId}</div>
                                {u.userName ? (
                                  <div className="text-xs text-slate-500 dark:text-slate-400">
                                    {u.userName}
                                  </div>
                                ) : null}
                              </td>

                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {u.uniquePlayers}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {u.checkinsActive}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {money(u.netCollected)}
                              </td>
                              <td className="p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap">
                                {money(u.creditCanceled)}
                              </td>
                              <td
                                className={`p-2 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap font-semibold ${balanceColorClass(u.outstandingActive)}`}
                              >
                                {money(u.outstandingActive)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Canceled sessions are excluded from charges/check-ins. Any
                    money paid on a canceled session is shown as “Canceled
                    Credits”.
                  </div>
                </div>
              )}
            </div>
          </div>
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
