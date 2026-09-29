package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"encoding/xml"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	bridgeVersion            = "0.3.0-auto-first"
	endpoint                 = "https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/assurant-device-bridge"
	maxConcurrentDiagnostics = 12
)

type Config struct {
	StationID    string `json:"station_id"`
	StationCode  string `json:"station_code"`
	StationName  string `json:"station_name"`
	StationToken string `json:"station_token"`
}

type Command struct {
	ID        string                 `json:"id"`
	SessionID string                 `json:"session_id"`
	Command   string                 `json:"command"`
	Payload   map[string]interface{} `json:"payload"`
}

type IMEI struct {
	Value      string `json:"value"`
	Slot       int    `json:"slot,omitempty"`
	Source     string `json:"source,omitempty"`
	Confidence string `json:"confidence,omitempty"`
}

type Battery struct {
	Percentage       *float64 `json:"percentage,omitempty"`
	HealthPercentage *float64 `json:"health_percentage,omitempty"`
	CycleCount       *int     `json:"cycle_count,omitempty"`
	TemperatureC     *float64 `json:"temperature_c,omitempty"`
	Status           string   `json:"status,omitempty"`
}

type Device struct {
	Slot           int                    `json:"slot,omitempty"`
	Platform       string                 `json:"platform"`
	ConnectionID   string                 `json:"connection_id,omitempty"`
	Manufacturer   string                 `json:"manufacturer,omitempty"`
	Brand          string                 `json:"brand,omitempty"`
	Model          string                 `json:"model,omitempty"`
	Product        string                 `json:"product,omitempty"`
	StorageBytes   int64                  `json:"storage_bytes,omitempty"`
	OSVersion      string                 `json:"os_version,omitempty"`
	Serial         string                 `json:"serial,omitempty"`
	SerialSource   string                 `json:"serial_source,omitempty"`
	UDID           string                 `json:"udid,omitempty"`
	MEID           string                 `json:"meid,omitempty"`
	EID            string                 `json:"eid,omitempty"`
	IMEIs          []IMEI                 `json:"imeis"`
	Battery        Battery                `json:"battery"`
	Raw            map[string]interface{} `json:"raw,omitempty"`
}

type ConnectedDevice struct {
	Slot         int    `json:"slot"`
	Platform     string `json:"platform"`
	ConnectionID string `json:"connection_id"`
	Manufacturer string `json:"manufacturer,omitempty"`
	Model        string `json:"model,omitempty"`
	Serial       string `json:"serial,omitempty"`
	Ready        bool   `json:"ready"`
	Note         string `json:"note,omitempty"`
}

type Test struct {
	Code       string                 `json:"code"`
	Category   string                 `json:"category"`
	Label      string                 `json:"label"`
	Result     string                 `json:"result"`
	Source     string                 `json:"source"`
	Value      map[string]interface{} `json:"value,omitempty"`
	DurationMS int64                  `json:"duration_ms,omitempty"`
	Details    string                 `json:"details,omitempty"`
}

type DiagnosticResponse struct {
	Device     Device                 `json:"device"`
	Tests      []Test                 `json:"tests"`
	DurationMS int64                  `json:"duration_ms"`
	Bridge     map[string]interface{} `json:"bridge"`
}

var (
	client        = &http.Client{Timeout: 35 * time.Second}
	diagnosticSem = make(chan struct{}, maxConcurrentDiagnostics)
	activeMu      sync.Mutex
	activeTargets = map[string]bool{}
	slotMu        sync.Mutex
	slotByDevice  = map[string]int{}
)

func main() {
	pairCode := flag.String("pair", "", "Código de pareamento gerado no Liquida")
	flag.Parse()

	if runtime.GOOS != "darwin" && runtime.GOOS != "windows" {
		fmt.Fprintln(os.Stderr, "Liquida Device Bridge suporta macOS e Windows nesta versão.")
		os.Exit(1)
	}

	if *pairCode != "" {
		if err := pair(*pairCode); err != nil {
			fmt.Fprintln(os.Stderr, "Falha no pareamento:", err)
			os.Exit(1)
		}
		fmt.Println("Pareamento concluído.")
		return
	}

	cfg, err := loadConfig()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Estação ainda não pareada. Gere um código no Liquida e execute com --pair.")
		os.Exit(1)
	}

	go heartbeatLoop(cfg)
	pollLoop(cfg)
}

func platformName() string {
	if runtime.GOOS == "darwin" {
		return "macos"
	}
	return runtime.GOOS
}

func configPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	dir = filepath.Join(dir, "LiquidaBridge")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

func saveConfig(cfg Config) error {
	p, err := configPath()
	if err != nil {
		return err
	}
	b, _ := json.MarshalIndent(cfg, "", "  ")
	return os.WriteFile(p, b, 0600)
}

