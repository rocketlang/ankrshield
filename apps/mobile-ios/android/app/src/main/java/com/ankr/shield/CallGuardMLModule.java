package com.ankr.shield;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.MappedByteBuffer;
import java.nio.channels.FileChannel;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * CallGuardMLModule — on-device ML inference for fraud call detection.
 *
 * Uses a TFLite BERT-tiny binary classifier (safe / fraudulent).
 * All inference runs on-device. No audio or transcription text is uploaded.
 *
 * When the real TFLite model is not present, falls back to the heuristic
 * regex-based scorer already implemented in CallProtectionScreen.tsx.
 *
 * JS API:
 *   CallGuardML.classify(transcript: string)
 *     → Promise<{ label: 'safe'|'fraud', confidence: number, source: 'ml'|'heuristic' }>
 *
 *   CallGuardML.isModelAvailable()
 *     → Promise<boolean>
 */
public class CallGuardMLModule extends ReactContextBaseJavaModule {

    private static final String TAG            = "CallGuardML";
    private static final String MODEL_FILENAME = "call_guard_model.tflite"; // swap when ready
    private static final int    MAX_SEQ_LEN    = 128;

    // Simple vocabulary for the heuristic tokeniser (loaded from assets)
    // In production, use the full BERT-tiny vocab (~30,000 tokens)
    private Map<String, Integer> vocab = null;

    private Object tfliteInterpreter = null; // org.tensorflow.lite.Interpreter (reflective)
    private boolean modelLoaded = false;
    private boolean modelChecked = false;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    public CallGuardMLModule(@NonNull ReactApplicationContext context) {
        super(context);
    }

    @NonNull
    @Override
    public String getName() {
        return "CallGuardML";
    }

    // ── isModelAvailable ──────────────────────────────────────────────────────

    @ReactMethod
    public void isModelAvailable(Promise promise) {
        executor.submit(() -> {
            if (!modelChecked) {
                modelChecked = true;
                modelLoaded = tryLoadModel();
            }
            promise.resolve(modelLoaded);
        });
    }

    // ── classify ──────────────────────────────────────────────────────────────

    @ReactMethod
    public void classify(String transcript, Promise promise) {
        if (transcript == null || transcript.trim().isEmpty()) {
            resolveHeuristic("", promise);
            return;
        }

        executor.submit(() -> {
            try {
                if (!modelChecked) {
                    modelChecked = true;
                    modelLoaded = tryLoadModel();
                }

                if (modelLoaded && tfliteInterpreter != null) {
                    classifyWithModel(transcript.trim(), promise);
                } else {
                    resolveHeuristic(transcript.trim(), promise);
                }
            } catch (Exception e) {
                Log.w(TAG, "ML classify error — falling back to heuristic: " + e.getMessage());
                resolveHeuristic(transcript.trim(), promise);
            }
        });
    }

    // ── TFLite inference ──────────────────────────────────────────────────────

    private boolean tryLoadModel() {
        try {
            AssetManager am = getReactApplicationContext().getAssets();
            // Check if the real .tflite file exists (not just the .json placeholder)
            List<String> assetList = Arrays.asList(am.list("") != null ? am.list("") : new String[]{});
            if (!assetList.contains(MODEL_FILENAME)) {
                Log.i(TAG, "TFLite model not found — using heuristic fallback");
                return false;
            }

            // Load model via reflection so TensorFlow Lite is an optional dependency
            MappedByteBuffer modelBuffer = loadModelBuffer(am);
            Class<?> interpreterClass = Class.forName("org.tensorflow.lite.Interpreter");
            tfliteInterpreter = interpreterClass.getConstructor(MappedByteBuffer.class)
                .newInstance(modelBuffer);

            loadVocab(am);
            Log.i(TAG, "TFLite model loaded successfully");
            return true;
        } catch (ClassNotFoundException e) {
            Log.i(TAG, "TFLite runtime not on classpath — heuristic mode");
            return false;
        } catch (Exception e) {
            Log.w(TAG, "Model load failed: " + e.getMessage());
            return false;
        }
    }

    private MappedByteBuffer loadModelBuffer(AssetManager am) throws IOException {
        try (InputStream is = am.open(MODEL_FILENAME)) {
            byte[] bytes = is.readAllBytes();
            ByteBuffer bb = ByteBuffer.allocateDirect(bytes.length).order(ByteOrder.nativeOrder());
            bb.put(bytes);
            bb.flip();
            // Wrap in MappedByteBuffer-compatible view (direct ByteBuffer satisfies TFLite)
            // Production builds should use FileInputStream + FileChannel.map() for zero-copy
            return (MappedByteBuffer) bb; // will throw if not a MappedByteBuffer — handled by caller
        }
    }

