import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = "",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode }) {
  return (
    <th
      className={`border-b border-stone-200 bg-concrete px-4 py-3 text-left text-xs
        font-medium uppercase tracking-wider text-[#57534E] ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  numeric,
  className = "",
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { children?: ReactNode; numeric?: boolean }) {
  return (
    <td
      className={`border-b border-stone-100 px-4 py-3
        ${numeric ? "font-mono text-right" : ""}
        ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}