func loadConfig() (Config, error) {
	var cfg Config
	p, err := configPath()
	if err != nil {
		return cfg, err
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return cfg, err
	}
	err = json.Unmarshal(b, &cfg)
	return cfg, err
}

func capabilities() map[string]interface{} {
	devices, _ := detectedDevices()
	return map[string]interface{}{
		"adb":                 toolExists("adb"),
		"idevice_id":          toolExists("idevice_id"),
		"ideviceinfo":         toolExists("ideviceinfo"),
		"idevicediagnostics": toolExists("idevicediagnostics"),
		"goos":                runtime.GOOS,
		"goarch":              runtime.GOARCH,
		"multidevice":         true,
		"max_devices":         maxConcurrentDiagnostics,
		"connected_devices":   devices,
	}
}

func pair(code string) error {
	host, _ := os.Hostname()
	payload := map[string]interface{}{
		"action":         "pair",
		"code":           strings.TrimSpace(strings.ToUpper(code)),
		"hostname":       host,
		"platform":       platformName(),
		"arch":           runtime.GOARCH,
		"bridge_version": bridgeVersion,
		"capabilities":   capabilities(),
	}

	var res struct {
		OK           bool `json:"ok"`
		Error        string `json:"error"`
		StationToken string `json:"station_token"`
		Station      struct {
			ID   string `json:"id"`
			Code string `json:"code"`
			Name string `json:"name"`
		} `json:"station"`
	}

	if err := post("", payload, &res); err != nil {
		return err
	}
	if !res.OK {
		return errors.New(res.Error)
	}

	return saveConfig(Config{
		StationID:    res.Station.ID,
		StationCode:  res.Station.Code,
		StationName:  res.Station.Name,
		StationToken: res.StationToken,
	})
}

func heartbeatLoop(cfg Config) {
	host, _ := os.Hostname()
	for {
		payload := map[string]interface{}{
			"action":         "heartbeat",
			"hostname":       host,
			"platform":       platformName(),
			"arch":           runtime.GOARCH,
			"bridge_version": bridgeVersion,
			"capabilities":   capabilities(),
		}
		var res map[string]interface{}
		_ = post(cfg.StationToken, payload, &res)
		time.Sleep(10 * time.Second)
	}
}

func pollLoop(cfg Config) {
	for {
		select {
		case diagnosticSem <- struct{}{}:
		default:
			time.Sleep(250 * time.Millisecond)
			continue
		}

		var res struct {
			OK      bool     `json:"ok"`
			Command *Command `json:"command"`
		}
		err := post(cfg.StationToken, map[string]interface{}{"action": "next_command"}, &res)
		if err != nil {
			<-diagnosticSem
			time.Sleep(1 * time.Second)
			continue
		}
		if res.Command == nil {
			<-diagnosticSem
			time.Sleep(350 * time.Millisecond)
			continue
		}

		go func(cmd Command) {
			defer func() { <-diagnosticSem }()
			handleCommand(cfg, cmd)
		}(*res.Command)
	}
}

func handleCommand(cfg Config, cmd Command) {
	start := time.Now()
	var response DiagnosticResponse
	var err error
	platform := stringFromMap(cmd.Payload, "platform")
	connectionID := stringFromMap(cmd.Payload, "connection_id")

	switch cmd.Command {
	case "detect_and_diagnose", "full_diagnostic":
		response, err = runFullDiagnostic(platform, connectionID)
	default:
		err = fmt.Errorf("comando não suportado: %s", cmd.Command)
	}

	payload := map[string]interface{}{
		"action":     "complete_command",
		"command_id": cmd.ID,
		"ok":         err == nil,
	}

	if err != nil {
		payload["error"] = err.Error()
	} else {
		response.DurationMS = time.Since(start).Milliseconds()
		response.Bridge = map[string]interface{}{
			"version":      bridgeVersion,
			"platform":     platformName(),
			"capabilities": capabilities(),
		}
		payload["response"] = response
	}

	var res map[string]interface{}
	_ = post(cfg.StationToken, payload, &res)
}

