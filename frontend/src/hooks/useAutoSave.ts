/**
 * Auto-save hook: debounced save to server when project is dirty.
 *
 * Only active when authenticated and a server-side project is loaded.
 * Shows toast notifications for save success/failure and conflict detection.
 */
import { useEffect, useRef } from "react";

import { useAuth } from "./useAuth";
import { useProjectStore } from "../store/projectStore";
import { useToastStore } from "../store/toastStore";
import { updateProject, ConflictError } from "../lib/backend";

const AUTO_SAVE_DELAY_MS = 5_000;
const SUCCESS_TOAST_DURATION_MS = 2_000;
const CONFLICT_TOAST_DURATION_MS = 10_000;

export function useAutoSave(): void {
  const auth = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addToast = useToastStore((s) => s.addToast);

  const isDirty = useProjectStore((s) => s.isDirty);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);
  const project = useProjectStore((s) => s.project);
  const serverUpdatedAt = useProjectStore((s) => s.serverUpdatedAt);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (!auth.isLoggedIn || !activeProjectId || !isDirty) {
      return;
    }

    timerRef.current = setTimeout(async () => {
      try {
        const response = await updateProject(activeProjectId, {
          name: project.info.name || undefined,
          project_data: project,
          expected_updated_at: serverUpdatedAt ?? undefined,
        });
        // Only clear dirty flag if the project hasn't changed during the save.
        useProjectStore.setState((state) => {
          if (state.activeProjectId === activeProjectId) {
            return { isDirty: false, serverUpdatedAt: response.updated_at };
          }
          return {};
        });
        addToast("Project opgeslagen", "success", SUCCESS_TOAST_DURATION_MS);
      } catch (err) {
        if (err instanceof ConflictError) {
          addToast(
            "Project is elders gewijzigd. Herlaad om de laatste versie te zien.",
            "error",
            CONFLICT_TOAST_DURATION_MS,
          );
        } else {
          addToast("Auto-save mislukt", "error");
        }
      }
    }, AUTO_SAVE_DELAY_MS);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [auth.isLoggedIn, activeProjectId, isDirty, project, serverUpdatedAt, addToast]);
}
