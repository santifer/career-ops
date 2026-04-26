package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	cockpitapi "github.com/santifer/career-ops/dashboard/internal/cockpit"
)

type apiHandler struct {
	service      *cockpitapi.Service
	serviceErr   error
	runStore     *cockpitapi.RunStore
	runtimeStore cockpitapi.AutoModeRuntimeStore
	actionRunner *cockpitapi.ActionRunner
	autoMode     *cockpitapi.AutoModeService
	authVerifier cockpitapi.AuthVerifier
	pairing      *cockpitapi.PairingService
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

type pairingTokenRequest struct {
	WorkerID string `json:"worker_id"`
}

type workerRegisterRequest struct {
	WorkerID     string `json:"worker_id"`
	PairingToken string `json:"pairing_token"`
}

type claimRunRequest struct {
	LeaseTTLSeconds int `json:"lease_ttl_seconds,omitempty"`
}

type workerPrincipal struct {
	WorkerID string
	UserID   string
}

func registerAPIHandlers(mux *http.ServeMux, service *cockpitapi.Service, serviceErr error, runStore *cockpitapi.RunStore, actionRunner *cockpitapi.ActionRunner, autoMode *cockpitapi.AutoModeService, authVerifier cockpitapi.AuthVerifier, runtimeStore cockpitapi.AutoModeRuntimeStore, pairing *cockpitapi.PairingService) {
	if authVerifier == nil {
		authVerifier = cockpitapi.RejectingAuthVerifier{}
	}
	if runtimeStore == nil {
		runtimeStore = cockpitapi.NewMemoryRuntimeStore()
	}
	if pairing == nil {
		pairing = cockpitapi.NewPairingService(cockpitapi.NewMemoryPairingStore(), cockpitapi.PairingConfig{})
	}
	handler := apiHandler{
		service:      service,
		serviceErr:   serviceErr,
		runStore:     runStore,
		runtimeStore: runtimeStore,
		actionRunner: actionRunner,
		autoMode:     autoMode,
		authVerifier: authVerifier,
		pairing:      pairing,
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
	mux.HandleFunc("/api/worker/", handler.workerRoutes)
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
	if _, ok := h.requireAuth(w, r); !ok {
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
		if _, ok := h.requireAuth(w, r); !ok {
			return
		}
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
	principal, authenticated, ok := h.optionalAuth(w, r)
	if !ok {
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
	if authenticated {
		run.OwnerUserID = principal.UserID
	}
	if err := h.runtimeStore.SaveRun(r.Context(), run); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "auto_mode_runtime_save_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusAccepted, run)
}

func (h apiHandler) workerRoutes(w http.ResponseWriter, r *http.Request) {
	trimmed := strings.TrimPrefix(r.URL.Path, "/api/worker/")
	parts := strings.Split(strings.Trim(trimmed, "/"), "/")
	if len(parts) == 1 && parts[0] == "pairing-token" {
		h.createPairingToken(w, r)
		return
	}
	if len(parts) == 1 && parts[0] == "register" {
		h.registerWorker(w, r)
		return
	}
	if len(parts) == 2 && parts[0] == "runs" && parts[1] == "next" {
		h.nextWorkerRun(w, r)
		return
	}
	if len(parts) == 3 && parts[0] == "runs" && parts[2] == "claim" {
		h.claimWorkerRun(w, r, parts[1])
		return
	}
	if len(parts) == 3 && parts[0] == "runs" && parts[2] == "heartbeat" {
		h.workerHeartbeat(w, r, parts[1])
		return
	}
	if len(parts) == 3 && parts[0] == "runs" && parts[2] == "fill-plan" {
		h.workerFillPlan(w, r, parts[1])
		return
	}
	if len(parts) == 3 && parts[0] == "runs" && parts[2] == "log" {
		h.workerLog(w, r, parts[1])
		return
	}
	if len(parts) == 3 && parts[0] == "runs" && parts[2] == "needs-input" {
		h.workerNeedsInput(w, r, parts[1])
		return
	}
	writeJSONError(w, http.StatusNotFound, "route_not_found", "API route not found.")
}

func (h apiHandler) createPairingToken(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	principal, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var request pairingTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	token, err := h.pairing.CreatePairingToken(r.Context(), cockpitapi.PairingTokenRequest{
		UserID:   principal.UserID,
		WorkerID: request.WorkerID,
	})
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "pairing_token_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, token)
}

func (h apiHandler) registerWorker(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	var request workerRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	credential, err := h.pairing.ExchangePairingToken(r.Context(), cockpitapi.ExchangePairingRequest{
		Token:    request.PairingToken,
		WorkerID: request.WorkerID,
	})
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "worker_pairing_failed", "Worker pairing token is invalid, expired, or already used.")
		return
	}
	writeJSON(w, http.StatusCreated, credential)
}

func (h apiHandler) nextWorkerRun(w http.ResponseWriter, r *http.Request) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	worker, ok := h.requireWorker(w, r)
	if !ok {
		return
	}
	run, err := h.runtimeStore.NextRun(r.Context(), worker.UserID, time.Now().UTC())
	if errors.Is(err, cockpitapi.ErrRunNotFound) {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "next_run_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (h apiHandler) claimWorkerRun(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	worker, ok := h.requireWorker(w, r)
	if !ok {
		return
	}
	var request claimRunRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
			return
		}
	}
	ttl := time.Duration(request.LeaseTTLSeconds) * time.Second
	if ttl <= 0 {
		ttl = time.Minute
	}
	run, err := h.runtimeStore.ClaimRun(r.Context(), cockpitapi.ClaimRunRequest{
		RunID:     id,
		WorkerID:  worker.WorkerID,
		UserID:    worker.UserID,
		LeaseTTL:  ttl,
		ClaimedAt: time.Now().UTC(),
	})
	if errors.Is(err, cockpitapi.ErrRunAlreadyClaimed) {
		writeJSONError(w, http.StatusConflict, "run_already_claimed", "Run is already claimed by another active worker.")
		return
	}
	if errors.Is(err, cockpitapi.ErrRunNotFound) {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "run_claim_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, run)
}

func (h apiHandler) workerHeartbeat(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	worker, ok := h.requireWorker(w, r)
	if !ok {
		return
	}
	var request claimRunRequest
	if r.Body != nil {
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
			return
		}
	}
	ttl := time.Duration(request.LeaseTTLSeconds) * time.Second
	if ttl <= 0 {
		ttl = time.Minute
	}
	run, err := h.runtimeStore.Heartbeat(r.Context(), cockpitapi.HeartbeatRequest{
		RunID:       id,
		WorkerID:    worker.WorkerID,
		UserID:      worker.UserID,
		HeartbeatAt: time.Now().UTC(),
		LeaseTTL:    ttl,
	})
	if errors.Is(err, cockpitapi.ErrRunAlreadyClaimed) {
		writeJSONError(w, http.StatusConflict, "run_not_claimed_by_worker", "Run is not claimed by this active worker.")
		return
	}
	h.writeRuntimeMutationResult(w, run, err, "worker_heartbeat_failed")
}

