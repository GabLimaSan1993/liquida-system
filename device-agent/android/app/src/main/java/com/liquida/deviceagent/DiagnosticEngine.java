package com.liquida.deviceagent;

import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.*;
import android.hardware.camera2.*;
import android.media.AudioManager;
import android.os.*;
import org.json.*;
import java.util.*;

public final class DiagnosticEngine {
    public static JSONArray run(Context ctx) {
        JSONArray tests = new JSONArray();
        try {
            Intent batt = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            JSONObject battery = new JSONObject();
            if (batt != null) {
                int level = batt.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = batt.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                battery.put("percentage", scale > 0 && level >= 0 ? Math.round(level * 100.0 / scale) : -1);
                battery.put("temperature_c", batt.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 0) / 10.0);
            }
            tests.put(test("battery_agent","bateria", batt != null ? "pass":"warning", battery));

            StatFs fs = new StatFs(Environment.getDataDirectory().getAbsolutePath());
            JSONObject storage = new JSONObject();
            storage.put("total_bytes", fs.getTotalBytes());
            storage.put("free_bytes", fs.getAvailableBytes());
            tests.put(test("storage_agent","hardware","pass",storage));

            SensorManager sm = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
            JSONObject sensors = new JSONObject();
            sensors.put("count", sm.getSensorList(Sensor.TYPE_ALL).size());
            tests.put(test("sensors_agent","sensores","pass",sensors));

            CameraManager cm = (CameraManager) ctx.getSystemService(Context.CAMERA_SERVICE);
            JSONObject cameras = new JSONObject();
            cameras.put("camera_count", cm.getCameraIdList().length);
            tests.put(test("camera_inventory_agent","camera",cm.getCameraIdList().length > 0 ? "pass":"fail",cameras));

            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            JSONObject audio = new JSONObject();
            audio.put("inputs", am.getDevices(AudioManager.GET_DEVICES_INPUTS).length);
            audio.put("outputs", am.getDevices(AudioManager.GET_DEVICES_OUTPUTS).length);
            tests.put(test("audio_inventory_agent","audio","pass",audio));

            PackageManager pm = ctx.getPackageManager();
            JSONObject conn = new JSONObject();
            conn.put("wifi", pm.hasSystemFeature(PackageManager.FEATURE_WIFI));
            conn.put("bluetooth", pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH));
            conn.put("nfc", pm.hasSystemFeature(PackageManager.FEATURE_NFC));
            tests.put(test("connectivity_inventory_agent","conectividade","pass",conn));
        } catch (Exception e) {
            try {
                JSONObject err = new JSONObject();
                err.put("message", e.getMessage());
                tests.put(test("agent_error","hardware","warning",err));
            } catch (Exception ignored) {}
        }
        return tests;
    }

    private static JSONObject test(String code, String block, String result, JSONObject value) throws Exception {
        JSONObject o = new JSONObject();
        o.put("code", code);
        o.put("block", block);
        o.put("result", result);
        o.put("source", "agent");
        o.put("value", value);
        return o;
    }

    private DiagnosticEngine() {}
}