func runFullDiagnostic(platform, connectionID string) (DiagnosticResponse, error) {
	platform = strings.ToLower(strings.TrimSpace(platform))
	connectionID = strings.TrimSpace(connectionID)

	if connectionID == "" {
		android, _ := androidDevices()
		ios, _ := iosDevices()
		total := len(android) + len(ios)
		if total == 0 {
			return DiagnosticResponse{}, errors.New("nenhum aparelho USB detectado")
		}
		if total > 1 {
			return DiagnosticResponse{}, fmt.Errorf("mais de um aparelho conectado (%d). selecione o slot/dispositivo no Liquida", total)
		}
		if len(android) == 1 {
			platform, connectionID = "android", android[0]
		} else {
			platform, connectionID = "ios", ios[0]
		}
	}

	key := platform + ":" + connectionID
	if !acquireTarget(key) {
		return DiagnosticResponse{}, errors.New("aparelho já está sendo diagnosticado nesta estação")
	}
	defer releaseTarget(key)

	slot := slotForKey(key)
	switch platform {
	case "android":
		if !containsString(mustAndroidDevices(), connectionID) {
			return DiagnosticResponse{}, errors.New("aparelho Android selecionado não está mais conectado")
		}
		resp, err := diagnoseAndroid(connectionID)
		resp.Device.Slot = slot
		return resp, err
	case "ios":
		if !containsString(mustIOSDevices(), connectionID) {
			return DiagnosticResponse{}, errors.New("iPhone/iPad selecionado não está mais conectado")
		}
		resp, err := diagnoseIOS(connectionID)
		resp.Device.Slot = slot
		return resp, err
	default:
		return DiagnosticResponse{}, fmt.Errorf("plataforma não suportada: %s", platform)
	}
}

func acquireTarget(key string) bool {
	activeMu.Lock()
	defer activeMu.Unlock()
	if activeTargets[key] {
		return false
	}
	activeTargets[key] = true
	return true
}

func releaseTarget(key string) {
	activeMu.Lock()
	delete(activeTargets, key)
	activeMu.Unlock()
}

