import React, { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api';

export default function AdminPanel() {
    const [reservations, setReservations] = useState([]);
    const [form, setForm] = useState({ Date: '', Start: '', End: '', Court: '1', Capacity: 8, BaseFee: 5 });
    const [fee, setFee] = useState({ ReservationId: '', FeeName: 'Dinner', Amount: 10 });
    const [loading, setLoading] = useState(false);

    // Reports
    const [reportMonth, setReportMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [reportData, setReportData] = useState([]);
    const [reportLoading, setReportLoading] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const r = await apiGet({ action: 'listreservations' });
            if (r.ok) setReservations(r.reservations);
        } catch (e) { console.error(e); }
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    async function loadReport() {
        if (!reportMonth) return;
        setReportLoading(true);
        try {
            // Fetch all attendance for the month
            const r = await apiGet({ action: 'listattendance', month: reportMonth });
            if (r.ok) setReportData(r.attendees);
        } catch (e) { console.error(e); }
        setReportLoading(false);
    }

    async function saveReservation() {
        if (!form.Date || !form.Start || !form.End) return alert("Missing fields");
        try {
            const r = await apiPost('upsertreservation', form);
            if (r.ok) {
                setForm({ Date: '', Start: '', End: '', Court: '1', Capacity: 8, BaseFee: 5 });
                load();
                alert("Reservation saved!");
            }
        } catch (e) { alert("Error: " + e.message); }
    }

    async function addFee() {
        if (!fee.ReservationId) return;
        try {
            const r = await apiPost('addfee', fee);
            if (r.ok) {
                setFee({ ReservationId: '', FeeName: 'Dinner', Amount: 10 });
                load();
                alert("Fee added!");
            }
        } catch (e) { alert("Error: " + e.message); }
    }

    const reportStats = useMemo(() => {
        const totalPlayers = reportData.length;
        const uniquePlayers = new Set(reportData.map(r => r.Player)).size;
        const totalCollected = reportData.reduce((acc, r) => acc + (r.Charge || 0), 0);
        const unpaidCount = reportData.filter(r => !r.PAID).length;
        return { totalPlayers, uniquePlayers, totalCollected, unpaidCount };
    }, [reportData]);

    // Copy helper
    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        alert("Copied to clipboard!");
    };

    return (
        <div className="mt-8 border rounded p-3 bg-gray-50">
            <div className="flex justify-between items-center mb-3">
                <div className="font-semibold text-lg">Organizer Admin</div>
                <button onClick={load} className="text-xs border px-2 py-1 rounded bg-white">Refresh Data</button>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-6">
                {/* Reservation Form */}
                <div className="border rounded p-3 bg-white shadow-sm">
                    <div className="font-medium mb-2 text-blue-800">Create / Update Reservation</div>
                    <div className="grid grid-cols-2 gap-2">
                        <input className="border rounded px-2 py-1 col-span-2" placeholder="(optional) Id to update exisitng" value={form.Id || ''} onChange={e => setForm({ ...form, Id: e.target.value })} />

                        <div className="col-span-2">
                            <label className="block text-xs text-gray-500">Date</label>
                            <input className="border rounded px-2 py-1 w-full" type="date" value={form.Date} onChange={e => setForm({ ...form, Date: e.target.value })} />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500">Start</label>
                            <input className="border rounded px-2 py-1 w-full" type="time" value={form.Start} onChange={e => setForm({ ...form, Start: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500">End</label>
                            <input className="border rounded px-2 py-1 w-full" type="time" value={form.End} onChange={e => setForm({ ...form, End: e.target.value })} />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500">Court</label>
                            <input className="border rounded px-2 py-1 w-full" placeholder="Court" value={form.Court} onChange={e => setForm({ ...form, Court: e.target.value })} />
                        </div>

                        <div>
                            <label className="block text-xs text-gray-500">Capacity</label>
                            <input className="border rounded px-2 py-1 w-full" placeholder="Capacity" type="number" value={form.Capacity} onChange={e => setForm({ ...form, Capacity: Number(e.target.value) })} />
                        </div>

                        <div className="col-span-2">
                            <label className="block text-xs text-gray-500">Base Fee ($)</label>
                            <input className="border rounded px-2 py-1 w-full" placeholder="BaseFee" type="number" value={form.BaseFee} onChange={e => setForm({ ...form, BaseFee: Number(e.target.value) })} />
                        </div>
                    </div>
                    <button className="border rounded px-3 py-1 mt-3 w-full bg-blue-600 text-white font-semibold hover:bg-blue-700" onClick={saveReservation}>Save Reservation</button>
                </div>

                {/* Fees Form */}
                <div className="border rounded p-3 bg-white shadow-sm">
                    <div className="font-medium mb-2 text-green-800">Add Extra Fee (e.g., Dinner)</div>
                    <div className="mb-2">
                        <label className="block text-xs text-gray-500">Select Reservation</label>
                        <select className="border rounded px-2 py-1 w-full" value={fee.ReservationId} onChange={e => setFee({ ...fee, ReservationId: e.target.value })}>
                            <option value="">Select reservation…</option>
                            {reservations.map(r => (
                                <option key={r.Id} value={r.Id}>{r.Date} {r.Start}-{r.End} (Ct {r.Court})</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="block text-xs text-gray-500">Fee Name</label>
                            <input className="border rounded px-2 py-1 w-full" placeholder="Dinner" value={fee.FeeName} onChange={e => setFee({ ...fee, FeeName: e.target.value })} />
                        </div>
                        <div className="w-24">
                            <label className="block text-xs text-gray-500">Amount ($)</label>
                            <input className="border rounded px-2 py-1 w-full" type="number" step="0.01" placeholder="10" value={fee.Amount} onChange={e => setFee({ ...fee, Amount: Number(e.target.value) })} />
                        </div>
                    </div>
                    <button className="border rounded px-3 py-1 mt-3 w-full bg-green-600 text-white font-semibold hover:bg-green-700" onClick={addFee}>Add Fee</button>

                    <div className="mt-4 text-xs text-gray-500">
                        <p>Use this to add shared costs like balls, lights, or post-game food to a specific session.</p>
                    </div>
                </div>
            </div>

            {/* Monthly Report Section */}
            <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-lg">Monthly Report</h3>
                    <div className="flex gap-2 items-center">
                        <input type="month" className="border rounded px-2 py-1" value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
                        <button onClick={loadReport} className="bg-gray-800 text-white px-3 py-1 rounded text-sm hover:bg-black">
                            {reportLoading ? 'Loading...' : 'Load Report'}
                        </button>
                    </div>
                </div>

                {reportData.length > 0 && (
                    <div className="bg-white p-4 rounded shadow-sm">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4 text-center">
                            <div className="p-2 bg-blue-50 rounded">
                                <div className="text-xl font-bold text-blue-800">{reportStats.uniquePlayers}</div>
                                <div className="text-xs text-blue-600 uppercase">Unique Players</div>
                            </div>
                            <div className="p-2 bg-green-50 rounded">
                                <div className="text-xl font-bold text-green-800">${reportStats.totalCollected.toFixed(2)}</div>
                                <div className="text-xs text-green-600 uppercase">Total Collected</div>
                            </div>
                            <div className="p-2 bg-gray-50 rounded">
                                <div className="text-xl font-bold text-gray-800">{reportStats.totalPlayers}</div>
                                <div className="text-xs text-gray-600 uppercase">Check-ins</div>
                            </div>
                            <div className="p-2 bg-red-50 rounded">
                                <div className="text-xl font-bold text-red-800">{reportStats.unpaidCount}</div>
                                <div className="text-xs text-red-600 uppercase">Unpaid</div>
                            </div>
                        </div>

                        <div className="flex justify-end mb-2">
                            <button onClick={() => copyToClipboard(reportStats.totalCollected.toFixed(2))} className="text-xs text-blue-600 underline">Copy Total ($)</button>
                        </div>

                        <div className="max-h-60 overflow-y-auto border rounded">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 sticky top-0">
                                    <tr>
                                        <th className="p-2 border-b">Date</th>
                                        <th className="p-2 border-b">Player</th>
                                        <th className="p-2 border-b">Charge</th>
                                        <th className="p-2 border-b">Paid</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.map((row, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-2 border-b">{row.Date ? String(row.Date).split('T')[0] : ''}</td>
                                            <td className="p-2 border-b">{row.Player}</td>
                                            <td className="p-2 border-b">${row.Charge}</td>
                                            <td className="p-2 border-b text-center">{row.PAID ? '✅' : '❌'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
