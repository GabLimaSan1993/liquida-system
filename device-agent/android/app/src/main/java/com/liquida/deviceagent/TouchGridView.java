package com.liquida.deviceagent;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.view.MotionEvent;
import android.view.View;

public class TouchGridView extends View {
    public interface Listener {
        void onCoverage(float coverage);
    }

    private final int cols = 6;
    private final int rows = 10;
    private final boolean[][] hit = new boolean[rows][cols];
    private final Paint fillPaint = new Paint();
    private final Paint linePaint = new Paint();
    private final Listener listener;
    private int touched = 0;
    private float lastX = -1f;
    private float lastY = -1f;

    public TouchGridView(Context context, Listener listener) {
        super(context);
        this.listener = listener;
        setBackgroundColor(Color.rgb(15, 23, 42));
        fillPaint.setColor(Color.rgb(34, 197, 94));
        fillPaint.setAlpha(150);
        linePaint.setColor(Color.rgb(148, 163, 184));
        linePaint.setStrokeWidth(2f);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float cw = getWidth() / (float) cols;
        float ch = getHeight() / (float) rows;

        for (int r = 0; r < rows; r++) {
            for (int c = 0; c < cols; c++) {
                if (hit[r][c]) {
                    canvas.drawRect(c * cw, r * ch, (c + 1) * cw, (r + 1) * ch, fillPaint);
                }
            }
        }

        for (int c = 1; c < cols; c++) {
            canvas.drawLine(c * cw, 0, c * cw, getHeight(), linePaint);
        }
        for (int r = 1; r < rows; r++) {
            canvas.drawLine(0, r * ch, getWidth(), r * ch, linePaint);
        }
    }

    private void mark(float x, float y) {
        if (getWidth() <= 0 || getHeight() <= 0) return;
        int c = Math.max(0, Math.min(cols - 1, (int) (x / getWidth() * cols)));
        int r = Math.max(0, Math.min(rows - 1, (int) (y / getHeight() * rows)));
        if (!hit[r][c]) {
            hit[r][c] = true;
            touched++;
            float coverage = touched / (float) (rows * cols);
            if (listener != null) listener.onCoverage(coverage);
            invalidate();
        }
    }

    private void markLine(float x1, float y1, float x2, float y2) {
        float dx = x2 - x1;
        float dy = y2 - y1;
        float distance = (float) Math.sqrt(dx * dx + dy * dy);
        int steps = Math.max(1, (int) (distance / 12f));
        for (int i = 0; i <= steps; i++) {
            float p = i / (float) steps;
            mark(x1 + dx * p, y1 + dy * p);
        }
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        float x = event.getX();
        float y = event.getY();

        if (event.getAction() == MotionEvent.ACTION_DOWN) {
            lastX = x;
            lastY = y;
            mark(x, y);
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_MOVE) {
            if (lastX >= 0) markLine(lastX, lastY, x, y);
            lastX = x;
            lastY = y;
            return true;
        }

        if (event.getAction() == MotionEvent.ACTION_UP || event.getAction() == MotionEvent.ACTION_CANCEL) {
            if (lastX >= 0) markLine(lastX, lastY, x, y);
            lastX = -1f;
            lastY = -1f;
            return true;
        }

        return true;
    }
}