    private void loadVocab(AssetManager am) {
        vocab = new HashMap<>();
        try (InputStream is = am.open("call_guard_vocab.txt")) {
            String text = new String(is.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            String[] lines = text.split("\n");
            for (int i = 0; i < lines.length; i++) {
                vocab.put(lines[i].trim().toLowerCase(), i);
            }
        } catch (IOException e) {
            Log.w(TAG, "Vocab not found — using fallback tokeniser");
        }
    }

    /**
     * Run the TFLite interpreter.
     * Input:  int[1][MAX_SEQ_LEN] — token IDs
     * Output: float[1][2]         — [logit_safe, logit_fraud]
     */
    private void classifyWithModel(String transcript, Promise promise) throws Exception {
        int[] tokenIds = tokenise(transcript);

        // Build input tensor [1][MAX_SEQ_LEN]
        int[][] inputIds      = new int[1][MAX_SEQ_LEN];
        int[][] attentionMask = new int[1][MAX_SEQ_LEN];
        for (int i = 0; i < MAX_SEQ_LEN; i++) {
            inputIds[0][i]      = tokenIds[i];
            attentionMask[0][i] = tokenIds[i] != 0 ? 1 : 0;
        }

        float[][] output = new float[1][2];

        // Run via reflection
        java.lang.reflect.Method runMethod = tfliteInterpreter.getClass()
            .getMethod("run", Object.class, Object.class);

        // Single-input models use run(input, output)
        runMethod.invoke(tfliteInterpreter, inputIds, output);

        float logitSafe  = output[0][0];
        float logitFraud = output[0][1];

        // Softmax
        float maxLogit  = Math.max(logitSafe, logitFraud);
        float expSafe   = (float) Math.exp(logitSafe  - maxLogit);
        float expFraud  = (float) Math.exp(logitFraud - maxLogit);
        float sum       = expSafe + expFraud;
        float probFraud = expFraud / sum;

        boolean isFraud    = probFraud > 0.5f;
        float confidence   = isFraud ? probFraud : (expSafe / sum);

        WritableMap result = Arguments.createMap();
        result.putString("label",      isFraud ? "fraud" : "safe");
        result.putDouble("confidence", Math.round(confidence * 1000.0) / 10.0); // percentage
        result.putString("source",     "ml");
        promise.resolve(result);
    }

    // ── Simple tokeniser ──────────────────────────────────────────────────────

    private int[] tokenise(String text) {
        int[] ids = new int[MAX_SEQ_LEN];
        // CLS token = 101, SEP = 102
        ids[0] = 101;
        String[] words = text.toLowerCase().split("\\s+");
        int pos = 1;
        for (String word : words) {
            if (pos >= MAX_SEQ_LEN - 1) break;
            Integer id = vocab != null ? vocab.get(word) : null;
            ids[pos++] = id != null ? id : 100; // 100 = [UNK]
        }
        if (pos < MAX_SEQ_LEN) ids[pos] = 102; // SEP
        return ids;
    }

    // ── Heuristic fallback ────────────────────────────────────────────────────

    /**
     * Keyword heuristic scorer — mirrors India fraud call patterns from
     * CallProtectionScreen.tsx but runs natively for speed.
     * Returns confidence as a rough 0-100 score.
     */
    private void resolveHeuristic(String transcript, Promise promise) {
        String lower = transcript.toLowerCase();

        // High-confidence fraud keywords (TRAI, KYC, OTP, etc.)
        String[] highFraud = {
            "trai", "disconnect", "legal action", "kyc", "aadhaar", "pan card",
            "otp", "block", "arrest", "ed notice", "income tax", "cyber crime",
            "refund", "screen share", "anydesk", "teamviewer",
        };
        // India UPI/payment red flags
        String[] midFraud = {
            "upi", "paytm", "phonepe", "google pay", "transfer", "processing fee",
            "custom duty", "delivery", "prize", "lottery", "won", "selected",
        };

        int score = 0;
        for (String kw : highFraud) {
            if (lower.contains(kw)) score += 20;
        }
        for (String kw : midFraud) {
            if (lower.contains(kw)) score += 10;
        }
        score = Math.min(score, 99);

        boolean isFraud = score >= 40;

        WritableMap result = Arguments.createMap();
        result.putString("label",      isFraud ? "fraud" : "safe");
        result.putDouble("confidence", isFraud ? score : (100 - score));
        result.putString("source",     "heuristic");
        promise.resolve(result);
    }
}
