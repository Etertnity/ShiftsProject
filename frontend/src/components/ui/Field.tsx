import React from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

/** Подпись + поле + ошибка — единый вид для всех форм. */
const Field: React.FC<FieldProps> = ({ label, htmlFor, required, error, hint, children, className }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="form-label">
      {label}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </label>
    {children}
    {error ? (
      <p className="mt-1 text-sm text-red-600">{error}</p>
    ) : (
      hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>
    )}
  </div>
);

export default Field;