func diagnoseAndroid(serial string) (DiagnosticResponse, error) {
	start := time.Now()
	propsOut, err := run("adb", "-s", serial, "shell", "getprop")
	if err != nil {
		return DiagnosticResponse{}, fmt.Errorf("ADB sem autorização ou indisponível: %w", err)
	}
	props := parseGetprop(propsOut)

	device := Device{
		Platform:     "android",
		ConnectionID: serial,
		Manufacturer: firstNonEmpty(props["ro.product.manufacturer"], props["ro.product.vendor.manufacturer"]),
		Brand:        firstNonEmpty(props["ro.product.brand"], props["ro.product.vendor.brand"]),
		Model:        firstNonEmpty(props["ro.product.model"], props["ro.product.vendor.model"]),
		Product:      firstNonEmpty(props["ro.product.name"], props["ro.product.device"]),
		OSVersion:    props["ro.build.version.release"],
		Serial:       serial,
		SerialSource: "adb",
		IMEIs:        []IMEI{},
		Raw:          map[string]interface{}{"build_fingerprint": props["ro.build.fingerprint"]},
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	tests := []Test{}
	addTest := func(t Test) {
		mu.Lock()
		tests = append(tests, t)
		mu.Unlock()
	}

	addTest(Test{Code: "usb_adb", Category: "conectividade", Label: "USB / ADB", Result: "pass", Source: "automatico"})
	addTest(Test{Code: "device_identity", Category: "hardware", Label: "Identificação de hardware", Result: "pass", Source: "automatico", Value: map[string]interface{}{"model": device.Model, "manufacturer": device.Manufacturer, "os": device.OSVersion}})

	wg.Add(6)

	go func() {
		defer wg.Done()
		t0 := time.Now()
		out, _ := run("adb", "-s", serial, "shell", "dumpsys", "battery")
		b := parseAndroidBattery(out)
		mu.Lock()
		device.Battery = b
		mu.Unlock()
		result := "pass"
		if b.Percentage == nil {
			result = "warning"
		}
		addTest(Test{Code: "battery_read", Category: "bateria", Label: "Leitura da bateria", Result: result, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Value: map[string]interface{}{"raw": compact(out, 1200)}})

		powered := strings.Contains(out, "USB powered: true") || strings.Contains(out, "AC powered: true") || strings.Contains(out, "Wireless powered: true")
		chargingResult := "warning"
		chargingDetails := "Alimentação externa não confirmada pelo Android."
		if powered {
			chargingResult = "pass"
			chargingDetails = "Alimentação externa detectada automaticamente."
		}
		addTest(Test{Code: "charging", Category: "bateria", Label: "Carga / alimentação", Result: chargingResult, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Details: chargingDetails})
	}()

	go func() {
		defer wg.Done()
		t0 := time.Now()
		out, _ := run("adb", "-s", serial, "shell", "df", "-k", "/data")
		storage := parseDFTotalKB(out)
		mu.Lock()
		device.StorageBytes = storage
		mu.Unlock()
		result := "pass"
		if storage <= 0 {
			result = "warning"
		}
		addTest(Test{Code: "storage", Category: "hardware", Label: "Armazenamento", Result: result, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Value: map[string]interface{}{"bytes": storage}})
	}()

	go func() {
		defer wg.Done()
		t0 := time.Now()
		out, _ := run("adb", "-s", serial, "shell", "dumpsys", "media.camera")
		count := countCameraReferences(out)
		result := "pass"
		if count == 0 {
			result = "warning"
		}
		addTest(Test{Code: "camera_detected", Category: "camera", Label: "Módulos de câmera detectados", Result: result, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Value: map[string]interface{}{"references": count}})
	}()

	go func() {
		defer wg.Done()
		t0 := time.Now()
		out, _ := run("adb", "-s", serial, "shell", "dumpsys", "sensorservice")
		count := countSensorLines(out)
		result := "pass"
		if count == 0 {
			result = "warning"
		}
		addTest(Test{Code: "sensors_detected", Category: "sensores", Label: "Sensores detectados", Result: result, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Value: map[string]interface{}{"count": count}})
	}()

	go func() {
		defer wg.Done()
		t0 := time.Now()
		imeis := collectAndroidIMEIs(serial, propsOut)
		mu.Lock()
		device.IMEIs = imeis
		mu.Unlock()
		if len(imeis) == 0 {
			addTest(Test{Code: "imei_collection", Category: "identificacao", Label: "Todos os IMEIs", Result: "manual_required", Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Details: "Android não expôs IMEI via ADB. Completar captura guiada no Liquida."})
		} else {
			addTest(Test{Code: "imei_collection", Category: "identificacao", Label: "Todos os IMEIs", Result: "pass", Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Value: map[string]interface{}{"count": len(imeis)}})
		}
	}()

	go func() {
		defer wg.Done()
		t0 := time.Now()
		features, _ := run("adb", "-s", serial, "shell", "pm", "list", "features")
		has := func(name string) bool { return strings.Contains(features, "feature:"+name) }
		addFeature := func(code, category, label, feature string) {
			result := "not_supported"
			details := "Recurso não declarado pelo aparelho."
			if has(feature) {
				result = "pass"
				details = "Hardware declarado pelo Android."
			}
			addTest(Test{Code: code, Category: category, Label: label, Result: result, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Details: details})
		}

		addFeature("wifi_hardware", "conectividade", "Wi-Fi disponível", "android.hardware.wifi")
		addFeature("bluetooth_hardware", "conectividade", "Bluetooth disponível", "android.hardware.bluetooth")
		addFeature("nfc_hardware", "conectividade", "NFC disponível", "android.hardware.nfc")
		addFeature("flash_hardware", "hardware", "Flash disponível", "android.hardware.camera.flash")
		addFeature("vibrator_hardware", "hardware", "Vibração disponível", "android.hardware.vibrator")

		biometric := has("android.hardware.fingerprint") || has("android.hardware.biometrics.face") || has("android.hardware.biometrics")
		bioResult := "not_supported"
		bioDetails := "Nenhum hardware biométrico declarado."
		if biometric {
			bioResult = "pass"
			bioDetails = "Hardware biométrico detectado automaticamente."
		}
		addTest(Test{Code: "biometric_hardware", Category: "seguranca", Label: "Hardware biométrico", Result: bioResult, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Details: bioDetails})

		audioOut, audioErr := run("adb", "-s", serial, "shell", "dumpsys", "audio")
		audioResult := "warning"
		audioDetails := "Não foi possível validar o serviço de áudio."
		if audioErr == nil && strings.TrimSpace(audioOut) != "" {
			audioResult = "pass"
			audioDetails = "Serviço de áudio Android respondeu normalmente."
		}
		addTest(Test{Code: "audio_stack", Category: "audio", Label: "Subsistema de áudio", Result: audioResult, Source: "automatico", DurationMS: time.Since(t0).Milliseconds(), Details: audioDetails})
	}()

	wg.Wait()

	manual := []Test{
		{Code: "display_visual", Category: "tela", Label: "Display / pixels / manchas", Result: "manual_required", Source: "guiado"},
		{Code: "touch_full", Category: "tela", Label: "Touch em toda a área", Result: "manual_required", Source: "guiado"},
		{Code: "microphone_functional", Category: "audio", Label: "Microfone funcional", Result: "manual_required", Source: "guiado"},
		{Code: "speaker_functional", Category: "audio", Label: "Alto-falante funcional", Result: "manual_required", Source: "guiado"},
		{Code: "camera_functional", Category: "camera", Label: "Câmeras — imagem e foco", Result: "manual_required", Source: "guiado"},
		{Code: "biometrics", Category: "seguranca", Label: "Biometria / reconhecimento facial", Result: "manual_required", Source: "guiado"},
		{Code: "parts_history", Category: "pecas", Label: "Peças substituídas / não genuínas", Result: "manual_required", Source: "guiado", Details: "Confirmar histórico/alertas de componentes quando o fabricante não expuser via interface técnica."},
		{Code: "buttons", Category: "hardware", Label: "Botões físicos", Result: "manual_required", Source: "guiado"},
	}
	tests = append(tests, manual...)
	sort.Slice(tests, func(i, j int) bool { return tests[i].Category+tests[i].Label < tests[j].Category+tests[j].Label })

	return DiagnosticResponse{Device: device, Tests: tests, DurationMS: time.Since(start).Milliseconds()}, nil
}

func diagnoseIOS(udid string) (DiagnosticResponse, error) {
	start := time.Now()

	_, _ = run("idevicepair", "-u", udid, "pair")

	infoXML, err := run("ideviceinfo", "-u", udid, "-x")
	if err != nil {
		return DiagnosticResponse{}, fmt.Errorf("iPhone não pareado/autorizado: %w", err)
	}
	info, err := plistJSON(infoXML)
	if err != nil {
		return DiagnosticResponse{}, err
	}

	device := Device{
		Platform:     "ios",
		ConnectionID: udid,
		Manufacturer: "Apple",
		Brand:        "Apple",
		Model:        stringValue(info["ProductType"]),
		Product:      stringValue(info["DeviceClass"]),
		OSVersion:    stringValue(info["ProductVersion"]),
		Serial:       stringValue(info["SerialNumber"]),
		SerialSource: "lockdown",
		UDID:         firstNonEmpty(stringValue(info["UniqueDeviceID"]), udid),
		MEID:         stringValue(info["MobileEquipmentIdentifier"]),
		EID:          stringValue(info["EID"]),
		IMEIs:        []IMEI{},
		Raw:          map[string]interface{}{"build_version": info["BuildVersion"], "model_number": info["ModelNumber"]},
	}

	imeiCandidates := []struct {
		Key  string
		Slot int
	}{
		{"InternationalMobileEquipmentIdentity", 1},
		{"InternationalMobileEquipmentIdentity2", 2},
	}
	for _, c := range imeiCandidates {
		v := digitsOnly(stringValue(info[c.Key]))
		if validIMEI(v) {
			device.IMEIs = append(device.IMEIs, IMEI{Value: v, Slot: c.Slot, Source: "lockdown", Confidence: "high"})
		}
	}

	tests := []Test{
		{Code: "usb_pairing", Category: "conectividade", Label: "USB / Pareamento", Result: "pass", Source: "automatico"},
		{Code: "device_identity", Category: "identificacao", Label: "Identificação do aparelho", Result: "pass", Source: "automatico"},
	}

	diskXML, _ := run("ideviceinfo", "-u", udid, "-q", "com.apple.disk_usage", "-x")
	if disk, err := plistJSON(diskXML); err == nil {
		device.StorageBytes = int64Value(firstNonNil(disk["TotalDiskCapacity"], disk["TotalDataCapacity"]))
		result := "pass"
		if device.StorageBytes <= 0 {
			result = "warning"
		}
		tests = append(tests, Test{Code: "storage", Category: "hardware", Label: "Armazenamento", Result: result, Source: "automatico", Value: map[string]interface{}{"bytes": device.StorageBytes}})
	}

	gas, _ := run("idevicediagnostics", "-u", udid, "diagnostics", "GasGauge")
	if diag, err := plistJSON(gas); err == nil {
		device.Battery = parseIOSBattery(diag)
		tests = append(tests, Test{Code: "battery_diagnostics", Category: "bateria", Label: "Diagnóstico da bateria", Result: "pass", Source: "automatico", Value: map[string]interface{}{"available": true}})
	} else {
		tests = append(tests, Test{Code: "battery_diagnostics", Category: "bateria", Label: "Diagnóstico da bateria", Result: "warning", Source: "automatico", Details: "GasGauge não disponível nesta versão/estado do iOS."})
	}

	if len(device.IMEIs) == 0 {
		tests = append(tests, Test{Code: "imei_collection", Category: "identificacao", Label: "Todos os IMEIs", Result: "manual_required", Source: "automatico", Details: "IMEI não exposto pelo serviço de pareamento."})
	} else {
		tests = append(tests, Test{Code: "imei_collection", Category: "identificacao", Label: "Todos os IMEIs", Result: "pass", Source: "automatico", Value: map[string]interface{}{"count": len(device.IMEIs)}})
	}

	tests = append(tests,
		Test{Code: "display_visual", Category: "tela", Label: "Display / pixels / manchas", Result: "manual_required", Source: "guiado"},
		Test{Code: "touch_full", Category: "tela", Label: "Touch em toda a área", Result: "manual_required", Source: "guiado"},
		Test{Code: "microphone_functional", Category: "audio", Label: "Microfones", Result: "manual_required", Source: "guiado"},
		Test{Code: "speaker_functional", Category: "audio", Label: "Alto-falantes", Result: "manual_required", Source: "guiado"},
		Test{Code: "camera_functional", Category: "camera", Label: "Câmeras — imagem e foco", Result: "manual_required", Source: "guiado"},
		Test{Code: "biometrics", Category: "seguranca", Label: "Face ID / Touch ID", Result: "manual_required", Source: "guiado"},
		Test{Code: "parts_history", Category: "pecas", Label: "Histórico de Peças e Serviço", Result: "manual_required", Source: "guiado", Details: "Validar Tela, Bateria, Câmera e Face ID/TrueDepth quando exibidos pelo iOS."},
		Test{Code: "buttons", Category: "hardware", Label: "Botões físicos", Result: "manual_required", Source: "guiado"},
		Test{Code: "charging", Category: "energia", Label: "Carga física", Result: "manual_required", Source: "guiado"},
	)

	return DiagnosticResponse{Device: device, Tests: tests, DurationMS: time.Since(start).Milliseconds()}, nil
}


func detectedDevices() ([]ConnectedDevice, error) {
	android, aerr := androidDevices()
	ios, ierr := iosDevices()
	if aerr != nil && ierr != nil {
		return nil, fmt.Errorf("falha ao detectar USB: android=%v ios=%v", aerr, ierr)
	}

	type rawDevice struct{ platform, id string }
	raw := make([]rawDevice, 0, len(android)+len(ios))
	for _, id := range android {
		raw = append(raw, rawDevice{"android", id})
	}
	for _, id := range ios {
		raw = append(raw, rawDevice{"ios", id})
	}
	sort.Slice(raw, func(i, j int) bool { return raw[i].platform+raw[i].id < raw[j].platform+raw[j].id })

	seen := map[string]bool{}
	for _, d := range raw {
		seen[d.platform+":"+d.id] = true
	}
	refreshSlots(seen)

	out := make([]ConnectedDevice, 0, len(raw))
	for _, d := range raw {
		item := ConnectedDevice{Platform: d.platform, ConnectionID: d.id, Slot: slotForKey(d.platform + ":" + d.id), Ready: true}
		if d.platform == "android" {
			model, err := run("adb", "-s", d.id, "shell", "getprop", "ro.product.model")
			manufacturer, _ := run("adb", "-s", d.id, "shell", "getprop", "ro.product.manufacturer")
			item.Model = strings.TrimSpace(model)
			item.Manufacturer = strings.TrimSpace(manufacturer)
			if err != nil {
				item.Ready = false
				item.Note = "autorize a Depuração USB neste aparelho"
			}
		} else {
			item.Manufacturer = "Apple"
			model, err := run("ideviceinfo", "-u", d.id, "-k", "ProductType")
			serial, _ := run("ideviceinfo", "-u", d.id, "-k", "SerialNumber")
			item.Model = strings.TrimSpace(model)
			item.Serial = strings.TrimSpace(serial)
			if err != nil {
				item.Ready = false
				item.Note = "desbloqueie o iPhone e toque em Confiar"
			}
		}
		out = append(out, item)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Slot < out[j].Slot })
	return out, nil
}

