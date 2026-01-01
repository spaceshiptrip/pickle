import React, { useState } from 'react';
import { authApi } from '../api';
import logo from '../assets/AthPicklersLogo.png';

export default function AuthView({ onLoginSuccess }) {
    const [tab, setTab] = useState('member');
    const [phone, setPhone] = useState('');
    const [pin, setPin] = useState('');
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleMemberLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await authApi.loginWithPin(phone, pin);
            if (res.ok && res.session) onLoginSuccess(res.session);
        } catch (err) {
            setError(err.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleGuestRequest = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');
        try {
            const res = await authApi.requestMagicLink(email, name);
            if (res.ok) setMessage(res.message);
        } catch (err) {
            setError(err.message || 'Request failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="min-h-screen bg-slate-900 flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4">
                <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 border border-slate-700 shadow-2xl">

                    {/* ✅ CENTERED, RESPONSIVE LOGO */}
                    <div className="w-full flex justify-center mb-6">
                        <div className="w-[240px] sm:w-[280px] md:w-[320px] aspect-square flex items-center justify-center overflow-hidden">
                            <img
                                src={logo}
                                alt="Athenaeum Picklers Logo"
                                className="w-full h-full object-contain block"
                            />
                        </div>
                    </div>

                    <h1 className="text-xl font-black text-black uppercase tracking-tight text-center">
                        Pickleball Login
                    </h1>
                    <p className="text-slate-500 text-[10px] text-center mt-1 mb-6">
                        Access reservations and payments
                    </p>

                    {/* TABS */}
                    <div className="flex bg-slate-900/50 p-1 rounded-xl mb-8">
                        <button
                            onClick={() => setTab('member')}
                            className={`flex-1 py-2 rounded-lg font-bold transition-all ${tab === 'member'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            Member
                        </button>
                        <button
                            onClick={() => setTab('guest')}
                            className={`flex-1 py-2 rounded-lg font-bold transition-all ${tab === 'guest'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-slate-400 hover:text-white'
                                }`}
                        >
                            Guest
                        </button>
                    </div>

                    {/* FORMS */}
                    {tab === 'member' ? (
                        <form onSubmit={handleMemberLogin} className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                    Phone Number
                                </label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="10 digit number"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                    PIN
                                </label>
                                <input
                                    type="password"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="Your secret PIN"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>
                            <button
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl transition disabled:opacity-50"
                            >
                                {loading ? 'Logging in…' : 'Sign In'}
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleGuestRequest} className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="John Doe"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="friend@example.com"
                                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    required
                                />
                                <p className="mt-2 text-[10px] text-slate-500">
                                    We’ll email you a one-time magic link.
                                </p>
                            </div>
                            <button
                                disabled={loading}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl transition disabled:opacity-50"
                            >
                                {loading ? 'Sending…' : 'Request Magic Link'}
                            </button>
                        </form>
                    )}

                    {/* MESSAGES */}
                    {message && (
                        <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 text-sm rounded-xl text-center">
                            {message}
                        </div>
                    )}
                    {error && (
                        <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/50 text-rose-400 text-sm rounded-xl text-center">
                            {error}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