func (h apiHandler) workerLog(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	worker, ok := h.requireWorker(w, r)
	if !ok {
		return
	}
	var request cockpitapi.BrowserLogRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	request.UserID = worker.UserID
	run, err := h.runtimeStore.RecordBrowserLog(r.Context(), id, request)
	h.writeRuntimeMutationResult(w, run, err, "worker_log_failed")
}

func (h apiHandler) workerNeedsInput(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	worker, ok := h.requireWorker(w, r)
	if !ok {
		return
	}
	var request cockpitapi.NeedsInputRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	request.UserID = worker.UserID
	run, err := h.runtimeStore.MarkNeedsInput(r.Context(), id, request)
	h.writeRuntimeMutationResult(w, run, err, "worker_needs_input_failed")
}

func (h apiHandler) workerFillPlan(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}
	worker, ok := h.requireWorker(w, r)
	if !ok {
		return
	}
	run, err := h.runtimeStore.GetRun(r.Context(), id)
	if errors.Is(err, cockpitapi.ErrRunNotFound) {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "fill_plan_run_failed", err.Error())
		return
	}
	if !workerCanAccessRun(worker, run) {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}
	profile, _, err := cockpitapi.LoadApplicationProfile(h.service.Root)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "fill_plan_profile_failed", err.Error())
		return
	}
	var application *cockpitapi.ApplicationDTO
	if run.ApplicationID != nil && *run.ApplicationID > 0 {
		if detail, err := h.service.GetApplication(r.Context(), *run.ApplicationID); err == nil {
			application = &detail.Application
		}
	}
	writeJSON(w, http.StatusOK, cockpitapi.BuildFillPlanWithApplication(run, profile, application))
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
	if len(parts) == 2 && parts[1] == "approve-upload" {
		h.approveUpload(w, r, parts[0])
		return
	}

	writeJSONError(w, http.StatusNotFound, "route_not_found", "API route not found.")
}