func refreshSlots(seen map[string]bool) {
	slotMu.Lock()
	defer slotMu.Unlock()
	for key := range slotByDevice {
		if !seen[key] {
			delete(slotByDevice, key)
		}
	}
	used := map[int]bool{}
	for _, s := range slotByDevice {
		used[s] = true
	}
	keys := make([]string, 0, len(seen))
	for key := range seen {
		if _, ok := slotByDevice[key]; !ok {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		for slot := 1; slot <= maxConcurrentDiagnostics; slot++ {
			if !used[slot] {
				slotByDevice[key] = slot
				used[slot] = true
				break
			}
		}
	}
}

func slotForKey(key string) int {
	slotMu.Lock()
	defer slotMu.Unlock()
	return slotByDevice[key]
}

func androidDevices() ([]string, error) {
	if !toolExists("adb") {
		return nil, nil
	}
	out, err := run("adb", "devices")
	if err != nil {
		return nil, err
	}
	var list []string
	sc := bufio.NewScanner(strings.NewReader(out))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) >= 2 && f[1] == "device" {
			list = append(list, f[0])
		}
	}
	return list, nil
}

func mustAndroidDevices() []string {
	v, _ := androidDevices()
	return v
}

func iosDevices() ([]string, error) {
	if !toolExists("idevice_id") {
		return nil, nil
	}
	out, err := run("idevice_id", "-l")
	if err != nil {
		return nil, err
	}
	var list []string
	for _, line := range strings.Split(out, "\n") {
		v := strings.TrimSpace(line)
		if v != "" {
			list = append(list, v)
		}
	}
	return list, nil
}

