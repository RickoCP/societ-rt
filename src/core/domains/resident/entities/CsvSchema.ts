/**
 * CsvSchema — Defines the column schema for resident CSV import/export.
 *
 * @see Requirements 6.1, 6.2
 */

export const CSV_COLUMNS = [
  'household_number',
  'name',
  'nik',
  'date_of_birth',
  'gender',
  'phone',
  'status',
  'categories',
  'emergency_contact_name',
  'emergency_contact_phone',
  'emergency_contact_relationship',
] as const;

export type CsvColumnName = (typeof CSV_COLUMNS)[number];
