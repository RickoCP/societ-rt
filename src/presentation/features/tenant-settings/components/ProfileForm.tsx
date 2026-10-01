'use client';

/**
 * ProfileForm — Form component for editing tenant profile information.
 *
 * Features:
 * - All profile fields (name, rtRwNumber, region, address, contactPerson, etc.)
 * - Logo upload with drag-and-drop and preview
 * - Color pickers for primary/secondary colors
 * - Validation for all required fields and formats
 * - Dirty state tracking for unsaved changes warning
 * - Navigation blocking with unsaved changes dialog
 *
 * @see Requirements 11.5-11.10 (Tenant Settings Profile)
 * @see Design Components > 8. Tenant Settings > 8.2 Profile Form
 */

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type DragEvent,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { Button } from '@presentation/components/atoms/Button';
import { Label } from '@presentation/components/atoms/Label';
import { ConfirmDialog } from '@presentation/components/molecules/ConfirmDialog';
import {
  showSuccessToast,
  showErrorToast,
} from '@infrastructure/stateManagement/toastStore';
import {
  PROFILE_VALIDATION_RULES,
  type UpdateTenantProfileInput,
} from '@core/domains/tenant/entities/TenantProfile';
import type { AppError } from '@core/utils';

// Import TenantProfile type from the ViewModel since that's what the screen provides
import {
  TENANT_SETTINGS_QUERY_KEY,
  type TenantProfile,
} from '../viewModel/useTenantSettingsViewModel';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Indonesian region options for dropdown.
 */
export const REGION_OPTIONS = [
  { value: 'Jakarta Pusat', label: 'Jakarta Pusat' },
  { value: 'Jakarta Utara', label: 'Jakarta Utara' },
  { value: 'Jakarta Barat', label: 'Jakarta Barat' },
  { value: 'Jakarta Selatan', label: 'Jakarta Selatan' },
  { value: 'Jakarta Timur', label: 'Jakarta Timur' },
  { value: 'Kepulauan Seribu', label: 'Kepulauan Seribu' },
  { value: 'Bogor', label: 'Bogor' },
  { value: 'Depok', label: 'Depok' },
  { value: 'Tangerang', label: 'Tangerang' },
  { value: 'Tangerang Selatan', label: 'Tangerang Selatan' },
  { value: 'Bekasi', label: 'Bekasi' },
  { value: 'Bandung', label: 'Bandung' },
  { value: 'Surabaya', label: 'Surabaya' },
  { value: 'Medan', label: 'Medan' },
  { value: 'Semarang', label: 'Semarang' },
  { value: 'Makassar', label: 'Makassar' },
  { value: 'Palembang', label: 'Palembang' },
  { value: 'Yogyakarta', label: 'Yogyakarta' },
  { value: 'Lainnya', label: 'Lainnya' },
] as const;

/**
 * Allowed file types for logo upload.
 */
const ALLOWED_LOGO_TYPES = ['image/jpeg', 'image/png'];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Form field error state.
 */
export interface ProfileFormErrors {
  name?: string;
  rtRwNumber?: string;
  region?: string;
  address?: string;
  contactPerson?: string;
  logo?: string;
  primaryColor?: string;
  secondaryColor?: string;
  contactEmail?: string;
  contactPhone?: string;
}

/**
 * Form field values (editable copy of profile).
 */
export interface ProfileFormValues {
  name: string;
  rtRwNumber: string;
  region: string;
  address: string;
  contactPerson: string;
  logoUrl: string | null;
  logoFile: File | null;
  primaryColor: string;
  secondaryColor: string;
  contactEmail: string;
  contactPhone: string;
}

/**
 * Props for ProfileForm component.
 */
export interface ProfileFormProps {
  /**
   * Current tenant profile data.
   */
  profile: TenantProfile | null;

  /**
   * Whether the form is in loading state (fetching data).
   */
  isLoading?: boolean;

  /**
   * Callback when dirty state changes.
   */
  onDirtyChange?: (isDirty: boolean) => void;