func mustIOSDevices() []string {
	v, _ := iosDevices()
	return v
}

func collectAndroidIMEIs(serial, propsOut string) []IMEI {
	type source struct {
		name       string
		confidence string
		output     string
	}
	sources := []source{{"getprop", "medium", propsOut}}

	cmds := []struct {
		name       string
		confidence string
		args       []string
	}{
		{"ril_imei", "high", []string{"-s", serial, "shell", "getprop", "ril.gsm.imei"}},
		{"persist_radio_imei", "high", []string{"-s", serial, "shell", "getprop", "persist.radio.imei"}},
		{"oem_imei1", "high", []string{"-s", serial, "shell", "getprop", "ro.ril.oem.imei1"}},
		{"oem_imei2", "high", []string{"-s", serial, "shell", "getprop", "ro.ril.oem.imei2"}},
		{"iphonesubinfo", "high", []string{"-s", serial, "shell", "dumpsys", "iphonesubinfo"}},
	}

	for _, c := range cmds {
		out, _ := run("adb", c.args...)
		sources = append(sources, source{c.name, c.confidence, out})
	}

	re := regexp.MustCompile(`\b[0-9]{15}\b`)
	seen := map[string]IMEI{}
	for _, s := range sources {
		for _, v := range re.FindAllString(s.output, -1) {
			if !validIMEI(v) {
				continue
			}
			if _, ok := seen[v]; !ok {
				seen[v] = IMEI{Value: v, Source: s.name, Confidence: s.confidence}
			}
		}
	}

	values := make([]IMEI, 0, len(seen))
	for _, v := range seen {
		values = append(values, v)
	}
	sort.Slice(values, func(i, j int) bool { return values[i].Value < values[j].Value })
	for i := range values {
		values[i].Slot = i + 1
	}
	return values
}

