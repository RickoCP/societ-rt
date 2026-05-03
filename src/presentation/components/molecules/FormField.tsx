'use client';

import { useFormContext } from 'react-hook-form';
import { Label } from '../atoms/Label';

export interface FormFieldProps {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function FormField({
  name,
  label,
  required,
  type = 'text',
  placeholder,
  disabled,
  className = '',
}: FormFieldProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext();

  const error = errors[name];
  const errorMessage =
    typeof error?.message === 'string' ? error.message : undefined;
  const fieldId = `field-${name}`;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label htmlFor={fieldId} required={required}>
        {label}
      </Label>
      <input
        id={fieldId}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={errorMessage ? `${fieldId}-error` : undefined}
        className={`rounded-md border px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-100 ${errorMessage ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 dark:border-gray-600'}`}
        {...register(name)}
      />
      {errorMessage && (
        <p
          id={`${fieldId}-error`}
          role="alert"
          className="text-sm text-red-600 dark:text-red-400">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
