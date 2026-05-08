'use client';

import { useState } from 'react';
import { Button } from '@components/atoms/Button';
import type { IncidentSeverity, IncidentCategory } from '../viewModel/useIncidentManagementViewModel';

interface CreateInput {
  title: string;
  description: string;
  severity: IncidentSeverity;
  category: IncidentCategory;
  location: string;
  latitude?: number;
  longitude?: number;
}

interface Props {
  onSubmit: (input: CreateInput) => void;
  isSubmitting: boolean;
  error: Error | null;
  onCancel: () => void;
}

export function IncidentCreateForm({ onSubmit, isSubmitting, error, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [category, setCategory] = useState<IncidentCategory>('other');
  const [location, setLocation] = useState('');
  const [useGps, setUseGps] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const handleGetGps = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUseGps(true);
      },
      () => setUseGps(false),
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim() || !location.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      severity,
      category,
      location: location.trim(),
      ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
      <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Report New Incident</h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="inc-title" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
          <input id="inc-title" type="text" value={title} onChange={e => setTitle(e.target.value)} required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
        </div>

        <div>
          <label htmlFor="inc-location" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Location</label>
          <input id="inc-location" type="text" value={location} onChange={e => setLocation(e.target.value)} required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
        </div>

        <div>
          <label htmlFor="inc-severity" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Severity</label>
          <select id="inc-severity" value={severity} onChange={e => setSeverity(e.target.value as IncidentSeverity)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>

        <div>
          <label htmlFor="inc-category" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Category</label>
          <select id="inc-category" value={category} onChange={e => setCategory(e.target.value as IncidentCategory)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
            <option value="theft">Theft</option>
            <option value="vandalism">Vandalism</option>
            <option value="fire">Fire</option>
            <option value="intrusion">Intrusion</option>
            <option value="accident">Accident</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="inc-desc" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Description</label>
          <textarea id="inc-desc" value={description} onChange={e => setDescription(e.target.value)} rows={3} required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
        </div>

        <div className="sm:col-span-2">
          <Button type="button" variant="secondary" size="sm" onClick={handleGetGps}>
            {useGps && coords ? `📍 GPS: ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : '📍 Use GPS Location'}
          </Button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error.message}</p>}

      <div className="mt-4 flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Submitting...' : 'Report Incident'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