func validIMEI(v string) bool {
	if len(v) != 15 {
		return false
	}
	sum := 0
	for i, r := range v {
		n := int(r - '0')
		if n < 0 || n > 9 {
			return false
		}
		if i%2 == 1 {
			n *= 2
			if n > 9 {
				n -= 9
			}
		}
		sum += n
	}
	return sum%10 == 0
}

func parseAndroidBattery(out string) Battery {
	vals := map[string]string{}
	for _, line := range strings.Split(out, "\n") {
		if i := strings.Index(line, ":"); i > 0 {
			vals[strings.TrimSpace(line[:i])] = strings.TrimSpace(line[i+1:])
		}
	}
	var b Battery
	if level, err := strconv.ParseFloat(vals["level"], 64); err == nil {
		scale := 100.0
		if s, err := strconv.ParseFloat(vals["scale"], 64); err == nil && s > 0 {
			scale = s
		}
		p := level / scale * 100
		b.Percentage = &p
	}
	if temp, err := strconv.ParseFloat(vals["temperature"], 64); err == nil {
		t := temp / 10
		b.TemperatureC = &t
	}
	b.Status = vals["status"]
	return b
}

func parseIOSBattery(m map[string]interface{}) Battery {
	var b Battery
	if v := floatValue(firstNonNil(m["BatteryCurrentCapacity"], m["CurrentCapacity"])); v > 0 {
		b.Percentage = &v
	}
	design := floatValue(firstNonNil(m["DesignCapacity"], m["NominalChargeCapacity"]))
	full := floatValue(firstNonNil(m["FullChargeCapacity"], m["AppleRawMaxCapacity"]))
	if design > 0 && full > 0 {
		h := full / design * 100
		b.HealthPercentage = &h
	}
	if c := int(int64Value(firstNonNil(m["CycleCount"], m["BatteryCycleCount"]))); c > 0 {
		b.CycleCount = &c
	}
	return b
}

func parseGetprop(out string) map[string]string {
	re := regexp.MustCompile(`^\[([^]]+)\]: \[(.*)\]$`)
	m := map[string]string{}
	for _, line := range strings.Split(out, "\n") {
		if x := re.FindStringSubmatch(strings.TrimSpace(line)); len(x) == 3 {
			m[x[1]] = x[2]
		}
	}
	return m
}

func parseDFTotalKB(out string) int64 {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) < 2 {
		return 0
	}
	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 2 {
		return 0
	}
	v, _ := strconv.ParseInt(fields[1], 10, 64)
	if v <= 0 {
		return 0
	}
	return v * 1024
}

func countCameraReferences(out string) int {
	seen := map[string]bool{}
	re := regexp.MustCompile(`(?i)camera\\s+id\\s*[:=]?\\s*([0-9]+)`)
	for _, m := range re.FindAllStringSubmatch(out, -1) {
		if len(m) > 1 {
			seen[m[1]] = true
		}
	}
	if len(seen) > 0 {
		return len(seen)
	}

	reCount := regexp.MustCompile(`(?i)number of camera devices\\s*:\\s*([0-9]+)`)
	if m := reCount.FindStringSubmatch(out); len(m) > 1 {
		if n, err := strconv.Atoi(m[1]); err == nil {
			return n
		}
	}
	return 0
}

