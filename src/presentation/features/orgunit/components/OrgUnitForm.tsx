'use client';

/**
 * OrgUnitForm — Modal/drawer component for creating and editing OrgUnits.
 *
 * Features:
 * - Create mode: name and type fields
 * - Edit mode: name field only (type is immutable after creation per Requirement 8.8)
 * - Type dropdown filtered by parent type (ORGUNIT_TYPE_HIERARCHY)
 * - Client-side validation for required fields
 * - Success/error toasts with i18n keys
 *
 * @see Requirements 8.1-8.8 (OrgUnit CRUD Operations)
 * @see Design Components > 6. OrgUnit Hierarchy Tree > 6.3 OrgUnit Form
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  OrgUnitType,
  getValidChildTypes,
  isLeafType,
} from '@core/domains/orgunit/types';
import type { OrgUnit } from '@core/domains/orgunit/entities/OrgUnit';
import { showSuccessToast, showErrorToast } from '@infrastructure/stateManagement/toastStore';
import { Button } from '@presentation/components/atoms/Button';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Mode of the OrgUnitForm.
 * - 'create': For creating new OrgUnits (shows name and type fields)
 * - 'edit': For editing existing OrgUnits (shows name field only, type is immutable)
 */
export type OrgUnitFormMode = 'create' | 'edit';

/**
 * Data for creating a new OrgUnit.
 */
export interface CreateOrgUnitData {
  /** Name for the new OrgUnit (required) */
  name: string;
  /** Type for the new OrgUnit (required, must be valid child type of parent) */
  type: OrgUnitType;
}

/**
 * Data for updating an existing OrgUnit.
 */
export interface UpdateOrgUnitData {
  /** New name for the OrgUnit (required) */
  name: string;
}

/**
 * Props for the OrgUnitForm component.
 */
export interface OrgUnitFormProps {
  /**
   * Whether the form modal/drawer is open.
   */
  isOpen: boolean;

  /**
   * Callback when the form should close.
   */
  onClose: () => void;

  /**
   * Mode of the form: 'create' or 'edit'.
   */
  mode: OrgUnitFormMode;

  /**
   * The parent OrgUnit (required for 'create' mode).
   * Used to determine valid child types via ORGUNIT_TYPE_HIERARCHY.
   */
  parentOrgUnit?: OrgUnit | null;

  /**
   * The OrgUnit being edited (required for 'edit' mode).
   */
  editingOrgUnit?: OrgUnit | null;

  /**
   * Callback when a new OrgUnit is successfully created.
   *
   * @param data - The create data (name and type)
   * @returns Promise that resolves when creation is complete
   */
  onCreateSubmit?: (data: CreateOrgUnitData) => Promise<void>;

  /**
   * Callback when an OrgUnit is successfully updated.
   *
   * @param data - The update data (name only)
   * @returns Promise that resolves when update is complete
   */
  onEditSubmit?: (data: UpdateOrgUnitData) => Promise<void>;

  /**
   * Optional callback after successful creation (for tree refresh, etc.).
   */
  onCreateSuccess?: () => void;

  /**
   * Optional callback after successful edit (for tree refresh, etc.).
   */
  onEditSuccess?: () => void;

  /**
   * Whether form is submitting (can be controlled externally).
   */
  isSubmitting?: boolean;

