'use client';

import { useEffect, useState } from 'react';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import {
  useEmergencyContactViewModel,
  type EmergencyContactCategory,
  type EmergencyContactView,
} from '../viewModel/useEmergencyContactViewModel';

const ADMIN_ROLES = new Set(['Ketua_RT', 'Pengurus', 'Super_Admin']);

const CATEGORY_META: Record<
  EmergencyContactCategory,
  { label: string; emoji: string }
> = {
  police: { label: 'Polisi', emoji: '👮' },
  ambulance: { label: 'Ambulans', emoji: '🚑' },
  fire: { label: 'Pemadam', emoji: '🚒' },
  hospital: { label: 'Rumah Sakit', emoji: '🏥' },
  security: { label: 'Keamanan', emoji: '🛡️' },
  rt_officer: { label: 'Pengurus RT', emoji: '🧑‍💼' },
  other: { label: 'Lainnya', emoji: '📞' },
};

const CATEGORY_OPTIONS = Object.entries(CATEGORY_META).map(([value, meta]) => ({
  value: value as EmergencyContactCategory,
  label: meta.label,
}));

interface FormState {
  id: string | null;
  label: string;
  phone: string;
  category: EmergencyContactCategory;
  description: string;
}

const EMPTY_FORM: FormState = {
  id: null,
  label: '',
  phone: '',
  category: 'other',
  description: '',
};

export function EmergencyContactScreen() {
  const {
    contacts,
    isLoading,
    isError,
    error,
    createContact,
    updateContact,
    deleteContact,
    isMutating,
    mutationError,
  } = useEmergencyContactViewModel();

  const [isAdmin, setIsAdmin] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  // Determine whether the current user may manage contacts.
  useEffect(() => {
    let active = true;
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (active && json?.data?.role) {
          setIsAdmin(ADMIN_ROLES.has(json.data.role));
        }
      })
      .catch(() => {
        /* non-admin fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const startCreate = () => {
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (c: EmergencyContactView) => {
    setForm({
      id: c.id,
      label: c.label,
      phone: c.phone,
      category: c.category,
      description: c.description ?? '',
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      label: form.label,
      phone: form.phone,
      category: form.category,
      description: form.description.trim() || null,
    };
    if (form.id) {
      updateContact(
        { id: form.id, input: payload },
        { onSuccess: () => setShowForm(false) },
      );
    } else {
      createContact(payload, { onSuccess: () => setShowForm(false) });
    }
  };

  const handleDelete = (c: EmergencyContactView) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(`Hapus kontak "${c.label}"?`)
    ) {
      return;
    }
    deleteContact(c.id);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-24 md:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Nomor Darurat
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Nomor penting untuk RT Anda. Ketuk untuk menelepon langsung.
          </p>
        </div>
        {isAdmin && !showForm && (
          <Button variant="primary" onClick={startCreate}>
            + Tambah nomor
          </Button>
        )}
      </div>

      {/* Admin create/edit form */}
      {isAdmin && showForm && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {form.id ? 'Edit nomor' : 'Tambah nomor'}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="label" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Nama
              </label>
              <input
                id="label"
                type="text"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                placeholder="cth. Polsek Terdekat"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="phone" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Nomor telepon
              </label>
              <input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="cth. 110 atau 021-1234567"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="category" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Kategori
              </label>
              <select
                id="category"
                value={form.category}
                onChange={e =>
                  setForm(f => ({
                    ...f,
                    category: e.target.value as EmergencyContactCategory,
                  }))
                }
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              >
                {CATEGORY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="description" className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Keterangan (opsional)
              </label>
              <input
                id="description"
                type="text"
                value={form.description}
                onChange={e =>
                  setForm(f => ({ ...f, description: e.target.value }))
                }
                placeholder="cth. 24 jam"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>

          {mutationError && <ErrorMessage message={mutationError} />}

          <div className="flex gap-2">
            <Button type="submit" variant="primary" loading={isMutating} disabled={isMutating}>
              {form.id ? 'Simpan' : 'Tambah'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Batal
            </Button>
          </div>
        </form>
      )}

      {isError && <ErrorMessage message={error?.message ?? 'Terjadi kesalahan'} />}
      {!showForm && mutationError && <ErrorMessage message={mutationError} />}

      {/* Contact list */}
      {isLoading ? (
        <p className="text-sm text-gray-500">Memuat…</p>
      ) : contacts.length === 0 ? (
        <p className="text-sm text-gray-500">
          Belum ada nomor darurat{isAdmin ? '. Tambahkan dengan tombol di atas.' : '.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map(c => {
            const meta = CATEGORY_META[c.category];
            return (
              <li
                key={c.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-50 text-xl dark:bg-red-900/30">
                    {meta.emoji}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900 dark:text-gray-100">
                      {c.label}
                    </p>
                    <p className="truncate text-sm text-gray-600 dark:text-gray-300">
                      {c.phone}
                    </p>
                    {c.description && (
                      <p className="truncate text-xs text-gray-400">
                        {c.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, '')}`}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-green-600 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-green-700 sm:flex-none"
                    aria-label={`Telepon ${c.label}`}
                  >
                    📞 Panggil
                  </a>
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => startEdit(c)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => handleDelete(c)}>
                        Hapus
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
