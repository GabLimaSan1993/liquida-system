package com.liquida.deviceagent;

import android.Manifest;
import android.app.Activity;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.hardware.biometrics.BiometricPrompt;
import android.hardware.camera2.CameraCharacteristics;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioManager;
import android.media.MediaRecorder;
import android.media.ToneGenerator;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Random;
import java.util.concurrent.Executor;

public class MainActivity extends Activity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final JSONArray tests = new JSONArray();
    private final Random random = new Random();

    private LinearLayout root;
    private CameraPreviewView cameraPreview;
    private boolean touchCompleted = false;
    private boolean buttonTestActive = false;
    private boolean volumeUpPressed = false;
    private boolean volumeDownPressed = false;
    private boolean cameraRearOk = false;
    private boolean cameraFrontOk = false;
    private String startedAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        startedAt = Instant.now().toString();
        buildRoot();
        showMessage("Liquida Diagnostics", "Executando diagnóstico automático...", true);

        new Thread(() -> {
            try {
                JSONArray automatic = DiagnosticEngine.run(this);
                synchronized (tests) {
                    for (int i = 0; i < automatic.length(); i++) tests.put(automatic.get(i));
                }
                runOnUiThread(this::startSpeakerTest);
            } catch (Exception e) {
                addTest("agent_error", "hardware", "warning", null, e.getMessage());
                runOnUiThread(this::startSpeakerTest);
            }
        }).start();
    }

    private void buildRoot() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(42, 72, 42, 42);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setBackgroundColor(Color.rgb(15, 23, 42));
        setContentView(root);
    }

    private TextView text(String value, float size, int color, boolean bold) {
        TextView tv = new TextView(this);
        tv.setText(value);
        tv.setTextSize(size);
        tv.setTextColor(color);
        tv.setGravity(Gravity.CENTER);
        if (bold) tv.setTypeface(null, 1);
        return tv;
    }

    private Button button(String label, View.OnClickListener listener) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(15);
        b.setAllCaps(false);
        b.setOnClickListener(listener);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        lp.setMargins(0, 12, 0, 0);
        b.setLayoutParams(lp);
        return b;
    }

    private void showMessage(String title, String message, boolean loading) {
        root.removeAllViews();
        root.setBackgroundColor(Color.rgb(15, 23, 42));

        TextView t = text(title, 27, Color.WHITE, true);
        root.addView(t);

        TextView s = text(message, 17, Color.rgb(203, 213, 225), false);
        LinearLayout.LayoutParams sp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        sp.setMargins(0, 22, 0, 0);
        s.setLayoutParams(sp);
        root.addView(s);

        if (loading) {
            TextView dots = text("•••", 28, Color.rgb(139, 92, 246), true);
            LinearLayout.LayoutParams dp = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
            );
            dp.setMargins(0, 24, 0, 0);
            dots.setLayoutParams(dp);
            root.addView(dots);
        }
    }

    private void addTest(String code, String block, String result, JSONObject value, String details) {
        try {
            JSONObject o = new JSONObject();
            o.put("code", code);
            o.put("block", block);
            o.put("result", result);
            o.put("source", "agent");
            o.put("value", value == null ? new JSONObject() : value);
            if (details != null) o.put("details", details);
            synchronized (tests) {
                tests.put(o);
            }
        } catch (Exception ignored) {}
    }

    private void startSpeakerTest() {
        showMessage("Áudio", "Ouça com atenção. O aparelho tocará de 1 a 3 sinais. Depois informe quantos ouviu.", false);
        TextView wait = text("Preparando som...", 15, Color.rgb(148, 163, 184), false);
        root.addView(wait);

        final int expected = 1 + random.nextInt(3);
        handler.postDelayed(() -> {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_MUSIC, 100);
            for (int i = 0; i < expected; i++) {
                final int delay = i * 420;
                handler.postDelayed(() -> tone.startTone(ToneGenerator.TONE_PROP_BEEP, 180), delay);
            }

            handler.postDelayed(() -> {
                tone.release();
                root.removeAllViews();
                root.setBackgroundColor(Color.rgb(15, 23, 42));
                root.addView(text("Áudio", 27, Color.WHITE, true));
                root.addView(text("Quantos sinais você ouviu?", 18, Color.rgb(203, 213, 225), false));

                for (int answer = 1; answer <= 3; answer++) {
                    final int selected = answer;
                    root.addView(button(String.valueOf(answer), v -> {
                        JSONObject value = new JSONObject();
                        try {
                            value.put("expected", expected);
                            value.put("answer", selected);
                        } catch (Exception ignored) {}
                        addTest(
                                "speaker_functional",
                                "audio",
                                selected == expected ? "pass" : "fail",
                                value,
                                selected == expected ? "Desafio sonoro reconhecido no aparelho." : "Resposta não correspondeu ao padrão reproduzido."
                        );
                        startMicrophoneTest();
                    }));
                }

                root.addView(button("Não ouvi", v -> {
                    addTest("speaker_functional", "audio", "fail", null, "Operador não ouviu o sinal reproduzido.");
                    startMicrophoneTest();
                }));
            }, expected * 420L + 250L);
        }, 900);
    }

    private void startMicrophoneTest() {
        showMessage("Microfone", "Ao tocar em iniciar, diga “LIQUIDA TESTE” normalmente por 2 segundos.", false);
        root.addView(button("Iniciar teste do microfone", v -> {
            showMessage("Microfone", "Fale agora: LIQUIDA TESTE", true);
            new Thread(() -> measureMicrophone()).start();
        }));
    }

    private void measureMicrophone() {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            addTest("microphone_functional", "audio", "warning", null, "Permissão de microfone não concedida ao Agent.");
            runOnUiThread(this::startDisplayTest);
            return;
        }

        AudioRecord record = null;
        try {
            int rate = 16000;
            int min = AudioRecord.getMinBufferSize(
                    rate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
            );
            int bufferSize = Math.max(min, 4096);
            record = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    rate,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize
            );

            if (record.getState() != AudioRecord.STATE_INITIALIZED) {
                throw new IllegalStateException("AudioRecord não inicializou.");
            }

            short[] buffer = new short[bufferSize / 2];
            long sumSq = 0;
            long samples = 0;
            long until = System.currentTimeMillis() + 2200;

            record.startRecording();
            while (System.currentTimeMillis() < until) {
                int n = record.read(buffer, 0, buffer.length);
                if (n > 0) {
                    for (int i = 0; i < n; i++) {
                        long x = buffer[i];
                        sumSq += x * x;
                    }
                    samples += n;
                }
            }
            record.stop();

            double rms = samples > 0 ? Math.sqrt(sumSq / (double) samples) : 0;
            JSONObject value = new JSONObject();
            value.put("rms", Math.round(rms));
            value.put("samples", samples);

            boolean ok = rms >= 220;
            addTest(
                    "microphone_functional",
                    "audio",
                    ok ? "pass" : "fail",
                    value,
                    ok ? "Sinal acústico capturado pelo microfone." : "Nível de áudio abaixo do limiar esperado."
            );
        } catch (Exception e) {
            addTest("microphone_functional", "audio", "fail", null, e.getMessage());
        } finally {
            if (record != null) {
                try { record.release(); } catch (Exception ignored) {}
            }
        }

        runOnUiThread(this::startDisplayTest);
    }

    private void startDisplayTest() {
        root.removeAllViews();
        root.setPadding(0, 0, 0, 0);

        TextView center = text("Observe manchas, linhas e pixels anormais.", 20, Color.WHITE, true);
        center.setGravity(Gravity.CENTER);
        root.addView(center, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
        ));

        int[] colors = new int[] {
                Color.WHITE,
                Color.RED,
                Color.GREEN,
                Color.BLUE,
                Color.BLACK
        };

        for (int i = 0; i < colors.length; i++) {
            final int idx = i;
            handler.postDelayed(() -> {
                root.setBackgroundColor(colors[idx]);
                center.setTextColor(idx == 0 ? Color.BLACK : Color.WHITE);
            }, i * 750L);
        }

        handler.postDelayed(() -> {
            root.setPadding(42, 72, 42, 42);
            showMessage("Tela", "Durante o ciclo de cores você viu manchas, linhas, pixels mortos ou defeito visual?", false);
            root.addView(button("Não, tela visualmente OK", v -> {
                addTest("display_visual", "tela", "pass", null, "Ciclo de cores validado no próprio aparelho.");
                startTouchTest();
            }));
            root.addView(button("Sim, há defeito visual", v -> {
                addTest("display_visual", "tela", "fail", null, "Operador identificou defeito visual durante o ciclo de cores.");
                startTouchTest();
            }));
        }, colors.length * 750L + 350L);
    }

    private void startTouchTest() {
        touchCompleted = false;
        root.removeAllViews();
        root.setPadding(24, 42, 24, 24);
        root.setBackgroundColor(Color.rgb(15, 23, 42));

        TextView title = text("Touch", 25, Color.WHITE, true);
        root.addView(title);

        TextView instruction = text("Passe o dedo pela malha. Ao cobrir 90% da tela, o teste termina sozinho.", 14, Color.rgb(203, 213, 225), false);
        root.addView(instruction);

        TextView coverageText = text("0%", 18, Color.rgb(139, 92, 246), true);
        root.addView(coverageText);

        TouchGridView grid = new TouchGridView(this, coverage -> {
            coverageText.setText(Math.round(coverage * 100) + "%");
            if (!touchCompleted && coverage >= 0.90f) {
                touchCompleted = true;
                JSONObject value = new JSONObject();
                try { value.put("coverage_pct", Math.round(coverage * 100)); } catch (Exception ignored) {}
                addTest("touch_full", "tela", "pass", value, "Malha touch coberta no próprio aparelho.");
                handler.postDelayed(this::startVibrationTest, 350);
            }
        });

        LinearLayout.LayoutParams gp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        );
        gp.setMargins(0, 16, 0, 0);
        grid.setLayoutParams(gp);
        root.addView(grid);

        root.addView(button("Há falha no touch", v -> {
            if (touchCompleted) return;
            touchCompleted = true;
            addTest("touch_full", "tela", "fail", null, "Operador identificou área sem resposta ao toque.");
            startVibrationTest();
        }));
    }

    private void startVibrationTest() {
        showMessage("Vibração", "O aparelho vai vibrar agora.", false);

        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        try {
            if (vibrator == null || !vibrator.hasVibrator()) {
                addTest("vibration_functional", "hardware", "not_supported", null, "Vibrador não disponível.");
                startRearCameraTest();
                return;
            }

            if (Build.VERSION.SDK_INT >= 26) {
                vibrator.vibrate(VibrationEffect.createOneShot(650, VibrationEffect.DEFAULT_AMPLITUDE));
            } else {
                vibrator.vibrate(650);
            }
        } catch (Exception e) {
            addTest("vibration_functional", "hardware", "warning", null, e.getMessage());
        }

        root.addView(button("Senti a vibração", v -> {
            addTest("vibration_functional", "hardware", "pass", null, "Vibração confirmada no aparelho.");
            startRearCameraTest();
        }));
        root.addView(button("Não vibrou", v -> {
            addTest("vibration_functional", "hardware", "fail", null, "Operador não percebeu vibração.");
            startRearCameraTest();
        }));
    }

    private void startRearCameraTest() {
        startCameraTest(CameraCharacteristics.LENS_FACING_BACK, "Câmera traseira", ok -> {
            cameraRearOk = ok;
            startFrontCameraTest();
        });
    }

    private void startFrontCameraTest() {
        startCameraTest(CameraCharacteristics.LENS_FACING_FRONT, "Câmera frontal", ok -> {
            cameraFrontOk = ok;
            JSONObject value = new JSONObject();
            try {
                value.put("rear_ok", cameraRearOk);
                value.put("front_ok", cameraFrontOk);
            } catch (Exception ignored) {}
            addTest(
                    "camera_functional",
                    "camera",
                    cameraRearOk && cameraFrontOk ? "pass" : "fail",
                    value,
                    "Preview traseiro e frontal validados no próprio aparelho."
            );
            startBiometricTest();
        });
    }

    private interface CameraDecision {
        void done(boolean ok);
    }

    private void startCameraTest(int facing, String title, CameraDecision decision) {
        if (cameraPreview != null) {
            cameraPreview.close();
            cameraPreview = null;
        }

        root.removeAllViews();
        root.setPadding(0, 0, 0, 0);
        root.setBackgroundColor(Color.BLACK);

        FrameLayout frame = new FrameLayout(this);
        root.addView(frame, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        final boolean[] decided = { false };

        cameraPreview = new CameraPreviewView(this, facing, new CameraPreviewView.Listener() {
            @Override public void onReady() {}

            @Override public void onError(String message) {
                if (decided[0]) return;
                decided[0] = true;
                if (cameraPreview != null) cameraPreview.close();
                addTest(
                        facing == CameraCharacteristics.LENS_FACING_BACK ? "camera_rear_preview" : "camera_front_preview",
                        "camera",
                        "fail",
                        null,
                        message
                );
                decision.done(false);
            }
        });
        frame.addView(cameraPreview, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        LinearLayout overlay = new LinearLayout(this);
        overlay.setOrientation(LinearLayout.VERTICAL);
        overlay.setPadding(28, 28, 28, 36);
        overlay.setBackgroundColor(Color.argb(185, 15, 23, 42));

        TextView header = text(title, 22, Color.WHITE, true);
        overlay.addView(header);
        overlay.addView(text("Confira imagem, foco e ausência de artefatos.", 14, Color.rgb(203, 213, 225), false));

        overlay.addView(button("Imagem OK", v -> {
            if (decided[0]) return;
            decided[0] = true;
            if (cameraPreview != null) cameraPreview.close();
            decision.done(true);
        }));

        overlay.addView(button("Falha na imagem", v -> {
            if (decided[0]) return;
            decided[0] = true;
            if (cameraPreview != null) cameraPreview.close();
            decision.done(false);
        }));

        FrameLayout.LayoutParams op = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        frame.addView(overlay, op);
    }

    private void startBiometricTest() {
        if (Build.VERSION.SDK_INT < 28) {
            addTest("biometrics", "seguranca", "not_supported", null, "BiometricPrompt não disponível nesta versão do Android.");
            startButtonTest();
            return;
        }

        showMessage("Biometria", "Use a digital/rosto cadastrado para validar o sensor. Se não houver biometria cadastrada, pule o teste.", false);
        root.addView(button("Testar biometria", v -> launchBiometricPrompt()));
        root.addView(button("Sem biometria cadastrada", v -> {
            addTest("biometrics", "seguranca", "not_supported", null, "Aparelho sem biometria disponível para autenticação funcional.");
            startButtonTest();
        }));
    }

    private void launchBiometricPrompt() {
        if (Build.VERSION.SDK_INT < 28) {
            addTest("biometrics", "seguranca", "not_supported", null, "Biometria não suportada.");
            startButtonTest();
            return;
        }

        Executor executor = getMainExecutor();
        final boolean[] finished = { false };

        BiometricPrompt prompt = new BiometricPrompt.Builder(this)
                .setTitle("Liquida Diagnostics")
                .setSubtitle("Validação funcional da biometria")
                .setDescription("Autentique no próprio aparelho.")
                .setNegativeButton("Pular", executor, (dialog, which) -> {
                    if (finished[0]) return;
                    finished[0] = true;
                    addTest("biometrics", "seguranca", "warning", null, "Teste biométrico pulado no aparelho.");
                    startButtonTest();
                })
                .build();

        prompt.authenticate(
                new CancellationSignal(),
                executor,
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        if (finished[0]) return;
                        finished[0] = true;
                        addTest("biometrics", "seguranca", "pass", null, "Autenticação biométrica concluída no próprio aparelho.");
                        startButtonTest();
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        if (finished[0]) return;
                        finished[0] = true;
                        String text = errString == null ? "Falha biométrica." : errString.toString();
                        addTest("biometrics", "seguranca", "warning", null, text);
                        startButtonTest();
                    }
                }
        );
    }

    private void startButtonTest() {
        buttonTestActive = true;
        volumeUpPressed = false;
        volumeDownPressed = false;

        showMessage("Botões físicos", "Pressione VOLUME + e depois VOLUME -. O teste termina automaticamente.", false);

        TextView status = text("Volume +: aguardando\nVolume -: aguardando", 18, Color.rgb(203, 213, 225), true);
        status.setTag("button-status");
        root.addView(status);

        root.addView(button("Há falha nos botões", v -> {
            if (!buttonTestActive) return;
            buttonTestActive = false;
            addTest("buttons", "hardware", "fail", null, "Operador identificou falha nos botões de volume.");
            finishDiagnostics();
        }));
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (buttonTestActive) {
            if (keyCode == KeyEvent.KEYCODE_VOLUME_UP) {
                volumeUpPressed = true;
            } else if (keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
                volumeDownPressed = true;
            } else {
                return super.onKeyDown(keyCode, event);
            }

            TextView status = root.findViewWithTag("button-status");
            if (status != null) {
                status.setText(
                        "Volume +: " + (volumeUpPressed ? "OK" : "aguardando") +
                        "\nVolume -: " + (volumeDownPressed ? "OK" : "aguardando")
                );
            }

            if (volumeUpPressed && volumeDownPressed) {
                buttonTestActive = false;
                addTest("buttons", "hardware", "pass", null, "Volume + e Volume - detectados fisicamente pelo Agent.");
                handler.postDelayed(this::finishDiagnostics, 250);
            }
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void finishDiagnostics() {
        if (cameraPreview != null) {
            cameraPreview.close();
            cameraPreview = null;
        }

        addTest(
                "parts_history",
                "pecas",
                "not_supported",
                null,
                "Histórico de peças não genuínas depende de interface específica do fabricante; não será convertido em checklist manual."
        );

        try {
            JSONObject report = new JSONObject();
            report.put("protocol", "liquida-device-agent/1");
            report.put("platform", "android");
            report.put("agent_version", "0.2.0");
            report.put("started_at", startedAt);
            report.put("finished_at", Instant.now().toString());
            synchronized (tests) {
                report.put("tests", tests);
            }

            File out = new File(getFilesDir(), "result.json");
            try (FileOutputStream fos = new FileOutputStream(out, false)) {
                fos.write(report.toString().getBytes(StandardCharsets.UTF_8));
            }

            showMessage(
                    "Triagem concluída",
                    "Os testes deste aparelho foram enviados ao Liquida. Você pode seguir para o próximo dispositivo.",
                    false
            );
            TextView ok = text("✓", 58, Color.rgb(34, 197, 94), true);
            root.addView(ok);
        } catch (Exception e) {
            showMessage("Falha ao concluir", e.getMessage() == null ? "Não foi possível gravar o resultado." : e.getMessage(), false);
        }
    }

    @Override
    protected void onDestroy() {
        if (cameraPreview != null) cameraPreview.close();
        super.onDestroy();
    }
}
