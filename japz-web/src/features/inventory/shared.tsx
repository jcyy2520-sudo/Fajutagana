import {
  cloneElement,
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
  type FormEvent,
} from "react";
import { X, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { errorMessage } from "./data";
export function Header({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="inv-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="inv-actions">{children}</div>
    </header>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`inv-notice ${error ? "inv-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="inv-empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Badge({
  children,
  status = "",
}: {
  children: ReactNode;
  status?: string;
}) {
  return (
    <span
      className={`inv-badge ${["out", "unavailable", "stale", "expired", "rejected"].includes(status) ? "inv-badge-alert" : ["low", "pending", "hold"].includes(status) ? "inv-badge-warning" : ""}`}
    >
      {children}
    </span>
  );
}
export function Field({
  label,
  hint,
  children,
  wide = false,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const fieldId = useId();
  const bindControl = (nodes: ReactNode): ReactNode =>
    Children.map(nodes, (child) => {
      if (!isValidElement(child)) return child;
      const element = child as ReactElement<Record<string, unknown>>;
      if (
        ["input", "select", "textarea"].includes(String(element.type))
      ) {
        return cloneElement(element, {
          id: fieldId,
          ...(element.props["aria-label"]
            ? {}
            : { "aria-labelledby": `${fieldId}-label` }),
          "aria-describedby": hint ? `${fieldId}-hint` : undefined,
        });
      }
      if (typeof element.type === "string" && element.props.children)
        return cloneElement(element, {
          children: bindControl(element.props.children as ReactNode),
        });
      return element;
    });
  const control = bindControl(children);
  return (
    <label
      htmlFor={fieldId}
      className={`inv-field ${wide ? "inv-field-wide" : ""}`}
    >
      <span id={`${fieldId}-label`}>{label}</span>
      {control}
      {hint && <small id={`${fieldId}-hint`}>{hint}</small>}
    </label>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="inv-search">
      <Search size={18} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
export function Table<T>({
  columns,
  rows,
  rowKey,
  empty = "No records found",
}: {
  columns: {
    title: string;
    render: (row: T) => ReactNode;
    className?: string;
  }[];
  rows: T[];
  rowKey: (row: T) => string | number;
  empty?: string;
}) {
  if (!rows.length) return <Empty title={empty} />;
  return (
    <div className="inv-table-wrap">
      <table className="inv-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.title}>{column.title}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.title}
                  data-label={column.title}
                  className={column.className}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  total,
  size,
  current,
  pages,
  setPage,
}: {
  total: number;
  size: number;
  current: number;
  pages: number;
  setPage: (page: number) => void;
}) {
  return (
    <div className="inv-pagination">
      <span>
        {total ? (current - 1) * size + 1 : 0}–{Math.min(current * size, total)}{" "}
        of {total}
      </span>
      <div>
        <button
          type="button"
          aria-label="Previous page"
          disabled={current === 1}
          onClick={() => setPage(current - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          {current} / {pages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          disabled={current === pages}
          onClick={() => setPage(current + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
export function Dialog({
  title,
  description,
  children,
  onClose,
  onSubmit,
  submitLabel = "Save",
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => Promise<void>;
  submitLabel?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    descriptionId = useId();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!busyRef.current) closeRef.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      previous?.focus();
    };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!onSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className={`inv-dialog ${wide ? "inv-dialog-wide" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p id={descriptionId}>{description}</p>}
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} />
          </button>
        </header>
        <div className="inv-dialog-body">
          {error && <Notice error>{error}</Notice>}
          {children}
        </div>
        <footer>
          <button type="button" onClick={onClose} disabled={busy}>
            {onSubmit ? "Cancel" : "Close"}
          </button>
          {onSubmit && (
            <button type="submit" className="inv-primary" disabled={busy}>
              {busy ? "Saving…" : submitLabel}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