func countSensorLines(out string) int {
	count := 0
	for _, line := range strings.Split(out, "\n") {
		l := strings.TrimSpace(line)
		if strings.Contains(l, "handle=") || strings.Contains(l, "sensor") && strings.Contains(l, "type=") {
			count++
		}
	}
	return count
}

func plistJSON(input string) (map[string]interface{}, error) {
	if strings.TrimSpace(input) == "" {
		return nil, errors.New("plist vazio")
	}
	dec := xml.NewDecoder(strings.NewReader(input))
	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		if start, ok := tok.(xml.StartElement); ok && start.Name.Local == "dict" {
			return parsePlistDict(dec)
		}
	}
}

func parsePlistDict(dec *xml.Decoder) (map[string]interface{}, error) {
	out := map[string]interface{}{}
	var key string
	for {
		tok, err := dec.Token()
		if err != nil {
			return nil, err
		}
		switch t := tok.(type) {
		case xml.StartElement:
			if t.Name.Local == "key" {
				var s string
				if err := dec.DecodeElement(&s, &t); err != nil {
					return nil, err
				}
				key = s
				continue
			}
			if key != "" {
				v, err := parsePlistValue(dec, t)
				if err != nil {
					return nil, err
				}
				out[key] = v
				key = ""
			}
		case xml.EndElement:
			if t.Name.Local == "dict" {
				return out, nil
			}
		}
	}
}

func parsePlistValue(dec *xml.Decoder, start xml.StartElement) (interface{}, error) {
	switch start.Name.Local {
	case "dict":
		return parsePlistDict(dec)
	case "array":
		arr := []interface{}{}
		for {
			tok, err := dec.Token()
			if err != nil {
				return nil, err
			}
			switch t := tok.(type) {
			case xml.StartElement:
				v, err := parsePlistValue(dec, t)
				if err != nil {
					return nil, err
				}
				arr = append(arr, v)
			case xml.EndElement:
				if t.Name.Local == "array" {
					return arr, nil
				}
			}
		}
	case "true":
		if err := dec.Skip(); err != nil { return nil, err }
		return true, nil
	case "false":
		if err := dec.Skip(); err != nil { return nil, err }
		return false, nil
	case "integer":
		var s string
		if err := dec.DecodeElement(&s, &start); err != nil { return nil, err }
		n, _ := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
		return n, nil
	case "real":
		var s string
		if err := dec.DecodeElement(&s, &start); err != nil { return nil, err }
		n, _ := strconv.ParseFloat(strings.TrimSpace(s), 64)
		return n, nil
	default:
		var s string
		if err := dec.DecodeElement(&s, &start); err != nil { return nil, err }
		return s, nil
	}
}

func post(token string, payload interface{}, target interface{}) error {
	b, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("x-station-token", token)
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return fmt.Errorf("HTTP %d: %s", resp.StatusCode, compact(string(data), 500))
	}
	if target != nil {
		return json.Unmarshal(data, target)
	}
	return nil
}

func run(name string, args ...string) (string, error) {
	ctx := exec.Command(name, args...)
	out, err := ctx.CombinedOutput()
	return string(out), err
}

func toolExists(name string) bool {
	_, err := exec.LookPath(name)
	return err == nil
}

func containsString(values []string, wanted string) bool {
	for _, v := range values {
		if v == wanted {
			return true
		}
	}
	return false
}

func stringFromMap(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprint(m[key]))
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func firstNonNil(values ...interface{}) interface{} {
	for _, v := range values {
		if v != nil {
			return v
		}
	}
	return nil
}

func stringValue(v interface{}) string {
	if v == nil {
		return ""
	}
	return fmt.Sprint(v)
}

func int64Value(v interface{}) int64 {
	switch x := v.(type) {
	case float64:
		return int64(x)
	case int64:
		return x
	case int:
		return int64(x)
	case string:
		n, _ := strconv.ParseInt(x, 10, 64)
		return n
	default:
		return 0
	}
}

func floatValue(v interface{}) float64 {
	switch x := v.(type) {
	case float64:
		return x
	case int:
		return float64(x)
	case int64:
		return float64(x)
	case string:
		n, _ := strconv.ParseFloat(x, 64)
		return n
	default:
		return 0
	}
}

func digitsOnly(v string) string {
	re := regexp.MustCompile(`[^0-9]`)
	return re.ReplaceAllString(v, "")
}

func compact(v string, max int) string {
	v = strings.TrimSpace(strings.ReplaceAll(v, "\x00", ""))
	if len(v) <= max {
		return v
	}
	return v[:max]
}