func (h apiHandler) runDetail(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodGet) {
		return
	}

	runtimeRun, err := h.runtimeStore.GetRun(r.Context(), id)
	if err == nil && runtimeRun.Action == cockpitapi.ActionAutoMode {
		writeJSON(w, http.StatusOK, runtimeRun)
		return
	}
	if err != nil && !errors.Is(err, cockpitapi.ErrRunNotFound) {
		writeJSONError(w, http.StatusInternalServerError, "runtime_run_load_failed", err.Error())
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
	principal, ok := h.requireAuth(w, r)
	if !ok {
		return
	}

	var request cockpitapi.FieldObservationRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	request.UserID = principal.UserID
	run, err := h.runtimeStore.RecordFieldObservation(r.Context(), id, request)
	h.writeRuntimeMutationResult(w, run, err, "field_observation_failed")
}

func (h apiHandler) recordBrowserLog(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	principal, ok := h.requireAuth(w, r)
	if !ok {
		return
	}

	var request cockpitapi.BrowserLogRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	request.UserID = principal.UserID
	run, err := h.runtimeStore.RecordBrowserLog(r.Context(), id, request)
	h.writeRuntimeMutationResult(w, run, err, "browser_log_failed")
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
	principal, ok := h.requireAuth(w, r)
	if !ok {
		return
	}

	var request cockpitapi.NeedsInputRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	request.UserID = principal.UserID
	run, err := h.runtimeStore.MarkNeedsInput(r.Context(), id, request)
	h.writeRuntimeMutationResult(w, run, err, "needs_input_failed")
}

func (h apiHandler) markReadyForReview(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	principal, ok := h.requireAuth(w, r)
	if !ok {
		return
	}

	var request cockpitapi.ReadyForReviewRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	request.UserID = principal.UserID
	run, err := h.runtimeStore.MarkReadyForReview(r.Context(), id, request)
	h.writeRuntimeMutationResult(w, run, err, "ready_for_review_failed")
}

func (h apiHandler) approveSubmit(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	principal, ok := h.requireAuth(w, r)
	if !ok {
		return
	}

	var request cockpitapi.ApproveSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	if strings.TrimSpace(request.ApprovalText) == "" {
		writeJSONError(w, http.StatusBadRequest, "approval_text_required", "Explicit approval text is required.")
		return
	}
	run, err := h.runtimeStore.ApproveSubmit(r.Context(), cockpitapi.ApprovalRequest{
		RunID:        id,
		UserID:       principal.UserID,
		ApprovalText: request.ApprovalText,
		ApprovedAt:   time.Now().UTC(),
	})
	if errors.Is(err, cockpitapi.ErrAutoModeApprovalTextRequired) {
		writeJSONError(w, http.StatusBadRequest, "approval_text_required", "Explicit approval text is required.")
		return
	}
	if errors.Is(err, cockpitapi.ErrAutoModeReviewRequired) {
		writeJSONError(w, http.StatusConflict, "run_not_ready_for_review", "Run must be Ready for Review before submit approval.")
		return
	}
	h.writeRuntimeMutationResult(w, run, err, "approve_submit_failed")
}