  /**
   * CSS class name for the container.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validation error state for the form.
 */
interface FormValidationErrors {
  name?: string;
  type?: string;
}

/**
 * Validates the form data and returns validation errors.
 *
 * @param mode - The form mode
 * @param name - The name input
 * @param type - The type input (for create mode)
 * @param t - Translation function
 * @returns Validation errors object (empty if valid)
 */
function validateForm(
  mode: OrgUnitFormMode,
  name: string,
  type: OrgUnitType | null,
  t: (key: string) => string,
): FormValidationErrors {
  const errors: FormValidationErrors = {};

  // Name validation (required for both modes)
  if (!name || name.trim().length === 0) {
    errors.name = t('orgunit.form.name_required');
  } else if (name.trim().length > 100) {
    errors.name = t('orgunit.form.name_too_long');
  }

  // Type validation (required for create mode only)
  if (mode === 'create' && !type) {
    errors.type = t('orgunit.form.type_required');
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Helper Components
// ---------------------------------------------------------------------------

/**
 * Get the display label for an OrgUnit type.
 *
 * @param type - OrgUnit type
 * @param t - Translation function
 * @returns Translated type label
 */
function getTypeLabel(type: OrgUnitType, t: (key: string) => string): string {
  const labels: Record<OrgUnitType, string> = {
    [OrgUnitType.ORGANIZATION]: t('orgunit.type.organization'),
    [OrgUnitType.CLUSTER]: t('orgunit.type.cluster'),
    [OrgUnitType.RW]: t('orgunit.type.rw'),
    [OrgUnitType.RT]: t('orgunit.type.rt'),
  };
  return labels[type] ?? type;
}

/**
 * Form field wrapper with label and error display.
 */
function FormField({
  label,
  required,
  error,
  children,
  htmlFor,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300"
      >
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * OrgUnitForm — Form component for creating and editing OrgUnits.
 *
 * CREATE MODE:
 * - Displays name field (required)
 * - Displays type dropdown filtered by parent type (ORGUNIT_TYPE_HIERARCHY)
 * - Type is auto-suggested based on parent type (first valid child type)
 *
 * EDIT MODE:
 * - Displays name field only (required)
 * - Type is shown as read-only (immutable after creation per Requirement 8.8)
 *
 * @example
 * ```tsx
 * // Create mode
 * <OrgUnitForm
 *   isOpen={isCreateOpen}
 *   onClose={() => setIsCreateOpen(false)}
 *   mode="create"
 *   parentOrgUnit={selectedParent}
 *   onCreateSubmit={handleCreate}
 *   onCreateSuccess={() => refetchTree()}
 * />
 *
 * // Edit mode
 * <OrgUnitForm
 *   isOpen={isEditOpen}
 *   onClose={() => setIsEditOpen(false)}
 *   mode="edit"
 *   editingOrgUnit={selectedOrgUnit}
 *   onEditSubmit={handleEdit}
 *   onEditSuccess={() => refetchTree()}
 * />
 * ```
 *
 * @see Requirements 8.1-8.8
 */
export function OrgUnitForm({
  isOpen,
  onClose,
  mode,
  parentOrgUnit,
  editingOrgUnit,
  onCreateSubmit,
  onEditSubmit,
  onCreateSuccess,
  onEditSuccess,
  isSubmitting: externalIsSubmitting,
  className = '',
}: OrgUnitFormProps) {
  const { t } = useTranslation();

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------

  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<OrgUnitType | null>(null);
  const [errors, setErrors] = useState<FormValidationErrors>({});
  const [touched, setTouched] = useState({ name: false, type: false });

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  /**
   * Available child types based on parent type (for create mode).
   * Filtered via ORGUNIT_TYPE_HIERARCHY.
   *
   * @see Requirements 8.3 (Type dropdown filtering)
   */
  const availableTypes = useMemo((): readonly OrgUnitType[] => {
    if (mode !== 'create' || !parentOrgUnit) {
      return [];
    }
    return getValidChildTypes(parentOrgUnit.type);
  }, [mode, parentOrgUnit]);

  /**
   * Whether the parent can have children (for create mode).
   * RT is a leaf type and cannot have children.
   */
  const parentCanHaveChildren = useMemo((): boolean => {
    if (mode !== 'create' || !parentOrgUnit) {
      return false;
    }
    return !isLeafType(parentOrgUnit.type);
  }, [mode, parentOrgUnit]);

  /**
   * The form title based on mode.
   */
  const formTitle = useMemo((): string => {
    if (mode === 'create') {
      return t('orgunit.form.create_title');
    }
    return t('orgunit.form.edit_title');
  }, [mode, t]);

  /**
   * The submit button text based on mode and submitting state.
   */
  const submitButtonText = useMemo((): string => {
    if (externalIsSubmitting) {
      return t('common.saving');
    }
    if (mode === 'create') {
      return t('orgunit.form.create_button');
    }
    return t('orgunit.form.save_button');
  }, [mode, externalIsSubmitting, t]);

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  /**
   * Initialize form state when modal opens.
   * - Create mode: reset to empty, auto-select first valid child type
   * - Edit mode: populate with existing OrgUnit data
   */
  useEffect(() => {
    if (!isOpen) return;

    if (mode === 'create') {
      // Reset form for create mode
      setName('');
      setErrors({});
      setTouched({ name: false, type: false });

      // Auto-select first valid child type based on parent
      const validTypes = parentOrgUnit ? getValidChildTypes(parentOrgUnit.type) : [];
      setSelectedType(validTypes.length > 0 ? validTypes[0] : null);
    } else if (mode === 'edit' && editingOrgUnit) {
      // Populate form for edit mode
      setName(editingOrgUnit.name);
      setSelectedType(editingOrgUnit.type);
      setErrors({});
      setTouched({ name: false, type: false });
    }
  }, [isOpen, mode, parentOrgUnit, editingOrgUnit]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle name input change.
   */
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (touched.name) {
      // Clear error when user starts typing
      setErrors(prev => ({ ...prev, name: undefined }));
    }
  }, [touched.name]);

  /**
   * Handle name input blur (mark as touched for validation).
   */
  const handleNameBlur = useCallback(() => {
    setTouched(prev => ({ ...prev, name: true }));
    const validationErrors = validateForm(mode, name, selectedType, t);
    if (validationErrors.name) {
      setErrors(prev => ({ ...prev, name: validationErrors.name }));
    }
  }, [mode, name, selectedType, t]);

  /**
   * Handle type dropdown change.
   */
  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value as OrgUnitType;
    setSelectedType(value || null);
    if (touched.type) {
      setErrors(prev => ({ ...prev, type: undefined }));
    }
  }, [touched.type]);

  /**
   * Handle type dropdown blur (mark as touched for validation).
   */
  const handleTypeBlur = useCallback(() => {
    setTouched(prev => ({ ...prev, type: true }));
    const validationErrors = validateForm(mode, name, selectedType, t);
    if (validationErrors.type) {
      setErrors(prev => ({ ...prev, type: validationErrors.type }));
    }
  }, [mode, name, selectedType, t]);

  /**
   * Handle backdrop click to close (if not submitting).
   */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget && !externalIsSubmitting) {
        onClose();
      }
    },
    [externalIsSubmitting, onClose],
  );

  /**
   * Handle form submission.
   */
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      // Validate all fields
      const validationErrors = validateForm(mode, name, selectedType, t);
      setErrors(validationErrors);
      setTouched({ name: true, type: true });

      // If validation errors, don't submit
      if (Object.keys(validationErrors).length > 0) {
        return;
      }

      try {
        if (mode === 'create') {
          if (!onCreateSubmit || !selectedType) {
            return;
          }

          await onCreateSubmit({
            name: name.trim(),
            type: selectedType,
          });

          // Show success toast
          showSuccessToast(t('orgunit.form.create_success'));

          // Callback for tree refresh
          onCreateSuccess?.();

          // Close form
          onClose();
        } else if (mode === 'edit') {
          if (!onEditSubmit) {
            return;
          }

          await onEditSubmit({
            name: name.trim(),
          });

          // Show success toast
          showSuccessToast(t('orgunit.form.edit_success'));

          // Callback for tree refresh
          onEditSuccess?.();

          // Close form
          onClose();
        }
      } catch (error) {
        // Show generic error toast - do not expose technical error details
        // The actual error is logged in the repository layer
        showErrorToast(t('orgunit.form.save_error'));
      }
    },
    [
      mode,
      name,
      selectedType,
      t,
      onCreateSubmit,
      onEditSubmit,
      onCreateSuccess,
      onEditSuccess,
      onClose,
    ],
  );

  /**
   * Handle escape key to close modal.
   */
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !externalIsSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, externalIsSubmitting, onClose]);

  // ---------------------------------------------------------------------------
  // Early Return - Not Open
  // ---------------------------------------------------------------------------

  if (!isOpen) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Early Return - Invalid Create Mode Configuration
  // ---------------------------------------------------------------------------

  if (mode === 'create' && !parentCanHaveChildren) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby="orgunit-form-title"
      >
        <div
          className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 ${className}`}
          role="document"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2
              id="orgunit-form-title"
              className="text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              {formTitle}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              aria-label={t('common.close')}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>

          {/* Error Message */}
          <div className="px-6 py-4">
            <div className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <svg
                className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-300">
                {t('orgunit.form.parent_cannot_have_children', {
                  type: parentOrgUnit ? getTypeLabel(parentOrgUnit.type, t) : '',
                })}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <Button variant="secondary" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="orgunit-form-title"
    >
      <div
        className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4 ${className}`}
        role="document"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2
            id="orgunit-form-title"
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            {formTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label={t('common.close')}
            disabled={externalIsSubmitting}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Parent Info (Create Mode) */}
        {mode === 'create' && parentOrgUnit && (
          <div className="px-6 pt-4">
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <svg
                className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {t('orgunit.form.creating_under', {
                  parentName: parentOrgUnit.name,
                  parentType: getTypeLabel(parentOrgUnit.type, t),
                })}
              </p>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className="px-6 py-4 space-y-4">
            {/* Name Field */}
            <FormField
              label={t('orgunit.form.name_label')}
              required
              error={errors.name}
              htmlFor="orgunit-name"
            >
              <input
                id="orgunit-name"
                type="text"
                value={name}
                onChange={handleNameChange}
                onBlur={handleNameBlur}
                placeholder={t('orgunit.form.name_placeholder')}
                maxLength={100}
                className={`mt-1 block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400 ${
                  errors.name
                    ? 'border-red-300 dark:border-red-600'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                disabled={externalIsSubmitting}
                autoFocus
              />
            </FormField>

            {/* Type Field (Create Mode Only) */}
            {mode === 'create' && (
              <FormField
                label={t('orgunit.form.type_label')}
                required
                error={errors.type}
                htmlFor="orgunit-type"
              >
                <select
                  id="orgunit-type"
                  value={selectedType ?? ''}
                  onChange={handleTypeChange}
                  onBlur={handleTypeBlur}
                  className={`mt-1 block w-full rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm dark:bg-gray-700 dark:text-gray-100 ${
                    errors.type
                      ? 'border-red-300 dark:border-red-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  disabled={externalIsSubmitting || availableTypes.length === 0}
                >
                  <option value="">{t('orgunit.form.type_placeholder')}</option>
                  {availableTypes.map(type => (
                    <option key={type} value={type}>
                      {getTypeLabel(type, t)}
                    </option>
                  ))}
                </select>
                {availableTypes.length === 1 && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('orgunit.form.type_auto_selected', {
                      type: getTypeLabel(availableTypes[0], t),
                    })}
                  </p>
                )}
              </FormField>
            )}

            {/* Type Display (Edit Mode - Read Only) */}
            {mode === 'edit' && editingOrgUnit && (
              <FormField
                label={t('orgunit.form.type_label')}
                required={false}
                htmlFor="orgunit-type-display"
              >
                <div className="mt-1 flex items-center gap-2">
                  <span
                    id="orgunit-type-display"
                    className="text-sm text-gray-900 dark:text-gray-100 font-medium"
                  >
                    {getTypeLabel(editingOrgUnit.type, t)}
                  </span>
                  <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {t('orgunit.form.type_immutable')}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('orgunit.form.type_immutable_hint')}
                </p>
              </FormField>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={externalIsSubmitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={externalIsSubmitting}
              loading={externalIsSubmitting}
            >
              {submitButtonText}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default OrgUnitForm;
