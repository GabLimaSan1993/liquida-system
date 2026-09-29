package com.liquida.deviceagent;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.SurfaceTexture;
import android.hardware.camera2.*;
import android.os.Handler;
import android.os.Looper;
import android.view.Surface;
import android.view.TextureView;
import android.widget.FrameLayout;
import java.util.Collections;

public class CameraPreviewView extends FrameLayout {
    public interface Listener {
        void onReady();
        void onError(String message);
    }

    private final int lensFacing;
    private final Listener listener;
    private final CameraManager manager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final TextureView textureView;

    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private Surface previewSurface;

    public CameraPreviewView(Context context, int lensFacing, Listener listener) {
        super(context);
        this.lensFacing = lensFacing;
        this.listener = listener;
        this.manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);

        textureView = new TextureView(context);
        addView(textureView, new FrameLayout.LayoutParams(
                LayoutParams.MATCH_PARENT,
                LayoutParams.MATCH_PARENT
        ));

        textureView.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture surface, int width, int height) {
                open();
            }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture surface, int width, int height) {}
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture surface) {
                close();
                return true;
            }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture surface) {}
        });

        if (textureView.isAvailable()) open();
    }

    private String cameraId() throws Exception {
        for (String id : manager.getCameraIdList()) {
            Integer facing = manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING);
            if (facing != null && facing == lensFacing) return id;
        }
        return null;
    }

    private void open() {
        try {
            if (getContext().checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                listener.onError("Permissão de câmera não concedida.");
                return;
            }

            String id = cameraId();
            if (id == null) {
                listener.onError("Câmera não encontrada.");
                return;
            }

            manager.openCamera(id, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice camera) {
                    cameraDevice = camera;
                    createPreview();
                }

                @Override public void onDisconnected(CameraDevice camera) {
                    camera.close();
                    cameraDevice = null;
                    listener.onError("Câmera desconectada.");
                }

                @Override public void onError(CameraDevice camera, int error) {
                    camera.close();
                    cameraDevice = null;
                    listener.onError("Erro ao abrir câmera: " + error);
                }
            }, handler);
        } catch (Exception e) {
            listener.onError(e.getMessage() == null ? "Falha ao abrir câmera." : e.getMessage());
        }
    }

    private void createPreview() {
        try {
            SurfaceTexture st = textureView.getSurfaceTexture();
            if (st == null || cameraDevice == null) {
                listener.onError("Preview de câmera indisponível.");
                return;
            }

            st.setDefaultBufferSize(Math.max(1, textureView.getWidth()), Math.max(1, textureView.getHeight()));
            previewSurface = new Surface(st);

            CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            builder.addTarget(previewSurface);
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);

            cameraDevice.createCaptureSession(
                Collections.singletonList(previewSurface),
                new CameraCaptureSession.StateCallback() {
                    @Override public void onConfigured(CameraCaptureSession session) {
                        captureSession = session;
                        try {
                            session.setRepeatingRequest(builder.build(), null, handler);
                            listener.onReady();
                        } catch (Exception e) {
                            listener.onError("Falha no preview: " + e.getMessage());
                        }
                    }

                    @Override public void onConfigureFailed(CameraCaptureSession session) {
                        listener.onError("Falha ao configurar preview.");
                    }
                },
                handler
            );
        } catch (Exception e) {
            listener.onError(e.getMessage() == null ? "Falha no preview." : e.getMessage());
        }
    }

    public void close() {
        try {
            if (captureSession != null) captureSession.close();
        } catch (Exception ignored) {}
        captureSession = null;

        try {
            if (cameraDevice != null) cameraDevice.close();
        } catch (Exception ignored) {}
        cameraDevice = null;

        try {
            if (previewSurface != null) previewSurface.release();
        } catch (Exception ignored) {}
        previewSurface = null;
    }
}