func (h apiHandler) approveUpload(w http.ResponseWriter, r *http.Request, id string) {
	if !requireMethod(w, r, http.MethodPost) {
		return
	}
	principal, ok := h.requireAuth(w, r)
	if !ok {
		return
	}
	var request cockpitapi.ApproveSubmitRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid_json", "Request body must be valid JSON.")
		return
	}
	if strings.TrimSpace(request.ApprovalText) == "" {
		writeJSONError(w, http.StatusBadRequest, "approval_text_required", "Explicit approval text is required.")
		return
	}
	run, err := h.runtimeStore.ApproveUpload(r.Context(), cockpitapi.ApprovalRequest{
		RunID:        id,
		UserID:       principal.UserID,
		ApprovalText: request.ApprovalText,
		ApprovedAt:   time.Now().UTC(),
	})
	h.writeRuntimeMutationResult(w, run, err, "approve_upload_failed")
}

func (h apiHandler) requireAuth(w http.ResponseWriter, r *http.Request) (cockpitapi.AuthPrincipal, bool) {
	verifier := h.authVerifier
	if verifier == nil {
		verifier = cockpitapi.RejectingAuthVerifier{}
	}
	principal, err := verifier.VerifyIDToken(r.Context(), r.Header.Get("Authorization"))
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "auth_required", "Authenticated user is required.")
		return cockpitapi.AuthPrincipal{}, false
	}
	return principal, true
}

func (h apiHandler) optionalAuth(w http.ResponseWriter, r *http.Request) (cockpitapi.AuthPrincipal, bool, bool) {
	if strings.TrimSpace(r.Header.Get("Authorization")) == "" {
		return cockpitapi.AuthPrincipal{}, false, true
	}
	principal, ok := h.requireAuth(w, r)
	return principal, ok, ok
}

func (h apiHandler) requireWorker(w http.ResponseWriter, r *http.Request) (workerPrincipal, bool) {
	workerID := strings.TrimSpace(r.Header.Get("X-Career-Ops-Worker-ID"))
	authorization := r.Header.Get("Authorization")
	token := strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
	if workerID == "" || token == "" || authorization == token {
		writeJSONError(w, http.StatusUnauthorized, "worker_auth_required", "Paired worker credentials are required.")
		return workerPrincipal{}, false
	}
	record, err := h.pairing.VerifyWorkerCredential(r.Context(), cockpitapi.WorkerCredentialRequest{
		WorkerID:   workerID,
		Credential: token,
	})
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, "worker_auth_required", "Paired worker credentials are required.")
		return workerPrincipal{}, false
	}
	return workerPrincipal{WorkerID: workerID, UserID: record.UserID}, true
}

func workerCanAccessRun(worker workerPrincipal, run cockpitapi.RunRecord) bool {
	owner := strings.TrimSpace(run.OwnerUserID)
	return owner == "" || owner == strings.TrimSpace(worker.UserID)
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

func (h apiHandler) writeRuntimeMutationResult(w http.ResponseWriter, run cockpitapi.RunRecord, err error, fallbackCode string) {
	if errors.Is(err, cockpitapi.ErrRunNotFound) {
		writeJSONError(w, http.StatusNotFound, "run_not_found", "Run not found.")
		return
	}
	if errors.Is(err, cockpitapi.ErrRunAlreadyClaimed) {
		writeJSONError(w, http.StatusConflict, "run_already_claimed", "Run is claimed by another active worker.")
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