  /**
   * Additional CSS classes.
   */
  className?: string;
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Convert profile to form values.
 */
function profileToFormValues(profile: TenantProfile | null): ProfileFormValues {
  return {
    name: profile?.name ?? '',
    rtRwNumber: profile?.rtRwNumber ?? '',
    region: profile?.region ?? '',
    address: profile?.address ?? '',
    contactPerson: profile?.contactPerson ?? '',
    logoUrl: profile?.logoUrl ?? null,
    logoFile: null,
    primaryColor: profile?.primaryColor ?? '#3B82F6',
    secondaryColor: profile?.secondaryColor ?? '#1E40AF',
    contactEmail: profile?.contactEmail ?? '',
    contactPhone: profile?.contactPhone ?? '',
  };
}

/**
 * Check if form values differ from original profile.
 */
function checkIsDirty(
  values: ProfileFormValues,
  profile: TenantProfile | null
): boolean {
  if (!profile) return false;

  return (
    values.name !== (profile.name ?? '') ||
    values.rtRwNumber !== (profile.rtRwNumber ?? '') ||
    values.region !== (profile.region ?? '') ||
    values.address !== (profile.address ?? '') ||
    values.contactPerson !== (profile.contactPerson ?? '') ||
    values.primaryColor !== (profile.primaryColor ?? '#3B82F6') ||
    values.secondaryColor !== (profile.secondaryColor ?? '#1E40AF') ||
    values.contactEmail !== (profile.contactEmail ?? '') ||
    values.contactPhone !== (profile.contactPhone ?? '') ||
    values.logoFile !== null ||
    (values.logoUrl === null && profile.logoUrl !== null)
  );
}

/**
 * Validate form values and return errors.
 */
function validateForm(
  values: ProfileFormValues,
  t: (key: string, options?: Record<string, unknown>) => string
): ProfileFormErrors {
  const errors: ProfileFormErrors = {};

  // Name
  if (!values.name.trim()) {
    errors.name = t('tenant_settings.profile.name_required');
  } else if (values.name.length > PROFILE_VALIDATION_RULES.name.maxLength) {
    errors.name = t('tenant_settings.profile.name_max_length', {
      max: PROFILE_VALIDATION_RULES.name.maxLength,
    });
  }

  // RT/RW Number
  if (!values.rtRwNumber.trim()) {
    errors.rtRwNumber = t('tenant_settings.profile.rtrw_required');
  } else if (!PROFILE_VALIDATION_RULES.rtRwNumber.pattern.test(values.rtRwNumber)) {
    errors.rtRwNumber = t('tenant_settings.profile.rtrw_invalid_format');
  }

  // Region
  if (!values.region) {
    errors.region = t('tenant_settings.profile.region_required');
  }

  // Address
  if (!values.address.trim()) {
    errors.address = t('tenant_settings.profile.address_required');
  } else if (values.address.length > PROFILE_VALIDATION_RULES.address.maxLength) {
    errors.address = t('tenant_settings.profile.address_max_length', {
      max: PROFILE_VALIDATION_RULES.address.maxLength,
    });
  }

  // Contact Person
  if (!values.contactPerson.trim()) {
    errors.contactPerson = t('tenant_settings.profile.contact_person_required');
  } else if (
    values.contactPerson.length > PROFILE_VALIDATION_RULES.contactPerson.maxLength
  ) {
    errors.contactPerson = t('tenant_settings.profile.contact_person_max_length', {
      max: PROFILE_VALIDATION_RULES.contactPerson.maxLength,
    });
  }

  // Primary Color
  if (
    values.primaryColor &&
    !PROFILE_VALIDATION_RULES.primaryColor.pattern.test(values.primaryColor)
  ) {
    errors.primaryColor = t('tenant_settings.profile.color_invalid_format');
  }

  // Secondary Color
  if (
    values.secondaryColor &&
    !PROFILE_VALIDATION_RULES.secondaryColor.pattern.test(values.secondaryColor)
  ) {
    errors.secondaryColor = t('tenant_settings.profile.color_invalid_format');
  }

  // Contact Email
  if (
    values.contactEmail &&
    !PROFILE_VALIDATION_RULES.contactEmail.pattern.test(values.contactEmail)
  ) {
    errors.contactEmail = t('tenant_settings.profile.email_invalid_format');
  }

  // Contact Phone
  if (
    values.contactPhone &&
    values.contactPhone.length > PROFILE_VALIDATION_RULES.contactPhone.maxLength
  ) {
    errors.contactPhone = t('tenant_settings.profile.phone_max_length', {
      max: PROFILE_VALIDATION_RULES.contactPhone.maxLength,
    });
  }

  return errors;
}

/**
 * Validate logo file.
 */
function validateLogoFile(
  file: File,
  t: (key: string, options?: Record<string, unknown>) => string
): string | null {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return t('tenant_settings.profile.logo_invalid_type');
  }
  if (file.size > MAX_LOGO_SIZE_BYTES) {
    return t('tenant_settings.profile.logo_max_size', {
      max: MAX_LOGO_SIZE_BYTES / (1024 * 1024),
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/**
 * Upload logo file and return URL.
 */
async function uploadLogo(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('logo', file);

  const response = await fetch('/api/admin/tenant/logo', {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      message?: string;
    };
    throw new Error(errorData.message ?? 'Failed to upload logo');
  }

  const json = (await response.json()) as { url: string };
  return json.url;
}

/**
 * Update tenant profile.
 */
async function updateTenantProfile(
  input: UpdateTenantProfileInput
): Promise<TenantProfile> {
  const response = await fetch('/api/admin/tenant/profile', {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
    };
    const error: AppError = {
      type:
        response.status === 400
          ? 'validation'
          : response.status === 403
            ? 'authorization'
            : 'technical',
      code: errorData.code ?? 'PROFILE_UPDATE_ERROR',
      message: errorData.message ?? `Failed to update profile: ${response.status}`,
    };
    throw error;
  }

  const json = (await response.json()) as { data: TenantProfile };
  return json.data;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * ProfileForm — Form for editing tenant profile information.
 *
 * @param props - Component props
 * @returns Profile form component
 *
 * @example
 * ```tsx
 * <ProfileForm
 *   profile={vm.profile}
 *   isLoading={vm.isLoading}
 *   onDirtyChange={vm.setProfileDirty}
 * />
 * ```
 */
export function ProfileForm({
  profile,
  isLoading = false,
  onDirtyChange,
  className = '',
}: ProfileFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------------------
  // Form State
  // ---------------------------------------------------------------------------

  const [values, setValues] = useState<ProfileFormValues>(() =>
    profileToFormValues(profile)
  );
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [logoPreview, setLogoPreview] = useState<string | null>(
    profile?.logoUrl ?? null
  );
  const [isDragOver, setIsDragOver] = useState(false);

  // Unsaved changes confirmation dialog
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(
    null
  );

  // ---------------------------------------------------------------------------
  // Dirty State
  // ---------------------------------------------------------------------------

  const isDirty = useMemo(
    () => checkIsDirty(values, profile),
    [values, profile]
  );

  // Notify parent of dirty state changes
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Reset form when profile changes (e.g., after successful save)
  useEffect(() => {
    setValues(profileToFormValues(profile));
    setLogoPreview(profile?.logoUrl ?? null);
    setErrors({});
    setTouched({});
  }, [profile]);

  // ---------------------------------------------------------------------------
  // Navigation Blocking
  // ---------------------------------------------------------------------------

  // Block browser navigation (refresh, close tab) with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);

  // ---------------------------------------------------------------------------
  // Mutation
  // ---------------------------------------------------------------------------

  const mutation = useMutation<TenantProfile, AppError, UpdateTenantProfileInput>({
    mutationFn: updateTenantProfile,
    onSuccess: () => {
      showSuccessToast(t('tenant_settings.profile.saved'));
      queryClient.invalidateQueries({ queryKey: [TENANT_SETTINGS_QUERY_KEY] });
    },
    onError: (error: AppError) => {
      // Use user-safe message only, do not expose technical details (error.message)
      // @see 12-error-handling steering: userMessage vs internal message
      showErrorToast(error.userMessage ?? t('tenant_settings.profile.save_error'));
    },
  });

  const isSaving = mutation.isPending;

  // ---------------------------------------------------------------------------
  // Form Validation
  // ---------------------------------------------------------------------------

  const isFormValid = useMemo(() => {
    const validationErrors = validateForm(values, t);
    return Object.keys(validationErrors).length === 0;
  }, [values, t]);

  const canSubmit = isDirty && isFormValid && !isSaving;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleFieldChange = useCallback(
    (field: keyof ProfileFormValues, value: string | null) => {
      setValues(prev => ({ ...prev, [field]: value }));

      // Clear field error on change
      if (errors[field as keyof ProfileFormErrors]) {
        setErrors(prev => {
          const next = { ...prev };
          delete next[field as keyof ProfileFormErrors];
          return next;
        });
      }
    },
    [errors]
  );

  const handleFieldBlur = useCallback(
    (field: keyof ProfileFormValues) => {
      setTouched(prev => ({ ...prev, [field]: true }));

      // Validate single field on blur
      const fieldErrors = validateForm(values, t);
      if (fieldErrors[field as keyof ProfileFormErrors]) {
        setErrors(prev => ({
          ...prev,
          [field]: fieldErrors[field as keyof ProfileFormErrors],
        }));
      }
    },
    [values, t]
  );

  // ---------------------------------------------------------------------------
  // Logo Upload Handlers
  // ---------------------------------------------------------------------------

  const handleLogoSelect = useCallback(
    (file: File) => {
      const validationError = validateLogoFile(file, t);
      if (validationError) {
        setErrors(prev => ({ ...prev, logo: validationError }));
        return;
      }

      // Clear any previous logo error
      setErrors(prev => {
        const next = { ...prev };
        delete next.logo;
        return next;
      });

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      setValues(prev => ({ ...prev, logoFile: file }));
    },
    [t]
  );

  const handleLogoFileChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleLogoSelect(file);
      }
    },
    [handleLogoSelect]
  );

  const handleLogoDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleLogoDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleLogoDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleLogoSelect(file);
      }
    },
    [handleLogoSelect]
  );

  const handleLogoRemove = useCallback(() => {
    setLogoPreview(null);
    setValues(prev => ({ ...prev, logoUrl: null, logoFile: null }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleLogoClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ---------------------------------------------------------------------------
  // Form Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      // Validate all fields
      const validationErrors = validateForm(values, t);
      setErrors(validationErrors);

      // Mark all fields as touched
      setTouched({
        name: true,
        rtRwNumber: true,
        region: true,
        address: true,
        contactPerson: true,
        contactEmail: true,
        contactPhone: true,
      });

      if (Object.keys(validationErrors).length > 0) {
        return;
      }

      try {
        // Upload logo first if there's a new file
        let logoUrl = values.logoUrl;
        if (values.logoFile) {
          logoUrl = await uploadLogo(values.logoFile);
        }

        // Build update input
        const input: UpdateTenantProfileInput = {
          name: values.name,
          rtRwNumber: values.rtRwNumber,
          region: values.region,
          address: values.address,
          contactPerson: values.contactPerson,
          logoUrl,
          primaryColor: values.primaryColor || null,
          secondaryColor: values.secondaryColor || null,
          contactEmail: values.contactEmail || null,
          contactPhone: values.contactPhone || null,
        };

        await mutation.mutateAsync(input);
      } catch (error) {
        // Error handling done in mutation onError
        console.error('Profile save error:', error);
      }
    },
    [values, t, mutation]
  );

  // ---------------------------------------------------------------------------
  // Reset / Cancel
  // ---------------------------------------------------------------------------

  const handleReset = useCallback(() => {
    setValues(profileToFormValues(profile));
    setLogoPreview(profile?.logoUrl ?? null);
    setErrors({});
    setTouched({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [profile]);

  const handleCancel = useCallback(() => {
    if (isDirty) {
      setShowUnsavedDialog(true);
      setPendingNavigation(() => handleReset);
    } else {
      handleReset();
    }
  }, [isDirty, handleReset]);

  // ---------------------------------------------------------------------------
  // Unsaved Changes Dialog
  // ---------------------------------------------------------------------------

  const handleUnsavedDialogConfirm = useCallback(() => {
    setShowUnsavedDialog(false);
    pendingNavigation?.();
    setPendingNavigation(null);
  }, [pendingNavigation]);

  const handleUnsavedDialogCancel = useCallback(() => {
    setShowUnsavedDialog(false);
    setPendingNavigation(null);
  }, []);

  // ---------------------------------------------------------------------------
  // Loading State
  // ---------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className={`animate-pulse space-y-6 ${className}`}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Skeleton for form fields */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-24 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-10 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={`space-y-6 ${className}`}
        noValidate
      >
        {/* Two-column layout for desktop */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Tenant Name */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-name" required>
              {t('tenant_settings.profile.name_label')}
            </Label>
            <input
              id="profile-name"
              type="text"
              value={values.name}
              onChange={e => handleFieldChange('name', e.target.value)}
              onBlur={() => handleFieldBlur('name')}
              disabled={isSaving}
              maxLength={PROFILE_VALIDATION_RULES.name.maxLength}
              placeholder={t('tenant_settings.profile.name_placeholder')}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
              className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${
                errors.name && touched.name
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.name && touched.name && (
              <p id="profile-name-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.name}
              </p>
            )}
          </div>

          {/* RT/RW Number */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-rtrw" required>
              {t('tenant_settings.profile.rtrw_label')}
            </Label>
            <input
              id="profile-rtrw"
              type="text"
              value={values.rtRwNumber}
              onChange={e => handleFieldChange('rtRwNumber', e.target.value.toUpperCase())}
              onBlur={() => handleFieldBlur('rtRwNumber')}
              disabled={isSaving}
              placeholder={t('tenant_settings.profile.rtrw_placeholder')}
              aria-invalid={!!errors.rtRwNumber}
              aria-describedby={errors.rtRwNumber ? 'profile-rtrw-error' : undefined}
              className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${
                errors.rtRwNumber && touched.rtRwNumber
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.rtRwNumber && touched.rtRwNumber && (
              <p id="profile-rtrw-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.rtRwNumber}
              </p>
            )}
          </div>

          {/* Region */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-region" required>
              {t('tenant_settings.profile.region_label')}
            </Label>
            <select
              id="profile-region"
              value={values.region}
              onChange={e => handleFieldChange('region', e.target.value)}
              onBlur={() => handleFieldBlur('region')}
              disabled={isSaving}
              aria-invalid={!!errors.region}
              aria-describedby={errors.region ? 'profile-region-error' : undefined}
              className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${
                errors.region && touched.region
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              <option value="">{t('tenant_settings.profile.region_placeholder')}</option>
              {REGION_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.region && touched.region && (
              <p id="profile-region-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.region}
              </p>
            )}
          </div>

          {/* Contact Person */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-contact-person" required>
              {t('tenant_settings.profile.contact_person_label')}
            </Label>
            <input
              id="profile-contact-person"
              type="text"
              value={values.contactPerson}
              onChange={e => handleFieldChange('contactPerson', e.target.value)}
              onBlur={() => handleFieldBlur('contactPerson')}
              disabled={isSaving}
              maxLength={PROFILE_VALIDATION_RULES.contactPerson.maxLength}
              placeholder={t('tenant_settings.profile.contact_person_placeholder')}
              aria-invalid={!!errors.contactPerson}
              aria-describedby={errors.contactPerson ? 'profile-contact-person-error' : undefined}
              className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${
                errors.contactPerson && touched.contactPerson
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.contactPerson && touched.contactPerson && (
              <p id="profile-contact-person-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.contactPerson}
              </p>
            )}
          </div>

          {/* Contact Email */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-contact-email">
              {t('tenant_settings.profile.contact_email_label')}
            </Label>
            <input
              id="profile-contact-email"
              type="email"
              value={values.contactEmail}
              onChange={e => handleFieldChange('contactEmail', e.target.value)}
              onBlur={() => handleFieldBlur('contactEmail')}
              disabled={isSaving}
              placeholder={t('tenant_settings.profile.contact_email_placeholder')}
              aria-invalid={!!errors.contactEmail}
              aria-describedby={errors.contactEmail ? 'profile-contact-email-error' : undefined}
              className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${
                errors.contactEmail && touched.contactEmail
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.contactEmail && touched.contactEmail && (
              <p id="profile-contact-email-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.contactEmail}
              </p>
            )}
          </div>

          {/* Contact Phone */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-contact-phone">
              {t('tenant_settings.profile.contact_phone_label')}
            </Label>
            <input
              id="profile-contact-phone"
              type="tel"
              value={values.contactPhone}
              onChange={e => handleFieldChange('contactPhone', e.target.value)}
              onBlur={() => handleFieldBlur('contactPhone')}
              disabled={isSaving}
              maxLength={PROFILE_VALIDATION_RULES.contactPhone.maxLength}
              placeholder={t('tenant_settings.profile.contact_phone_placeholder')}
              aria-invalid={!!errors.contactPhone}
              aria-describedby={errors.contactPhone ? 'profile-contact-phone-error' : undefined}
              className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${
                errors.contactPhone && touched.contactPhone
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 dark:border-gray-600'
              }`}
            />
            {errors.contactPhone && touched.contactPhone && (
              <p id="profile-contact-phone-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.contactPhone}
              </p>
            )}
          </div>
        </div>

        {/* Address - Full width */}
        <div className="space-y-1.5">
          <Label htmlFor="profile-address" required>
            {t('tenant_settings.profile.address_label')}
          </Label>
          <textarea
            id="profile-address"
            value={values.address}
            onChange={e => handleFieldChange('address', e.target.value)}
            onBlur={() => handleFieldBlur('address')}
            disabled={isSaving}
            rows={3}
            maxLength={PROFILE_VALIDATION_RULES.address.maxLength}
            placeholder={t('tenant_settings.profile.address_placeholder')}
            aria-invalid={!!errors.address}
            aria-describedby={errors.address ? 'profile-address-error' : undefined}
            className={`w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 resize-none ${
              errors.address && touched.address
                ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                : 'border-gray-300 dark:border-gray-600'
            }`}
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            {errors.address && touched.address ? (
              <p id="profile-address-error" role="alert" className="text-red-600 dark:text-red-400">
                {errors.address}
              </p>
            ) : (
              <span />
            )}
            <span>
              {values.address.length}/{PROFILE_VALIDATION_RULES.address.maxLength}
            </span>
          </div>
        </div>

        {/* Logo Upload */}
        <div className="space-y-1.5">
          <Label htmlFor="profile-logo">
            {t('tenant_settings.profile.logo_label')}
          </Label>
          <div
            role="button"
            tabIndex={0}
            onClick={handleLogoClick}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleLogoClick();
              }
            }}
            onDragOver={handleLogoDragOver}
            onDragLeave={handleLogoDragLeave}
            onDrop={handleLogoDrop}
            className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer ${
              isDragOver
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : errors.logo
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                  : 'border-gray-300 hover:border-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
            }`}
          >
            {logoPreview ? (
              <div className="flex flex-col items-center gap-4">
                <img
                  src={logoPreview}
                  alt={t('tenant_settings.profile.logo_preview_alt')}
                  className="h-24 w-24 rounded-lg object-contain border border-gray-200 dark:border-gray-700"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleLogoClick();
                    }}
                    disabled={isSaving}
                  >
                    {t('tenant_settings.profile.logo_change')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={e => {
                      e.stopPropagation();
                      handleLogoRemove();
                    }}
                    disabled={isSaving}
                  >
                    {t('tenant_settings.profile.logo_remove')}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <svg
                  className="mb-2 h-10 w-10 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('tenant_settings.profile.logo_drag_drop')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {t('tenant_settings.profile.logo_hint')}
                </p>
              </>
            )}
            <input
              ref={fileInputRef}
              id="profile-logo"
              type="file"
              accept={ALLOWED_LOGO_TYPES.join(',')}
              onChange={handleLogoFileChange}
              disabled={isSaving}
              className="sr-only"
            />
          </div>
          {errors.logo && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {errors.logo}
            </p>
          )}
        </div>

        {/* Color Pickers */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Primary Color */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-primary-color">
              {t('tenant_settings.profile.primary_color_label')}
            </Label>
            <div className="flex gap-3">
              <input
                type="color"
                value={values.primaryColor || '#3B82F6'}
                onChange={e => handleFieldChange('primaryColor', e.target.value)}
                disabled={isSaving}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300 p-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
              />
              <input
                id="profile-primary-color"
                type="text"
                value={values.primaryColor}
                onChange={e => handleFieldChange('primaryColor', e.target.value)}
                disabled={isSaving}
                placeholder="#3B82F6"
                aria-invalid={!!errors.primaryColor}
                aria-describedby={errors.primaryColor ? 'profile-primary-color-error' : undefined}
                className={`flex-1 rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 font-mono ${
                  errors.primaryColor
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              <div
                className="h-10 w-10 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: values.primaryColor || '#3B82F6' }}
                aria-hidden
              />
            </div>
            {errors.primaryColor && (
              <p id="profile-primary-color-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.primaryColor}
              </p>
            )}
          </div>

          {/* Secondary Color */}
          <div className="space-y-1.5">
            <Label htmlFor="profile-secondary-color">
              {t('tenant_settings.profile.secondary_color_label')}
            </Label>
            <div className="flex gap-3">
              <input
                type="color"
                value={values.secondaryColor || '#1E40AF'}
                onChange={e => handleFieldChange('secondaryColor', e.target.value)}
                disabled={isSaving}
                className="h-10 w-14 cursor-pointer rounded border border-gray-300 p-1 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600"
              />
              <input
                id="profile-secondary-color"
                type="text"
                value={values.secondaryColor}
                onChange={e => handleFieldChange('secondaryColor', e.target.value)}
                disabled={isSaving}
                placeholder="#1E40AF"
                aria-invalid={!!errors.secondaryColor}
                aria-describedby={errors.secondaryColor ? 'profile-secondary-color-error' : undefined}
                className={`flex-1 rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 font-mono ${
                  errors.secondaryColor
                    ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              <div
                className="h-10 w-10 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: values.secondaryColor || '#1E40AF' }}
                aria-hidden
              />
            </div>
            {errors.secondaryColor && (
              <p id="profile-secondary-color-error" role="alert" className="text-sm text-red-600 dark:text-red-400">
                {errors.secondaryColor}
              </p>
            )}
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-6 dark:border-gray-700">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSaving}
          >
            {isDirty ? t('common.cancel') : t('common.reset')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            loading={isSaving}
            disabled={!canSubmit}
          >
            {t('common.save')}
          </Button>
        </div>
      </form>

      {/* Unsaved Changes Confirmation Dialog */}
      <ConfirmDialog
        open={showUnsavedDialog}
        title={t('tenant_settings.profile.unsaved_changes_title')}
        description={t('tenant_settings.profile.unsaved_changes_description')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.stay')}
        variant="danger"
        onConfirm={handleUnsavedDialogConfirm}
        onCancel={handleUnsavedDialogCancel}
      />
    </>
  );
}

export default ProfileForm;
