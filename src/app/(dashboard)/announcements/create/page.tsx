'use client';

export default function CreateAnnouncementPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Create Announcement
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Announcement form with file attachment upload (max 5 files, max 10MB each) will be implemented here.
      </p>
    </div>
  );
}
