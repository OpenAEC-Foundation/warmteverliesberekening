/**
 * Step 1 — File upload with drag-drop zone.
 *
 * Accepts a JSON file, parses it as a thermal import, and passes it up.
 */
import { useCallback, useRef, useState, type DragEvent } from "react";
import { Upload, FileJson, AlertCircle, CheckCircle2 } from "lucide-react";

import type { ThermalImportFile } from "../../lib/thermalImport";
import { parseThermalImportFile } from "../../lib/thermalImport";

interface FileUploadStepProps {
  onFileAccepted: (file: ThermalImportFile) => void;
  isLoading: boolean;
  importFile: ThermalImportFile | null;
}

export function FileUploadStep({
  onFileAccepted,
  isLoading,
  importFile,
}: FileUploadStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const processFile = useCallback(
    (file: File) => {
      setParseError(null);
      setFileName(file.name);

      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        try {
          const parsed = parseThermalImportFile(text);
          onFileAccepted(parsed);
        } catch (err) {
          setParseError(
            err instanceof Error ? err.message : "Kan bestand niet lezen",
          );
        }
      };
      reader.onerror = () => {
        setParseError("Kan bestand niet lezen");
      };
      reader.readAsText(file);
    },
    [onFileAccepted],
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div>
      <h2 className="mb-2 text-lg font-semibold text-gray-100">
        Bestand uploaden
      </h2>
      <p className="mb-6 text-sm text-gray-400">
        Sleep een Revit thermal export JSON-bestand hiernaartoe, of klik om een
        bestand te selecteren.
      </p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          isDragging
            ? "border-[#45B6A8] bg-[#45B6A8]/5"
            : importFile
              ? "border-[#45B6A8]/40 bg-[#45B6A8]/5"
              : "border-gray-600 bg-gray-800/50 hover:border-gray-500 hover:bg-gray-800"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileInput}
          className="hidden"
        />

        {importFile ? (
          <>
            <CheckCircle2 className="mb-3 h-12 w-12 text-[#45B6A8]" />
            <p className="text-sm font-medium text-gray-200">
              {fileName}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Project: {importFile.project_name ?? "Naamloos"} &middot;{" "}
              Bron: {importFile.source} &middot;{" "}
              {importFile.rooms.length} ruimtes
            </p>
            <p className="mt-3 text-xs text-gray-500">
              Klik of sleep om een ander bestand te laden
            </p>
          </>
        ) : (
          <>
            {isLoading ? (
              <div className="mb-3 h-12 w-12 animate-pulse rounded-full bg-gray-700" />
            ) : (
              <Upload className="mb-3 h-12 w-12 text-gray-500" />
            )}
            <p className="text-sm font-medium text-gray-300">
              Sleep een bestand hierheen
            </p>
            <p className="mt-1 text-xs text-gray-500">
              of klik om te bladeren &middot; .json
            </p>
          </>
        )}
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400" />
          <div>
            <p className="text-sm font-medium text-red-300">
              Kan bestand niet importeren
            </p>
            <p className="mt-0.5 text-xs text-red-400">{parseError}</p>
          </div>
        </div>
      )}

      {/* File format info */}
      <div className="mt-6 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <FileJson className="h-4 w-4" />
          <span className="font-medium">Verwacht formaat</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Thermal Import JSON v1.0 — gegenereerd door de PyRevit ThermalExport
          tool of IFC thermal export pipeline. Bevat ruimtes, constructies,
          openingen en optioneel open verbindingen.
        </p>
      </div>
    </div>
  );
}
