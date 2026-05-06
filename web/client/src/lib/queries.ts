import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Application, ApplicationDetail, AppStats, DiscoveredJob, Source, PipelineData, Paginated } from "./types";

export function useApplications(params?: Record<string, string>) {
  const search = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["applications", params],
    queryFn: () => api.get<Paginated<Application>>(`/applications${search}`),
  });
}

export function useApplication(id: string) {
  return useQuery({
    queryKey: ["applications", id],
    queryFn: () => api.get<ApplicationDetail>(`/applications/${id}`),
    enabled: !!id,
  });
}

export function useAppStats() {
  return useQuery({
    queryKey: ["applications", "stats"],
    queryFn: () => api.get<AppStats>("/applications/stats"),
  });
}

export function useUpdateApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; status?: string; notes?: string }) =>
      api.patch<Application>(`/applications/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["applications"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
    },
  });
}

export function usePipeline() {
  return useQuery({
    queryKey: ["pipeline"],
    queryFn: () => api.get<PipelineData>("/pipeline"),
  });
}

export function useMoveCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, toStatus }: { id: string; toStatus: string }) =>
      api.patch<Application>(`/pipeline/${id}/move`, { toStatus }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useJobs(params?: Record<string, string>) {
  const search = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({
    queryKey: ["jobs", params],
    queryFn: () => api.get<Paginated<DiscoveredJob>>(`/jobs${search}`),
  });
}

export function useDismissJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch<DiscoveredJob>(`/jobs/${id}`, { status: "dismissed" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useSendToPipeline() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<DiscoveredJob>(`/jobs/${id}/to-pipeline`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["pipeline"] });
      qc.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}

export function useSources() {
  return useQuery({
    queryKey: ["sources"],
    queryFn: () => api.get<Source[]>("/sources"),
  });
}

export function useCreateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; type: string; config: Record<string, unknown>; enabled?: boolean }) =>
      api.post<Source>("/sources", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}

export function useUpdateSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; enabled?: boolean; config?: Record<string, unknown> }) =>
      api.patch<Source>(`/sources/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}

export function useDeleteSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sources/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sources"] }),
  });
}
