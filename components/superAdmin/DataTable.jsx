/**
 * FILE: components/superAdmin/DataTable.jsx
 * ROLE: Super-admin — shared UI, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Reusable paginated data table for admin list pages (Users, Orders,
 * Audit Logs, Support Tickets, etc.), per the design system's Data
 * Tables component spec. Handles loading (skeleton rows), empty, and
 * error states so no future list page has to rebuild this by hand.
 *
 * DATA FLOW:
 * 1. Consumer passes `columns` (header definitions), `rows` (data array),
 *    and current fetch state (isLoading/error)
 * 2. Row click, if `onRowClick` is provided, navigates or opens detail —
 *    DataTable itself never fetches or mutates data
 * 3. Pagination is fully controlled — DataTable only renders the UI and
 *    calls onPageChange; the consumer's hook owns the actual page state
 * 4. Expandable row details are opt-in: if the consumer passes
 *    `renderExpandedRow`, an expand (˅) button column is added and
 *    clicking it toggles an inline detail row below that record.
 *    Pages that don't pass this prop are completely unaffected.
 */
import { Fragment, useState } from "react";
import "./DataTable.css";

/**
 * columns shape: [{ key: "name", label: "Name", align: "left" | "right" | "center", mono: bool }]
 * rows shape: [{ id: string, [columnKey]: ReactNode, ...anything else the consumer wants
 *   available to renderExpandedRow, e.g. row.raw = the original record }]
 */
export default function DataTable({
  columns,
  rows,
  isLoading = false,
  error = null,
  emptyMessage = "No records yet.",
  onRowClick,
  page = 1,
  totalPages = 1,
  totalCount = 0,
  pageSize = 20,
  onPageChange,
  renderExpandedRow,
}) {
  // Tracks which single row is currently expanded (accordion-style — only
  // one detail panel open at a time keeps the table from growing unbounded).
  const [expandedRowId, setExpandedRowId] = useState(null);

  function toggleExpandedRow(rowId) {
    setExpandedRowId((current) => (current === rowId ? null : rowId));
  }

  const columnCount = columns.length + (renderExpandedRow ? 1 : 0);

  // Error state — user-friendly message only, never raw error text (Rule 25.4)
  if (error) {
    return (
      <div className="dataTableState dataTableState--error">
        <p>We couldn't load this data. Please try again.</p>
      </div>
    );
  }

  // Loading state — skeleton rows matching the column count, mirrors real content shape
  if (isLoading) {
    return (
      <div className="dataTableWrapper">
        <table className="dataTable">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`dataTableHeadCell dataTableAlign--${col.align ?? "left"}`}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((col) => (
                  <td key={col.key} className="dataTableCell">
                    <span className="dataTableSkeletonBlock" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state — action-specific message, never a blank table (Rule 25.3)
  if (!rows || rows.length === 0) {
    return (
      <div className="dataTableState dataTableState--empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="dataTableWrapper">
      <table className="dataTable">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} className={`dataTableHeadCell dataTableAlign--${col.align ?? "left"}`}>
                {col.label}
              </th>
            ))}
            {renderExpandedRow && (
              <th className="dataTableHeadCell dataTableAlign--right" aria-label="Expand row" />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr
                className={onRowClick ? "dataTableRow dataTableRow--clickable" : "dataTableRow"}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`dataTableCell dataTableAlign--${col.align ?? "left"}${col.mono ? " adminMono" : ""}`}
                  >
                    {row[col.key]}
                  </td>
                ))}
                {renderExpandedRow && (
                  <td className="dataTableCell dataTableAlign--right">
                    <button
                      type="button"
                      className="dataTableExpandButton"
                      aria-expanded={expandedRowId === row.id}
                      aria-label={expandedRowId === row.id ? "Collapse row details" : "Expand row details"}
                      onClick={(event) => {
                        // Stop the click from also triggering onRowClick on the parent <tr>.
                        event.stopPropagation();
                        toggleExpandedRow(row.id);
                      }}
                    >
                      {expandedRowId === row.id ? "▲" : "▼"}
                    </button>
                  </td>
                )}
              </tr>
              {renderExpandedRow && expandedRowId === row.id && (
                <tr className="dataTableExpandedRow">
                  <td className="dataTableExpandedCell" colSpan={columnCount}>
                    {renderExpandedRow(row)}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>

      {/* Pagination footer — "Showing X-Y of Z" + Previous/Next, per spec */}
      {onPageChange && (
        <div className="dataTablePagination">
          <span className="dataTablePaginationSummary">
            Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, totalCount)} of {totalCount}
          </span>
          <div className="dataTablePaginationControls">
            <button
              type="button"
              className="dataTablePaginationButton"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Previous
            </button>
            <span className="dataTablePaginationCurrent">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="dataTablePaginationButton"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
