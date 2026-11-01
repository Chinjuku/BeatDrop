'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Shield,
  KeyRound,
  RefreshCw,
  Trash2,
  Search,
  Plus,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Music2,
  Database,
  Users,
  Play,
  Loader2,
  LogOut,
  X,
} from 'lucide-react';
import { Artist, CategoryType } from '../../shared/types';

export default function AdminDashboardPage() {
  const [adminKey, setAdminKey] = useState<string>('');
  const [inputKey, setInputKey] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<boolean>(false);

  // Dashboard Data State
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loadingArtists, setLoadingArtists] = useState<boolean>(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryType>('all');

  // Search Online Discovery State
  const [discoverQuery, setDiscoverQuery] = useState<string>('');
  const [discovered, setDiscovered] = useState<Artist[]>([]);
  const [searchingRemote, setSearchingRemote] = useState<boolean>(false);
  const [addingArtistName, setAddingArtistName] = useState<string | null>(null);

  // Toast / Feedback State
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Check saved session on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('beatdrop_admin_key');
    if (saved) {
      verifyKey(saved, true);
    }
  }, []);

  const verifyKey = async (keyToVerify: string, isAuto = false) => {
    setVerifying(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/admin/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': keyToVerify,
        },
        body: JSON.stringify({ adminKey: keyToVerify }),
      });
      const json = await res.json();
      if (res.ok && json.code === 0) {
        setAdminKey(keyToVerify);
        setIsAuthenticated(true);
        sessionStorage.setItem('beatdrop_admin_key', keyToVerify);
        loadArtists();
      } else {
        if (!isAuto) {
          setAuthError(json.message || 'รหัสผ่าน Admin Key ไม่ถูกต้อง');
        }
        sessionStorage.removeItem('beatdrop_admin_key');
      }
    } catch {
      setAuthError('ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
    } finally {
      setVerifying(false);
    }
  };

  const loadArtists = async () => {
    setLoadingArtists(true);
    try {
      const res = await fetch('/api/artists');
      const json = await res.json();
      if (json.code === 0 && Array.isArray(json.data)) {
        setArtists(json.data);
      }
    } catch {
      setToast({ type: 'error', message: 'โหลดรายการศิลปินไม่สำเร็จ' });
    } finally {
      setLoadingArtists(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('beatdrop_admin_key');
    setAdminKey('');
    setIsAuthenticated(false);
    setInputKey('');
  };

  // Sync Artist Songs (up to 200 tracks via Apple iTunes)
  const handleSync = async (artist: Artist) => {
    setSyncingId(artist.id || artist.name);
    setToast(null);
    try {
      const res = await fetch('/api/artists/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          id: artist.id,
          name: artist.name,
          artistName: artist.name,
          category: artist.category,
          mainGenre: artist.mainGenre,
          avatarUrl: artist.avatarUrl,
        }),
      });
      const json = await res.json();
      if (res.ok && json.code === 0) {
        const added = json.data?.added ?? 0;
        const total = json.data?.newCount ?? json.data?.artist?.trackCount ?? 0;
        setToast({
          type: 'success',
          message: `ซิงก์เพลงของ "${artist.name}" สำเร็จ! (+${added} เพลงใหม่ รวมในคลัง ${total} เพลง)`,
        });
        await loadArtists();
      } else {
        throw new Error(json.message || 'ซิงก์ไม่สำเร็จ');
      }
    } catch (err) {
      setToast({ type: 'error', message: (err as Error).message });
    } finally {
      setSyncingId(null);
    }
  };

  // Delete Artist and their songs
  const handleDelete = async (artist: Artist) => {
    const confirmDelete = window.confirm(
      `ยืนยันการลบศิลปิน "${artist.name}" และเพลงทั้งหมดของศิลปินนี้ออกจากคลังหรือไม่? การกระทำนี้ไม่สามารถย้อนกลับได้`
    );
    if (!confirmDelete) return;

    setDeletingId(artist.id);
    setToast(null);
    try {
      const res = await fetch(`/api/artists/${artist.id}`, {
        method: 'DELETE',
        headers: {
          'x-admin-key': adminKey,
        },
      });
      const json = await res.json();
      if (res.ok && json.code === 0) {
        setToast({ type: 'success', message: `ลบศิลปิน "${artist.name}" เรียบร้อยแล้ว` });
        setArtists((prev) => prev.filter((a) => a.id !== artist.id));
      } else {
        throw new Error(json.message || 'ลบไม่สำเร็จ');
      }
    } catch (err) {
      setToast({ type: 'error', message: (err as Error).message });
    } finally {
      setDeletingId(null);
    }
  };

  // Debounced iTunes Discovery Search
  useEffect(() => {
    const trimmed = discoverQuery.trim();
    if (!isAuthenticated || trimmed.length < 2) {
      setDiscovered([]);
      setSearchingRemote(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingRemote(true);
      try {
        const res = await fetch(`/api/artists?q=${encodeURIComponent(trimmed)}&discover=true`);
        const json = await res.json();
        if (json.code === 0 && Array.isArray(json.data)) {
          setDiscovered(json.data);
        }
      } catch {
        setDiscovered([]);
      } finally {
        setSearchingRemote(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [discoverQuery, isAuthenticated]);

  // Add / Ingest discovered artist directly
  const handleAddDiscovered = async (art: Artist) => {
    setAddingArtistName(art.name);
    setToast(null);
    try {
      const res = await fetch('/api/artists/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-key': adminKey,
        },
        body: JSON.stringify({
          name: art.name,
          artistName: art.name,
          category: art.category,
          mainGenre: art.mainGenre,
          avatarUrl: art.avatarUrl,
        }),
      });
      const json = await res.json();
      if (res.ok && json.code === 0) {
        setToast({
          type: 'success',
          message: `เพิ่ม "${art.name}" เข้าคลังสำเร็จ (+${json.data?.added || 0} เพลง)`,
        });
        setDiscoverQuery('');
        setDiscovered([]);
        await loadArtists();
      } else {
        throw new Error(json.message || 'เพิ่มศิลปินไม่สำเร็จ');
      }
    } catch (err) {
      setToast({ type: 'error', message: (err as Error).message });
    } finally {
      setAddingArtistName(null);
    }
  };

  // Filtered Artists for display
  const filteredArtists = useMemo(() => {
    return artists.filter((a) => {
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) || a.mainGenre?.toLowerCase().includes(q);
    });
  }, [artists, categoryFilter, searchQuery]);

  const totalTracks = useMemo(() => {
    return artists.reduce((acc, a) => acc + (a.trackCount ?? 0), 0);
  }, [artists]);

  // 1. Lock Screen (When not authenticated)
  if (!isAuthenticated) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center p-4">
        <div
          className="w-full max-w-md p-6 sm:p-8 rounded-3xl border shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95"
          style={{
            backgroundColor: 'var(--song-surface)',
            borderColor: 'var(--song-border)',
            color: 'var(--song-text)',
          }}
        >
          <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Shield className="w-8 h-8" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-xl font-extrabold tracking-tight">BeatDrop Admin Console</h1>
            <p className="text-xs" style={{ color: 'var(--song-muted)' }}>
              หน้าจัดการคลังเพลงและระบบความปลอดภัย กรุณากรอก Admin API Key
            </p>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold flex items-center justify-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inputKey.trim()) verifyKey(inputKey.trim());
            }}
            className="space-y-4"
          >
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3.5 top-3 text-neutral-400" />
              <input
                type="password"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                placeholder="กรอก ADMIN_API_KEY..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                style={{
                  backgroundColor: 'var(--song-surface-soft)',
                  borderColor: 'var(--song-border)',
                  color: 'var(--song-text)',
                }}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={verifying || !inputKey.trim()}
              className="w-full py-2.5 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 transition hover:brightness-110 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--song-accent)',
                color: 'var(--song-accent-on)',
              }}
            >
              {verifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>กำลังตรวจสอบ...</span>
                </>
              ) : (
                <span>เข้าสู่ระบบแอดมิน</span>
              )}
            </button>
          </form>

          <div className="pt-2 border-t" style={{ borderColor: 'var(--song-border)' }}>
            <Link
              href="/play"
              className="text-xs font-semibold hover:underline flex items-center justify-center gap-1.5"
              style={{ color: 'var(--song-muted)' }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>กลับสู่หน้าเล่นเกม (Play)</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Authenticated Admin Dashboard
  return (
    <div className="w-full max-w-[1600px] mx-auto py-6 px-3 sm:px-6 space-y-6 animate-in fade-in">
      {/* Top Banner Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b" style={{ borderColor: 'var(--song-border)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-wide">BeatDrop Admin Console</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                Secured Session
              </span>
            </div>
            <p className="text-xs" style={{ color: 'var(--song-muted)' }}>
              ศูนย์ควบคุมคลังศิลปิน ซิงก์เพลงจาก Apple iTunes และจัดการสิทธิ์ระบบ
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/play"
            className="px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition hover:brightness-110"
            style={{
              backgroundColor: 'var(--song-surface-soft)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>กลับสู่หน้าเกม</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs font-bold flex items-center gap-1.5 transition hover:bg-rose-500/20"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-3 rounded-2xl border text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in ${
            toast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button type="button" onClick={() => setToast(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          className="p-4 rounded-2xl border flex items-center gap-3.5"
          style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
        >
          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              ศิลปินในคลัง
            </div>
            <div className="text-xl font-extrabold">{artists.length} ศิลปิน</div>
          </div>
        </div>

        <div
          className="p-4 rounded-2xl border flex items-center gap-3.5"
          style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
        >
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Music2 className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              เพลงพร้อมเล่นในคลัง
            </div>
            <div className="text-xl font-extrabold">{totalTracks} เพลง</div>
          </div>
        </div>

        <div
          className="p-4 rounded-2xl border flex items-center gap-3.5"
          style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
        >
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>
              Admin Key Guard
            </div>
            <div className="text-sm font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Enforced (403 Protected)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Online Search & Ingest Section */}
      <div
        className="p-4 sm:p-5 rounded-2xl border space-y-3.5"
        style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-extrabold">ค้นหาและเพิ่มศิลปินใหม่จาก Apple iTunes (Sync สูงสุด 200 เพลง)</h2>
          </div>
        </div>

        <div className="relative">
          <input
            type="text"
            value={discoverQuery}
            onChange={(e) => setDiscoverQuery(e.target.value)}
            placeholder="พิมพ์ชื่อศิลปิน เช่น Bodyslam, Tilly Birds, Coldplay, Eminem..."
            className="w-full pl-9 pr-8 py-2 rounded-xl border text-sm font-medium focus:outline-none"
            style={{
              backgroundColor: 'var(--song-surface-soft)',
              borderColor: 'var(--song-border)',
              color: 'var(--song-text)',
            }}
          />
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-neutral-400" />
          {searchingRemote && <Loader2 className="w-4 h-4 absolute right-3 top-3 text-emerald-400 animate-spin" />}
        </div>

        {discovered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 pt-2 border-t" style={{ borderColor: 'var(--song-border)' }}>
            {discovered.map((art) => {
              const inLibrary = artists.some((a) => a.name.toLowerCase() === art.name.toLowerCase());
              const isAdding = addingArtistName === art.name;

              return (
                <div
                  key={art.name}
                  className="p-2.5 rounded-xl border flex items-center justify-between gap-2"
                  style={{ backgroundColor: 'var(--song-surface-soft)', borderColor: 'var(--song-border)' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {art.avatarUrl ? (
                      <img src={art.avatarUrl} alt={art.name} className="w-8 h-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                        {art.name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{art.name}</div>
                      <div className="text-[10px]" style={{ color: 'var(--song-muted)' }}>
                        {art.category === 'thai' ? '🇹🇭 เพลงไทย' : '🌍 สากล'} • {art.mainGenre}
                      </div>
                    </div>
                  </div>

                  {inLibrary ? (
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 border border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>มีแล้ว</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={isAdding}
                      onClick={() => handleAddDiscovered(art)}
                      className="px-3 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition hover:brightness-110 disabled:opacity-50"
                      style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
                    >
                      {isAdding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                      <span>Sync 200 เพลง</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Library Management Section */}
      <div
        className="p-4 sm:p-5 rounded-2xl border space-y-4"
        style={{ backgroundColor: 'var(--song-surface)', borderColor: 'var(--song-border)' }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-extrabold">จัดการศิลปินในคลัง (Admin Artists Control)</h2>
            <span className="text-xs font-bold text-emerald-400">({filteredArtists.length})</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาศิลปินในคลัง..."
              className="px-3 py-1.5 rounded-xl border text-xs font-medium focus:outline-none"
              style={{
                backgroundColor: 'var(--song-surface-soft)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-text)',
              }}
            />

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryType)}
              className="px-3 py-1.5 rounded-xl border text-xs font-bold focus:outline-none"
              style={{
                backgroundColor: 'var(--song-surface-soft)',
                borderColor: 'var(--song-border)',
                color: 'var(--song-text)',
              }}
            >
              <option value="all">ทุกหมวดหมู่</option>
              <option value="thai">🇹🇭 เพลงไทย</option>
              <option value="international">🌍 เพลงสากล</option>
            </select>
          </div>
        </div>

        {/* Artists Grid */}
        {loadingArtists ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
            <span className="text-xs font-bold" style={{ color: 'var(--song-muted)' }}>
              กำลังโหลดรายการศิลปิน...
            </span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filteredArtists.map((artist) => {
              const isSyncing = syncingId === artist.id || syncingId === artist.name;
              const isDeleting = deletingId === artist.id;

              return (
                <div
                  key={artist.id + artist.name}
                  className="p-3 rounded-2xl border flex items-center justify-between gap-2.5 transition hover:border-white/20"
                  style={{
                    backgroundColor: 'var(--song-surface-soft)',
                    borderColor: 'var(--song-border)',
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {artist.avatarUrl ? (
                      <img
                        src={artist.avatarUrl}
                        alt={artist.name}
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold shrink-0">
                        {artist.name[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold truncate">{artist.name}</div>
                      <div className="text-[10px] flex items-center gap-1.5" style={{ color: 'var(--song-muted)' }}>
                        <span>{artist.category === 'thai' ? '🇹🇭' : '🌍'} {artist.mainGenre}</span>
                        <span>•</span>
                        <span className="font-extrabold text-emerald-400">{artist.trackCount || 0} เพลง</span>
                      </div>
                    </div>
                  </div>

                  {/* Admin Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Sync Button */}
                    <button
                      type="button"
                      disabled={isSyncing || isDeleting}
                      onClick={() => handleSync(artist)}
                      className="p-2 rounded-xl border transition hover:brightness-110 disabled:opacity-50 text-cyan-400 border-cyan-500/30 bg-cyan-500/10"
                      title={`Sync เพลงเพิ่ม ${artist.name}`}
                    >
                      {isSyncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    </button>

                    {/* Delete Button */}
                    <button
                      type="button"
                      disabled={isSyncing || isDeleting}
                      onClick={() => handleDelete(artist)}
                      className="p-2 rounded-xl border transition hover:brightness-110 disabled:opacity-50 text-rose-400 border-rose-500/30 bg-rose-500/10"
                      title={`ลบศิลปิน ${artist.name} ออกจากระบบ`}
                    >
                      {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

