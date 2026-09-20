'use client';

import { useEffect, useState } from 'react';

type Fields = { name: string; email: string; inspectionId: string; message: string };
type Errors = Partial<Record<keyof Fields, string>>;

export function ContactForm() {
  const [fields, setFields] = useState<Fields>({ name: '', email: '', inspectionId: '', message: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [sent, setSent] = useState(false);

  // Prefill from dossier fallback: /contact?inspectionId=AF-...
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search);
      const id = q.get('inspectionId') ?? '';
      if (id && /^AF-\d{4}-\d{4,}$/i.test(id.trim())) {
        setFields((f) => (f.inspectionId ? f : { ...f, inspectionId: id.trim().toUpperCase() }));
      }
    } catch {
      /* noop */
    }
  }, []);

  function set<K extends keyof Fields>(k: K, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
  }

  function validate(): Errors {
    const e: Errors = {};
    if (!fields.name.trim()) e.name = 'Name is required.';
    if (!fields.email.trim()) e.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) e.email = 'Enter a valid email.';
    if (!fields.message.trim()) e.message = 'Message is required.';
    else if (fields.message.trim().length < 10) e.message = 'Tell us a little more (10+ characters).';
    if (fields.inspectionId && !/^AF-\d{4}-\d{4,}$/i.test(fields.inspectionId.trim()))
      e.inspectionId = 'Use format AF-2026-008421.';
    return e;
  }

  if (sent) {
    return (
      <div className="border border-teal-line bg-white p-8" role="status">
        <p className="font-mono text-[11px] text-teal-dark">MESSAGE FILED</p>
        <h2 className="mt-2 font-sans text-[22px] font-extrabold text-navy">
          We&apos;ve got your file number.
        </h2>
        <p className="mt-2 font-sans text-[14px] text-muted">
          Thanks {fields.name.trim()}. AutoFair will review and reply within 1 business
          day.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false);
            setFields({ name: '', email: '', inspectionId: '', message: '' });
          }}
          className="mt-4 border border-navy/30 px-5 py-3 font-sans text-[13px] font-bold text-navy"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const v = validate();
        setErrors(v);
        if (Object.keys(v).length === 0) setSent(true);
      }}
      className="border border-line bg-white p-6 md:p-8"
      aria-labelledby="contact-form-title"
    >
      <h2 id="contact-form-title" className="font-sans text-[18px] font-extrabold text-navy">
        Send a message
      </h2>
      <div className="mt-5 space-y-4">
        <Field label="NAME" error={errors.name} htmlFor="cf-name">
          <input
            id="cf-name"
            value={fields.name}
            onChange={(e) => set('name', e.target.value)}
            aria-invalid={!!errors.name}
            className="w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
            autoComplete="name"
          />
        </Field>
        <Field label="EMAIL" error={errors.email} htmlFor="cf-email">
          <input
            id="cf-email"
            type="email"
            value={fields.email}
            onChange={(e) => set('email', e.target.value)}
            aria-invalid={!!errors.email}
            className="w-full border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
            autoComplete="email"
          />
        </Field>
        <Field
          label="INSPECTION ID (OPTIONAL, E.G. AF-2026-008421)"
          error={errors.inspectionId}
          htmlFor="cf-insp"
        >
          <input
            id="cf-insp"
            value={fields.inspectionId}
            onChange={(e) => set('inspectionId', e.target.value)}
            aria-invalid={!!errors.inspectionId}
            placeholder="AF-2026-008421"
            className="w-full border border-line bg-off-white px-4 py-3 font-mono text-[13px] outline-none focus:border-teal"
          />
        </Field>
        <Field label="MESSAGE" error={errors.message} htmlFor="cf-msg">
          <textarea
            id="cf-msg"
            value={fields.message}
            onChange={(e) => set('message', e.target.value)}
            aria-invalid={!!errors.message}
            rows={5}
            className="w-full resize-y border border-line bg-off-white px-4 py-3 font-sans text-[14px] outline-none focus:border-teal"
          />
        </Field>
        <button
          type="submit"
          className="w-full bg-navy px-6 py-4 font-sans text-[14px] font-bold text-white hover:bg-navy-2"
        >
          Send message&nbsp;&nbsp;→
        </button>
        <p className="font-mono text-[10px] leading-relaxed text-muted">
          No spam. No financing or insurance pitches — verification queries only in this
          prototype.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  htmlFor,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="font-mono text-[10px] tracking-[0.06em] text-muted">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && (
        <p role="alert" className="mt-1 font-sans text-[12px] font-semibold text-[#DC2626]">
          {error}
        </p>
      )}
    </div>
  );
}
