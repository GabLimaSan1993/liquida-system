package com.liquida.deviceagent;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(48, 96, 48, 48);
        root.setBackgroundColor(Color.rgb(15, 23, 42));

        TextView title = new TextView(this);
        title.setText("Liquida Diagnostics");
        title.setTextColor(Color.WHITE);
        title.setTextSize(28);
        title.setTypeface(null, 1);
        root.addView(title);

        TextView sub = new TextView(this);
        sub.setText("Diagnóstico automático do Android");
        sub.setTextColor(Color.rgb(148, 163, 184));
        sub.setTextSize(15);
        sub.setPadding(0, 16, 0, 36);
        root.addView(sub);

        ProgressBar progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        root.addView(progress, new LinearLayout.LayoutParams(-1, 18));

        TextView status = new TextView(this);
        status.setText("Executando testes...");
        status.setTextColor(Color.WHITE);
        status.setTextSize(18);
        status.setPadding(0, 36, 0, 0);
        root.addView(status);

        setContentView(root);

        new Thread(() -> {
            try {
                org.json.JSONArray tests = DiagnosticEngine.run(this);
                JSONObject report = new JSONObject();
                report.put("protocol", "liquida-device-agent/1");
                report.put("platform", "android");
                report.put("agent_version", "0.1.1");
                report.put("tests", tests);

                File out = new File(getFilesDir(), "result.json");
                try (FileOutputStream fos = new FileOutputStream(out, false)) {
                    fos.write(report.toString().getBytes(StandardCharsets.UTF_8));
                }

                runOnUiThread(() -> status.setText("Diagnóstico automático concluído"));
            } catch (Exception e) {
                runOnUiThread(() -> status.setText("Falha no diagnóstico"));
            }
        }).start();
    }
}
