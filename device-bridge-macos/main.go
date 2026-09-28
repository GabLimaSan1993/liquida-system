package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"os/user"
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
	bridgeVersion = "0.1.0-lab"
	endpoint      = "https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/assurant-device-bridge"
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

var client = &http.Client{Timeout: 35 * time.Second}

func main() {
	pairCode := flag.String("pair", "", "Código de pareamento gerado no Liquida")
	flag.Parse()

	if runtime.GOOS != "darwin" {
		fmt.Fprintln(os.Stderr, "Liquida Device Bridge LAB requer macOS.")
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

func configPath() (string, error) {
	u, err := user.Current()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(u.HomeDir, "Library", "Application Support", "LiquidaBridge")
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
	return map[string]interface{}{
		"adb":                toolExists("adb"),
		"idevice_id":         toolExists("idevice_id"),
		"ideviceinfo":        toolExists("ideviceinfo"),
		"idevicediagnostics": toolExists("idevicediagnostics"),
		"plutil":             toolExists("plutil"),
		"goos":               runtime.GOOS,
		"goarch":             runtime.GOARCH,
	}
}

func pair(code string) error {
	host, _ := os.Hostname()
	payload := map[string]interface{}{
		"action":         "pair",
		"code":           strings.TrimSpace(strings.ToUpper(code)),
		"hostname":       host,
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
			"arch":           runtime.GOARCH,
			"bridge_version": bridgeVersion,
			"capabilities":   capabilities(),
		}
		var res map[string]interface{}
		_ = post(cfg.StationToken, payload, &res)
		time.Sleep(15 * time.Second)
	}
}

func pollLoop(cfg Config) {
	for {
		var res struct {
			OK      bool     `json:"ok"`
			Command *Command `json:"command"`
		}
		err := post(cfg.StationToken, map[string]interface{}{"action": "next_command"}, &res)
		if err != nil {
			time.Sleep(2 * time.Second)
			continue
		}
		if res.Command == nil {
			time.Sleep(700 * time.Millisecond)
			continue
		}

		handleCommand(cfg, *res.Command)
	}
}

func handleCommand(cfg Config, cmd Command) {
	start := time.Now()
	var response DiagnosticResponse
	var err error

	switch cmd.Command {
	case "detect_and_diagnose", "full_diagnostic":
		response, err = runFullDiagnostic()
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
			"capabilities": capabilities(),
		}
		payload["response"] = response
	}

	var res map[string]interface{}
	_ = post(cfg.StationToken, payload, &res)
}

func runFullDiagnostic() (DiagnosticResponse, error) {
	android, _ := androidDevices()
	ios, _ := iosDevices()

	total := len(android) + len(ios)
	if total == 0 {
		return DiagnosticResponse{}, errors.New("nenhum aparelho USB detectado")
	}
	if total > 1 {
		return DiagnosticResponse{}, fmt.Errorf("mais de um aparelho conectado (%d). mantenha somente o aparelho da triagem", total)
	}

	if len(android) == 1 {
		return diagnoseAndroid(android[0])
	}
	return diagnoseIOS(ios[0])
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

	wg.Add(5)

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
	}()

	go func() {
		defer wg.Done()
		t0 := time.Now()
		out, _ := run("adb", "-s", serial, "shell", "df", "-B1", "/data")
		storage := parseDFTotal(out)
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
		count := strings.Count(out, "Camera ID")
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

	wg.Wait()

	manual := []Test{
		{Code: "display_visual", Category: "tela", Label: "Display / pixels / manchas", Result: "manual_required", Source: "guiado"},
		{Code: "touch_full", Category: "tela", Label: "Touch em toda a área", Result: "manual_required", Source: "guiado"},
		{Code: "microphone_functional", Category: "audio", Label: "Microfone funcional", Result: "manual_required", Source: "guiado"},
		{Code: "speaker_functional", Category: "audio", Label: "Alto-falante funcional", Result: "manual_required", Source: "guiado"},
		{Code: "camera_functional", Category: "camera", Label: "Câmeras — imagem e foco", Result: "manual_required", Source: "guiado"},
		{Code: "biometrics", Category: "seguranca", Label: "Biometria / reconhecimento facial", Result: "manual_required", Source: "guiado"},
		{Code: "buttons", Category: "hardware", Label: "Botões físicos", Result: "manual_required", Source: "guiado"},
		{Code: "charging", Category: "energia", Label: "Carga física", Result: "manual_required", Source: "guiado"},
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
		Test{Code: "buttons", Category: "hardware", Label: "Botões físicos", Result: "manual_required", Source: "guiado"},
		Test{Code: "charging", Category: "energia", Label: "Carga física", Result: "manual_required", Source: "guiado"},
	)

	return DiagnosticResponse{Device: device, Tests: tests, DurationMS: time.Since(start).Milliseconds()}, nil
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

func parseDFTotal(out string) int64 {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) < 2 {
		return 0
	}
	fields := strings.Fields(lines[len(lines)-1])
	if len(fields) < 2 {
		return 0
	}
	v, _ := strconv.ParseInt(fields[1], 10, 64)
	return v
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

func plistJSON(xml string) (map[string]interface{}, error) {
	if strings.TrimSpace(xml) == "" {
		return nil, errors.New("plist vazio")
	}
	cmd := exec.Command("plutil", "-convert", "json", "-o", "-", "-")
	cmd.Stdin = strings.NewReader(xml)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return nil, fmt.Errorf("plutil: %s", strings.TrimSpace(string(out)))
	}
	var m map[string]interface{}
	if err := json.Unmarshal(out, &m); err != nil {
		return nil, err
	}
	return m, nil
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
