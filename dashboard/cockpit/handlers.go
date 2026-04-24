package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	cockpitapi "github.com/santifer/career-ops/dashboard/internal/cockpit"
)

type apiHandler struct {
	service      *cockpitapi.Service
	serviceErr   error
	runStore     *cockpitapi.RunStore
	actionRunner *cockpitapi.ActionRunner
	autoMode     *cockpitapi.AutoModeService
}

type apiErrorResponse struct {
	Error apiError `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type profileResponse struct {
	Profile       cockpitapi.ApplicationProfile `json:"profile"`
	MissingFields []cockpitapi.MissingField     `json:"missing_fields"`
}

type statusUpdateRequest struct {
	Status string `json:"status"`
}

type pdfActionRequest struct {
	ApplicationID *int `json:"application_id"`
}

func registerAPIHandlers(mux *http.ServeMux, service *cockpitapi.Service, serviceErr error, runStore *cockpitapi.RunStore, actionRunner *cockpitapi.ActionRunner, autoMode *cockpitapi.AutoModeService) {
	handler := apiHandler{
		service:      service,
		serviceErr:   serviceErr,
		runStore:     runStore,
		actionRunner: actionRunner,
		autoMode:     autoMode,
	}

	mux.HandleFunc("/api/overview", handler.overview)
	mux.HandleFunc("/api/applications", handler.applications)
	mux.HandleFunc("/api/applications/", handler.applicationDetailOrStatus)
	mux.HandleFunc("/api/profile", handler.profile)
	mux.HandleFunc("/api/actions/verify", handler.actionVerify)
	mux.HandleFunc("/api/actions/scan", handler.actionScan)
	mux.HandleFunc("/api/actions/pdf", handler.actionPDF)
	mux.HandleFunc("/api/actions/auto-mode/start", handler.actionAutoModeStart)
	mux.HandleFunc("/api/runs/", handler.runDetailOrCancel)
}

func (h apiHandler) overview(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if !h.requireService(w) {
		return
	}

	overview, err := h.service.LoadOverview(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "overview_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, overview)
}

func (h apiHandler) applications(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if !h.requireService(w) {
		return
	}

	applications, _, err := h.service.ListApplications(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "applications_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, applications)
}

func (h apiHandler) applicationDetailOrStatus(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/applications/")
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeJSONError(w, http.StatusNotFound, "application_not_found", "Application not found.")
		return
	}

	id, err := strconv.Atoi(parts[0])
	if err != nil || id <= 0 {
		writeJSONError(w, http.StatusBadRequest, "invalid_application_id", "Application id must be a positive integer.")
		return
	}

	if len(parts) == 1 {
		h.applicationDetail(w, r, id)
		return
	}
	if len(parts) == 2 && parts[1] == "status" {
		h.updateApplicationStatus(w, r, id)
		return
	}

	writeJSONError(w, http.StatusNotFound, "route_not_found", "API route not found.")
}

func (h apiHandler) applicationDetail(w http.ResponseWriter, r *http.Request, id int) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	if !h.requireService(w) {
		return
	}

	application, err := h.service.GetApplication(r.Context(), id)
	if errors.Is(err, cockpitapi.ErrApplicationNotFound) {
		writeJSONError(w, http.StatusNotFound, "application_not_found", "Application not found.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "application_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, application)
}

func (h apiHandler) updateApplicationStatus(w http.ResponseWriter, r *http.Request, id int) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !h.requireService(w) {
		return
	}

	var request statusUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}

	if err := h.service.UpdateApplicationStatus(r.Context(), id, request.Status); err != nil {
		if errors.Is(err, cockpitapi.ErrApplicationNotFound) {
			writeJSONError(w, http.StatusNotFound, "application_not_found", "Application not found.")
			return
		}
		if cockpitapi.IsStatusValidationError(err) {
			writeJSONError(w, http.StatusBadRequest, "invalid_status", "Status must be one of templates/states.yml.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "status_update_failed", err.Error())
		return
	}

	application, err := h.service.GetApplication(r.Context(), id)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
		return
	}
	writeJSON(w, http.StatusOK, application)
}

func (h apiHandler) profile(w http.ResponseWriter, r *http.Request) {
	if !h.requireService(w) {
		return
	}

	switch r.Method {
	case http.MethodGet:
		profile, missing, err := cockpitapi.LoadApplicationProfile(h.service.Root)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "profile_load_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, profileResponse{Profile: profile, MissingFields: missing})
	case http.MethodPost:
		var profile cockpitapi.ApplicationProfile
		if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
			return
		}
		if err := cockpitapi.SaveApplicationProfile(h.service.Root, profile); err != nil {
			if cockpitapi.IsProfileValidationError(err) {
				writeJSONError(w, http.StatusBadRequest, "invalid_profile", err.Error())
				return
			}
			writeJSONError(w, http.StatusInternalServerError, "profile_save_failed", err.Error())
			return
		}
		loaded, missing, err := cockpitapi.LoadApplicationProfile(h.service.Root)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "profile_load_failed", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, profileResponse{Profile: loaded, MissingFields: missing})
	default:
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
	}
}

func (h apiHandler) actionVerify(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !h.requireService(w) {
		return
	}
	run, err := h.actionRunner.RunVerify(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "verify_start_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, run)
}

func (h apiHandler) actionScan(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !h.requireService(w) {
		return
	}
	run, err := h.actionRunner.RunScan(r.Context())
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "scan_start_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, run)
}

func (h apiHandler) actionPDF(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !h.requireService(w) {
		return
	}

	var request pdfActionRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
			return
		}
	}
	if request.ApplicationID == nil || *request.ApplicationID <= 0 {
		writeJSONError(w, http.StatusBadRequest, "pdf_application_required", "Select an application before preparing a PDF.")
		return
	}

	detail, err := h.service.GetApplication(r.Context(), *request.ApplicationID)
	if errors.Is(err, cockpitapi.ErrApplicationNotFound) {
		writeJSONError(w, http.StatusNotFound, "application_not_found", "Application not found.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "application_failed", err.Error())
		return
	}

	run, err := h.actionRunner.RunPDF(r.Context(), detail.Application)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "pdf_start_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, run)
}

func (h apiHandler) actionAutoModeStart(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	if !h.requireService(w) {
		return
	}

	var request cockpitapi.AutoModeStartRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	if request.ApplicationID != nil && strings.TrimSpace(request.URL) == "" {
		if application, err := h.service.GetApplication(r.Context(), *request.ApplicationID); err == nil {
			request.URL = application.Application.JobURL
		}
	}
	run, err := h.autoMode.StartAutoMode(r.Context(), request)
	if errors.Is(err, cockpitapi.ErrAutoModeTargetRequired) {
		writeJSONError(w, http.StatusBadRequest, "auto_mode_target_required", "Application id or URL is required.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "auto_mode_start_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, run)
}

func (h apiHandler) runDetailOrCancel(w http.ResponseWriter, r *http.Request) {
	if !h.requireService(w) {
		return
	}

	trimmed := strings.TrimPrefix(r.URL.Path, "/api/runs/")
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}

	if len(parts) == 1 {
		h.runDetail(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "cancel" {
		h.cancelRun(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "field-observation" {
		h.recordFieldObservation(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "browser-log" {
		h.recordBrowserLog(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "open-browser" {
		h.openVisibleBrowser(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "needs-input" {
		h.markNeedsInput(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "ready-for-review" {
		h.markReadyForReview(w, r, parts[0])
		return
	}
	if len(parts) == 2 && parts[1] == "approve-submit" {
		h.approveSubmit(w, r, parts[0])
		return
	}

	writeJSONError(w, http.StatusNotFound, "route_not_found", "API route not found.")
}

func (h apiHandler) runDetail(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	run, err := h.runStore.Get(r.Context(), id)
	if errors.Is(err, cockpitapi.ErrRunNotFound) {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "run_load_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (h apiHandler) cancelRun(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	run, err := h.actionRunner.Cancel(r.Context(), id)
	if errors.Is(err, cockpitapi.ErrRunNotFound) {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "run_cancel_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (h apiHandler) recordFieldObservation(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	var request cockpitapi.FieldObservationRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	run, err := h.autoMode.RecordFieldObservation(r.Context(), id, request)
	h.writeRunMutationResult(w, run, err, "field_observation_failed")
}

func (h apiHandler) recordBrowserLog(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	var request cockpitapi.BrowserLogRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	run, err := h.autoMode.RecordBrowserLog(r.Context(), id, request)
	h.writeRunMutationResult(w, run, err, "browser_log_failed")
}

func (h apiHandler) openVisibleBrowser(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	run, err := h.autoMode.OpenVisibleBrowser(r.Context(), id)
	if errors.Is(err, cockpitapi.ErrAutoModeBrowserURLMissing) {
		writeJSONError(w, http.StatusBadRequest, "browser_url_missing", "Run has no browser target URL.")
		return
	}
	if errors.Is(err, cockpitapi.ErrAutoModeBrowserURLUnsafe) {
		writeJSONError(w, http.StatusBadRequest, "browser_url_unsafe", "Browser target URL must be http or https.")
		return
	}
	if errors.Is(err, cockpitapi.ErrAutoModeBrowserOpenHosted) {
		writeJSONError(w, http.StatusConflict, "browser_open_hosted", "Server-side browser opening is available only when the cockpit runs locally.")
		return
	}
	h.writeRunMutationResult(w, run, err, "open_browser_failed")
}

func (h apiHandler) markNeedsInput(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	var request cockpitapi.NeedsInputRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	run, err := h.autoMode.MarkNeedsInput(r.Context(), id, request)
	h.writeRunMutationResult(w, run, err, "needs_input_failed")
}

func (h apiHandler) markReadyForReview(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	var request cockpitapi.ReadyForReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	run, err := h.autoMode.MarkReadyForReview(r.Context(), id, request)
	h.writeRunMutationResult(w, run, err, "ready_for_review_failed")
}

func (h apiHandler) approveSubmit(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}

	var request cockpitapi.ApproveSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	run, err := h.autoMode.ApproveSubmit(r.Context(), id, request)
	if errors.Is(err, cockpitapi.ErrAutoModeApprovalTextRequired) {
		writeJSONError(w, http.StatusBadRequest, "approval_text_required", "Explicit approval text is required.")
		return
	}
	if errors.Is(err, cockpitapi.ErrAutoModeReviewRequired) {
		writeJSONError(w, http.StatusConflict, "run_not_ready_for_review", "Run must be Ready for Review before submit approval.")
		return
	}
	h.writeRunMutationResult(w, run, err, "approve_submit_failed")
}

func (h apiHandler) writeRunMutationResult(w http.ResponseWriter, run cockpitapi.RunRecord, err error, fallbackCode string) {
	if errors.Is(err, cockpitapi.ErrRunNotFound) {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, fallbackCode, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (h apiHandler) requireService(w http.ResponseWriter) bool {
	if h.serviceErr == nil && h.runStore != nil && h.actionRunner != nil && h.autoMode != nil {
		return true
	}
	message := "service unavailable"
	if h.serviceErr != nil {
		message = h.serviceErr.Error()
	}
	writeJSONError(w, http.StatusInternalServerError, "service_unavailable", message)
	return false
}

func requireMethod(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method not allowed.")
	return false
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJSONError(w http.ResponseWriter, status int, code string, message string) {
	writeJSON(w, status, apiErrorResponse{
		Error: apiError{
			Code:    code,
			Message: message,
		},
	})
}
