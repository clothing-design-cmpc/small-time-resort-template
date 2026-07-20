/**
 * FILE: hooks/useSqlImport.js
 * ROLE: Super-admin — client data hook, protected by middleware.js auth guard
 *
 * PURPOSE:
 * Fetches the paginated SQL import history for the Backups page and
 * exposes an uploadSqlFile mutation. All axios calls to the SQL import
 * API happen here — never inline inside a component (Rule 31.2).
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const SQL_IMPORT_ENDPOINT = "/api/admin/sql-import";

export function useSqlImport() {
  const [importLogs, setImportLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const fetchImportLogs = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const response = await axios.get(`${SQL_IMPORT_ENDPOINT}?page=${page}`);
      const result = response.data;

      if (!result.success) {
        setLoadError(result.message || "Failed to load import history. Please try again.");
        return;
      }

      setImportLogs(result.data.importLogs);
      setTotalPages(result.data.totalPages);
      setTotalCount(result.data.totalCount);
    } catch {
      setLoadError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchImportLogs();
  }, [fetchImportLogs]);

  // Poll every 4 seconds while any import on the current page is still
  // "running" — the actual restore happens on a GitHub Actions runner
  // (Rule 40.1), so this list would otherwise sit on "Running" forever
  // with no visible next step until the admin manually refreshes.
  useEffect(() => {
    const hasRunningImport = importLogs.some((log) => log.status === "running");
    if (!hasRunningImport) return;

    const pollTimer = setInterval(() => {
      fetchImportLogs();
    }, 4000);

    return () => clearInterval(pollTimer);
  }, [importLogs, fetchImportLogs]);

  /**
   * uploadSqlFile
   * Sends the chosen .sql/.sql.gz file to the API, which uploads it to
   * R2 and dispatches the restore workflow. Refreshes the history list
   * afterward so the new "running" row shows up immediately.
   */
  const uploadSqlFile = useCallback(
    async (file) => {
      const uploadFormData = new FormData();
      uploadFormData.append("file", file);

      const response = await axios.post(SQL_IMPORT_ENDPOINT, uploadFormData);
      await fetchImportLogs();
      return response.data;
    },
    [fetchImportLogs]
  );

  return {
    importLogs,
    page,
    setPage,
    totalPages,
    totalCount,
    isLoading,
    loadError,
    uploadSqlFile,
    refetchImportLogs: fetchImportLogs,
  };
}
